// 后端验收：同版文字、筛选 API、发布校验、偏好 rev 乐观锁、懒加载失败、媒体 alt
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DB_FILE = path.join(await mkdtemp(path.join(tmpdir(), 'slowmoves-')), 'db.json');
const { server } = await import('../server/index.js');

function listen() {
  return new Promise((resolve) => {
    server.listen(0, () => resolve(server.address().port));
  });
}
let port;
before(async () => { port = await listen(); });
after(() => new Promise((r) => server.close(r)));

const base = () => `http://127.0.0.1:${port}`;

async function jsonFetch(url, options = {}) {
  const res = await fetch(base() + url, options);
  const body = await res.json();
  return { status: res.status, body };
}

test('GET /api/state：地图与列表拿到同一份点位，且都带当前内容版本', async () => {
  const { status, body } = await jsonFetch('/api/state');
  assert.equal(status, 200);
  assert.ok(body.points.length >= 10);
  const p = body.points[0];
  assert.ok(p.content.contentVersion === p.content.currentVersion);
  for (const f of ['name', 'summary', 'textAlternative', 'easyRead', 'imageAlt']) {
    assert.ok(typeof p.content[f] === 'string', `缺字段 ${f}`);
  }
  const route = body.routes[0];
  assert.ok(route.stops.length >= 2);
  // 同版：站点文字与点位接口返回同一版本
  const one = await jsonFetch(`/api/points/${route.stops[0].pointId}`);
  assert.equal(one.body.content.contentVersion, route.stops[0].content.contentVersion);
});

test('GET /api/points?stepFree=true：只返回无台阶点位', async () => {
  const { body } = await jsonFetch('/api/points?stepFree=true');
  assert.ok(body.count > 0);
  assert.ok(body.points.every((p) => p.accessibility.stepFree));
});

test('GET /api/points/:id/content?version=1 与当前版本文字一致（同版点位文字）', async () => {
  const { body } = await jsonFetch('/api/points/p03/content?version=1');
  assert.equal(body.pointId, 'p03');
  assert.equal(body.contentVersion, 1);
  assert.ok(body.textAlternative.includes('平台'));
});

test('POST 发布缺少必需替代说明 → 422 且 blocked，后端拒绝整个内容版', async () => {
  const payload = {
    name: '新名称足够长',
    summary: '', // 缺失
    textAlternative: 'x'.repeat(25),
    imageAlt: '' // 缺失
  };
  const { status, body } = await jsonFetch('/api/points/p01/content', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(status, 422);
  assert.equal(body.blocked, true);
  const fields = body.errors.map((e) => e.field);
  assert.ok(fields.includes('summary'));
  assert.ok(fields.includes('imageAlt'));
  assert.ok(body.errors.some((e) => e.code === 'MISSING_REQUIRED_ALTERNATIVE'));
});

test('POST 完整内容版 → 201，地图/列表/媒体随后读到同一新版本与新 alt', async () => {
  const payload = {
    name: '断桥残雪（更新）',
    summary: '白堤东端石拱桥的更新版说明，超过十个字',
    textAlternative: 'y'.repeat(24),
    imageAlt: '更新后的图片说明：雪后石拱桥',
    easyRead: '桥和路都是平的。'
  };
  const { status, body } = await jsonFetch('/api/points/p01/content', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(status, 201);
  assert.equal(body.version, 2);
  const again = await jsonFetch('/api/points/p01');
  assert.equal(again.body.content.contentVersion, 2);
  assert.equal(again.body.content.imageAlt, payload.imageAlt);
  assert.equal(again.body.image.alt, payload.imageAlt);
  // 历史版本仍可取（同版替代说明）
  const v1 = await jsonFetch('/api/points/p01/content?version=1');
  assert.equal(v1.body.contentVersion, 1);
});

test('POST 草稿允许缺少可选字段但必需字段仍需通过长度校验', async () => {
  const { status, body } = await jsonFetch('/api/points/p02/content', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'draft', name: '白堤', summary: '长堤平整无坡适合慢走', textAlternative: 'z'.repeat(24), imageAlt: '湖边长堤与桃树柳树' })
  });
  assert.equal(status, 201);
  assert.ok(body.version >= 2);
});

test('偏好同步：旧 rev 保存 → 409，且服务端数据未被改写', async () => {
  // 初始 rev（种子为 3）。先做一次更新到 rev 4
  await jsonFetch('/api/users/demo/prefs', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ highContrast: true, baseRev: 3 })
  });
  // 再用旧 rev 3 提交 → 409
  const stale = await jsonFetch('/api/users/demo/prefs', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseFontRem: 2, baseRev: 3 })
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'stale-revision');
  // 字号没有被旧请求改成 2
  const check = await jsonFetch('/api/users/demo/prefs');
  assert.equal(check.body.baseFontRem, 1);
  assert.equal(check.body.highContrast, true);
  assert.equal(check.body.rev, 4);
});

test('偏好同步：新 rev 保存成功并递增', async () => {
  const { status, body } = await jsonFetch('/api/users/newuser/prefs', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseFontRem: 1.5 })
  });
  assert.ok(status === 201 || status === 200);
  assert.equal(body.baseFontRem, 1.5);
  assert.equal(body.rev, 1);
  const { body: again } = await jsonFetch('/api/users/newuser/prefs');
  assert.equal(again.rev, 1);
});

test('偏好校验：非法字号被拒绝（表现层边界）', async () => {
  const { status } = await jsonFetch('/api/users/newuser/prefs', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseFontRem: 5, baseRev: 1 })
  });
  assert.equal(status, 400);
});

test('GET /api/media?fail=1 模拟懒加载失败 → 503', async () => {
  const res = await fetch(base() + '/api/media?id=p01&fail=1');
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /unavailable/);
});

test('GET /api/media 正常返回 SVG，且 aria-label 与当前 alt 同版', async () => {
  const res = await fetch(base() + '/api/media?id=p03');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /svg/);
  const text = await res.text();
  const alt = (await jsonFetch('/api/points/p03')).body.content.imageAlt;
  assert.ok(text.includes(alt));
});

test('路线展开的站点均为同版 content，顺序与 stopIds 一致', async () => {
  const { body } = await jsonFetch('/api/routes/r2');
  assert.deepEqual(body.stops.map((s) => s.pointId), body.stopIds);
  assert.ok(body.stops.every((s) => s.content && s.accessibility));
});

test('静态首页可访问且包含跳到主内容链接', async () => {
  const res = await fetch(base() + '/');
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /skip-link/);
  assert.match(text, /role="listbox"/);
});
