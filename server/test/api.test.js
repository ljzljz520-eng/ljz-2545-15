'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { createApp, openDb } = require('../src/server.js');
const { seed } = require('../src/seed.js');

let server, base;
before(async () => {
  server = createApp(seed(openDb(':memory:')));
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('路线列表支持筛选（共享查询状态同构）', async () => {
  const all = await (await fetch(`${base}/api/routes`)).json();
  assert.equal(all.routes.length, 3);
  const cycle = await (await fetch(`${base}/api/routes?category=cycle`)).json();
  assert.deepEqual(cycle.routes.map(r => r.id), ['lake-cycle']);
  const acc = await (await fetch(`${base}/api/routes?accessibleOnly=1`)).json();
  assert.ok(acc.routes.every(r => r.wheelchair_spots === r.poi_count));
});

test('点位文字与替代说明来自同一内容版本', async () => {
  const res = await fetch(`${base}/api/routes/riverside-walk`);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.version, 1);
  assert.ok(data.points.length > 0);
  for (const p of data.points) {
    assert.ok(p.name, '点位文字存在');
    for (const m of p.media) assert.ok(m.altText.length > 0, '替代说明与文字同版返回');
  }
});

test('点位懒加载分页保持同版', async () => {
  const page1 = await (await fetch(`${base}/api/routes/lake-cycle/points?offset=0&limit=2`)).json();
  const page2 = await (await fetch(`${base}/api/routes/lake-cycle/points?offset=2&limit=2`)).json();
  assert.equal(page1.version, page2.version);
  assert.equal(page1.total, 5);
  assert.equal(page1.points.length + page2.points.length, 4);
});

test('无障碍元数据可查询', async () => {
  const data = await (await fetch(`${base}/api/a11y/rw-1`)).json();
  assert.equal(data.wheelchair, true);
  assert.equal(data.tactilePaving, true);
  const miss = await fetch(`${base}/api/a11y/nonexistent`);
  assert.equal(miss.status, 404);
});

test('后端拒绝发布缺少必需替代说明的内容版', async () => {
  // 创建草稿：第二个点位的媒体缺替代说明
  const create = await fetch(`${base}/api/routes/riverside-walk/versions`, {
    method: 'POST',
    body: JSON.stringify({
      points: [
        { id: 'rw-1', name: '江湾观景台', description: '更新文字', media: [{ id: 'm-new-1', url: '/img/a.jpg', altText: '完整说明' }] },
        { id: 'rw-2', name: '柳荫休憩区', description: '更新文字', media: [{ id: 'm-new-2', url: '/img/b.jpg', altText: '' }] }
      ]
    })
  });
  const { versionId } = await create.json();
  assert.equal(create.status, 201);

  const pub = await fetch(`${base}/api/versions/${versionId}/publish`, { method: 'POST' });
  assert.equal(pub.status, 422, '缺少必需替代说明 → 拒绝发布');
  const body = await pub.json();
  assert.equal(body.errors[0].code, 'ALT_TEXT_REQUIRED');
  assert.equal(body.errors[0].poiId, 'rw-2');

  // 版本仍为草稿，未污染已发布内容
  const cur = await (await fetch(`${base}/api/routes/riverside-walk`)).json();
  assert.equal(cur.version, 1);
});

test('补全替代说明后允许发布', async () => {
  const create = await fetch(`${base}/api/routes/old-town-heritage/versions`, {
    method: 'POST',
    body: JSON.stringify({
      points: [{ id: 'oh-1', name: '古城门', description: '新描述', media: [{ id: 'm-ok', url: '/img/c.jpg', altText: '城门照片' }] }]
    })
  });
  const { versionId, version } = await create.json();
  const pub = await fetch(`${base}/api/versions/${versionId}/publish`, { method: 'POST' });
  assert.equal(pub.status, 200);
  assert.equal((await pub.json()).version, version);
});

test('偏好写入带版本：旧请求被拒绝（409），不能突然改变用户状态', async () => {
  const u = 'user-sync';
  // 第一次写入 v0→v1
  let r = await fetch(`${base}/api/prefs/${u}`, { method: 'PUT', body: JSON.stringify({ key: 'fontSize', value: 'large', expectedVersion: 0, deviceId: 'phone' }) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).version, 1);
  // 另一设备基于 v1 写入 → v2
  r = await fetch(`${base}/api/prefs/${u}`, { method: 'PUT', body: JSON.stringify({ key: 'fontSize', value: 'normal', expectedVersion: 1, deviceId: 'pad' }) });
  assert.equal((await r.json()).version, 2);
  // 旧请求（仍以为版本是 0）→ 409 拒绝
  r = await fetch(`${base}/api/prefs/${u}`, { method: 'PUT', body: JSON.stringify({ key: 'fontSize', value: 'xlarge', expectedVersion: 0, deviceId: 'phone' }) });
  assert.equal(r.status, 409);
  const prefs = (await (await fetch(`${base}/api/prefs/${u}`)).json()).prefs;
  assert.equal(prefs.fontSize.value, 'normal', '旧请求未能覆盖新值');
  assert.equal(prefs.fontSize.version, 2);
});

test('投稿缺少替代说明被拒绝', async () => {
  const bad = await fetch(`${base}/api/submissions`, {
    method: 'POST',
    body: JSON.stringify({ routeId: 'lake-cycle', title: '补充坡道信息', mediaAlt: '' })
  });
  assert.equal(bad.status, 422);
  assert.equal((await bad.json()).errors[0].code, 'ALT_TEXT_REQUIRED');

  const good = await fetch(`${base}/api/submissions`, {
    method: 'POST',
    body: JSON.stringify({ routeId: 'lake-cycle', title: '补充坡道信息', mediaAlt: '坡道照片：1:12 坡度' })
  });
  assert.equal(good.status, 201);
});

test('静态页面可访问', async () => {
  const res = await fetch(`${base}/slow.html`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('a11y-live'), '页面包含播报区');
});
