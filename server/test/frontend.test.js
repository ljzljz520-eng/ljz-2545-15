'use strict';
/**
 * 前端可访问交互验收测试（jsdom）：
 * 覆盖验收项：筛选焦点迁移、大字模式表现层、偏好旧请求、地图/列表同一选中、
 * 懒加载失败、弹层嵌套、无定位授权、图片说明更新、虚拟列表滚出、纯键盘流程。
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const Store = require('../../js/slow/store.js');
const Live = require('../../js/slow/live.js');
const Focus = require('../../js/slow/focus.js');
const Dialog = require('../../js/slow/dialog.js');
const VirtList = require('../../js/slow/virtlist.js');
const MapView = require('../../js/slow/mapview.js');
const ListView = require('../../js/slow/listview.js');
const Prefs = require('../../js/slow/prefs.js');
const App = require('../../js/slow/app.js');

const ROUTES = [
  { id: 'riverside-walk', city: '杭州', category: 'waterfront', length_km: 4.2, poi_count: 4, wheelchair_spots: 4 },
  { id: 'old-town-heritage', city: '苏州', category: 'heritage', length_km: 2.8, poi_count: 3, wheelchair_spots: 2 },
  { id: 'lake-cycle', city: '杭州', category: 'cycle', length_km: 12.5, poi_count: 5, wheelchair_spots: 4 }
];

function makeDom() {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'slow.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/slow.html', pretendToBeVisual: true });
  return dom;
}

function makeFetch(routes = ROUTES) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.startsWith('/api/routes?')) {
      const q = new URLSearchParams(url.split('?')[1]);
      let out = routes;
      const cat = q.get('category');
      if (cat) out = out.filter(r => r.category === cat);
      const kw = q.get('keyword');
      if (kw) out = out.filter(r => r.id.includes(kw) || r.city.includes(kw));
      if (q.get('accessibleOnly') === '1') out = out.filter(r => r.wheelchair_spots === r.poi_count);
      return { ok: true, status: 200, json: async () => ({ routes: out }) };
    }
    if (url.includes('/points')) return { ok: true, status: 200, json: async () => ({ routeId: 'x', version: 1, total: 0, offset: 0, limit: 8, points: [] }) };
    if (url.startsWith('/api/prefs/')) return { ok: true, status: 200, json: async () => ({ prefs: {}, version: 1 }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  fetchFn.calls = calls;
  return fetchFn;
}

/* ---------- 1. 地图与列表共享同一选中项 ---------- */
test('地图与列表双状态共享查询状态，保证同一选中项', async () => {
  const dom = makeDom();
  const app = App.createApp({ document: dom.window.document, fetchFn: makeFetch() });
  await app.init();
  const doc = dom.window.document;

  // 从地图选择 → 列表同步
  doc.querySelector('.map-hit[data-route-id="lake-cycle"]').click();
  assert.equal(app.store.get().selectedId, 'lake-cycle');
  const li = doc.querySelector('li[data-route-id="lake-cycle"]');
  assert.ok(li.classList.contains('selected'), '列表同步高亮同一项');
  assert.equal(li.querySelector('.route-select').getAttribute('aria-pressed'), 'true');

  // 从列表选择 → 地图同步
  doc.querySelector('li[data-route-id="riverside-walk"] .route-select').click();
  assert.equal(app.store.get().selectedId, 'riverside-walk');
  const hit = doc.querySelector('.map-hit[data-route-id="riverside-walk"]');
  assert.equal(hit.getAttribute('aria-pressed'), 'true', '地图同步同一选中项');
  assert.equal(doc.querySelector('.map-hit[data-route-id="lake-cycle"]').getAttribute('aria-pressed'), 'false');
});

/* ---------- 2. 筛选后焦点消失 → 可预测位置 + 播报，不回页面开头 ---------- */
test('筛选后原焦点项消失：焦点移至结果状态区并播报，不跳回页面开头', async () => {
  const dom = makeDom();
  const app = App.createApp({ document: dom.window.document, fetchFn: makeFetch() });
  await app.init();
  const doc = dom.window.document;

  // 焦点放到 lake-cycle 列表项上
  const item = doc.querySelector('li[data-route-id="lake-cycle"] .route-select');
  item.focus();
  assert.equal(doc.activeElement, item);

  // 筛选为 heritage → lake-cycle 消失
  doc.querySelector('[data-filter-category="heritage"]').click();
  await new Promise(r => setTimeout(r, 0));

  const status = doc.getElementById('filter-status');
  assert.equal(doc.activeElement, status, '焦点移到可预测的结果状态区');
  assert.notEqual(doc.activeElement, doc.body, '绝不跳回页面开头/body');
  assert.ok(app.announcer.history.some(m => m.includes('原先关注的路线已不在结果中')), '播报说明变化');
});

test('筛选后原焦点项仍存在：焦点保留在同类项上', async () => {
  const dom = makeDom();
  const app = App.createApp({ document: dom.window.document, fetchFn: makeFetch() });
  await app.init();
  const doc = dom.window.document;
  const item = doc.querySelector('li[data-route-id="riverside-walk"] .route-select');
  item.focus();
  doc.querySelector('[data-filter-category="waterfront"]').click();
  await new Promise(r => setTimeout(r, 0));
  const kept = doc.querySelector('li[data-route-id="riverside-walk"] .route-select');
  assert.equal(doc.activeElement, kept, '焦点回到同 id 项（DOM 重建后）');
});

/* ---------- 3. 大字模式只是表现层 ---------- */
test('大字模式只改表现层：焦点、选中、列表结构不受影响', async () => {
  const dom = makeDom();
  const app = App.createApp({ document: dom.window.document, fetchFn: makeFetch() });
  await app.init();
  const doc = dom.window.document;

  const item = doc.querySelector('li[data-route-id="lake-cycle"] .route-select');
  item.click(); item.focus();
  const listHtmlBefore = doc.getElementById('route-list').innerHTML;

  doc.querySelector('[data-fontsize-choice="xlarge"]').click();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(doc.documentElement.dataset.fontsize, 'xlarge', '根元素表现层属性更新');
  assert.equal(doc.activeElement, item, '焦点未移动');
  assert.equal(app.store.get().selectedId, 'lake-cycle', '选中项未变');
  assert.equal(doc.getElementById('route-list').innerHTML, listHtmlBefore, '列表未重渲染');
});

/* ---------- 4. 偏好跨设备同步：旧请求不能突然改变字号或焦点 ---------- */
test('过期偏好响应被丢弃；远端新偏好只改表现层不动焦点', async () => {
  const dom = makeDom();
  const doc = dom.window.document;
  const store = Store.createStore();
  const announcer = Live.createAnnouncer(doc.getElementById('a11y-live'));

  // 模拟：远端已有 v2；本地保存请求晚于一个过期的拉取响应返回
  const prefs = Prefs.createPrefsSync({
    store, document: doc, announcer, userId: 'u1',
    fetchFn: async (url, opts) => {
      if (opts && opts.method === 'PUT') return { ok: true, status: 200, json: async () => ({ version: 3 }) };
      return { ok: true, status: 200, json: async () => ({ prefs: { fontSize: { value: 'large', version: 2 } } }) };
    }
  });

  const btn = doc.createElement('button');
  doc.body.appendChild(btn);
  btn.focus();

  await prefs.setLocal('fontSize', 'xlarge'); // 本地会话操作：v3
  assert.equal(doc.documentElement.dataset.fontsize, 'xlarge');

  const r = await prefs.refresh(); // 远端 v2 < 本地 v3 → 不得覆盖
  assert.deepEqual(r.applied, []);
  assert.equal(doc.documentElement.dataset.fontsize, 'xlarge', '旧响应未改变字号');
  assert.equal(doc.activeElement, btn, '焦点未被动过');

  // 远端更新到 v4 → 应用，但仍不动焦点
  prefs.localVersions.fontSize = 3;
  const prefs2 = Prefs.createPrefsSync({
    store, document: doc, announcer, userId: 'u1',
    fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ prefs: { fontSize: { value: 'large', version: 4 } } }) })
  });
  prefs2.localVersions.fontSize = 3;
  const r2 = await prefs2.refresh();
  assert.deepEqual(r2.applied, ['fontSize']);
  assert.equal(doc.documentElement.dataset.fontsize, 'large', '新版本远端偏好生效');
  assert.equal(doc.activeElement, btn, '应用远端偏好时焦点保持不动');
});

/* ---------- 5. 懒加载失败 ---------- */
test('懒加载失败：错误行 + 可键盘重试 + 播报，焦点不丢', async () => {
  const dom = makeDom();
  const doc = dom.window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const announcer = Live.createAnnouncer(doc.getElementById('a11y-live'));

  let shouldFail = true;
  const vl = VirtList.createVirtualList({
    document: doc, container, announcer, itemHeight: 40, viewportItems: 5,
    renderItem: item => { const d = doc.createElement('div'); d.textContent = item.name; return d; },
    onLoadMore: async offset => {
      if (shouldFail) throw new Error('网络超时');
      return { items: [{ name: 'p1' }, { name: 'p2' }], total: 2 };
    }
  });
  vl.setItems([], 2);
  await vl.appendLoad();
  assert.equal(vl.getLoadError(), '网络超时');
  const retry = container.querySelector('.vl-retry');
  assert.ok(retry, '错误行包含重试按钮');
  assert.equal(container.querySelector('.vl-error').getAttribute('role'), 'alert');
  assert.ok(announcer.history.some(m => m.includes('加载失败')), '失败已播报');

  retry.focus();
  shouldFail = false;
  retry.click();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(vl.getItems().length, 2, '重试后加载成功');
  assert.equal(vl.getLoadError(), null);
});

/* ---------- 6. 弹层嵌套 ---------- */
test('弹层嵌套：Escape 只关栈顶，焦点逐层归还', () => {
  const dom = makeDom();
  const doc = dom.window.document;
  const announcer = Live.createAnnouncer(doc.getElementById('a11y-live'));
  const dialogs = Dialog.createDialogStack(doc, announcer);

  const trigger = doc.getElementById('open-contribute');
  trigger.focus();
  const dlg1 = doc.getElementById('contribute-dialog');
  dialogs.open(dlg1, { invoker: trigger, label: '投稿' });
  assert.equal(dialogs.depth(), 1);
  assert.ok(dlg1.contains(doc.activeElement), '焦点进入第一层弹层');

  // 在第一层里再开第二层（嵌套）
  const dlg2 = doc.createElement('div');
  dlg2.innerHTML = '<button id="d2-ok">确定</button>';
  doc.body.appendChild(dlg2);
  const invoker2 = dlg1.querySelector('[name="title"]');
  invoker2.focus();
  dialogs.open(dlg2, { invoker: invoker2, label: '确认' });
  assert.equal(dialogs.depth(), 2);
  assert.equal(doc.activeElement, doc.getElementById('d2-ok'));

  // Escape 一次：只关第二层，焦点归还第一层内的触发元素
  doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(dialogs.depth(), 1);
  assert.equal(dlg2.hidden, true);
  assert.equal(dlg1.hidden, false, '第一层仍然打开');
  assert.equal(doc.activeElement, invoker2, '焦点归还第一层触发元素');

  // 再 Escape：关第一层，焦点归还页面触发按钮
  doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(dialogs.depth(), 0);
  assert.equal(doc.activeElement, trigger, '焦点归还最初触发按钮');
});

/* ---------- 7. 无定位授权 ---------- */
test('无定位授权：降级为手动输入，不弹窗不抢焦点', async () => {
  const dom = makeDom();
  const doc = dom.window.document;
  const deniedGeo = { getCurrentPosition: (ok, err) => err({ code: 1, message: 'denied' }) };
  const app = App.createApp({ document: doc, fetchFn: makeFetch(), geolocation: deniedGeo });
  await app.init();

  const btn = doc.getElementById('locate-btn');
  btn.focus();
  btn.click();

  assert.equal(doc.getElementById('manual-origin').hidden, false, '显示手动起点输入');
  assert.ok(doc.getElementById('geo-status').textContent.includes('无法获取定位授权'));
  assert.equal(doc.activeElement, btn, '焦点不被抢走');
  assert.ok(app.announcer.history.some(m => m.includes('无法获取定位授权')), '降级信息已播报');
});

/* ---------- 8. 图片说明更新 ---------- */
test('图片说明更新：DOM alt 原地更新并播报，焦点保持', async () => {
  const dom = makeDom();
  const doc = dom.window.document;
  const img = doc.createElement('img');
  img.setAttribute('data-media-id', 'm-rw-1');
  img.alt = '旧说明';
  doc.body.appendChild(img);
  img.focus && img.focus();

  const fetchFn = async url => {
    if (url === '/api/routes/riverside-walk') {
      return { ok: true, status: 200, json: async () => ({
        routeId: 'riverside-walk', version: 2,
        points: [{ id: 'rw-1', media: [{ id: 'm-rw-1', url: '/img/rw-1.jpg', altText: '江湾观景台黄昏全景，前景为无障碍坡道' }] }]
      }) };
    }
    return makeFetch()(url);
  };
  const app = App.createApp({ document: doc, fetchFn });
  await app.init();

  const n = await app.refreshAltTexts('riverside-walk');
  assert.equal(n, 1);
  assert.equal(img.alt, '江湾观景台黄昏全景，前景为无障碍坡道', 'alt 原地更新');
  assert.ok(app.announcer.history.some(m => m.includes('图片说明') || m.includes('已更新 1 处')), '更新已播报');
});

/* ---------- 9. 虚拟列表滚出 ---------- */
test('虚拟列表滚出渲染窗口：焦点不丢（aria-activedescendant），滚回可恢复', () => {
  const dom = makeDom();
  const doc = dom.window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const items = Array.from({ length: 100 }, (_, i) => ({ name: `点位${i + 1}` }));
  const vl = VirtList.createVirtualList({
    document: doc, container, itemHeight: 40, viewportItems: 10, buffer: 2,
    renderItem: item => { const d = doc.createElement('div'); d.textContent = item.name; return d; }
  });
  vl.setItems(items);

  container.focus();
  vl.setActive(3);
  assert.equal(doc.activeElement, container, '焦点常驻容器');
  assert.equal(container.getAttribute('aria-activedescendant'), 'vl-item-3');

  // 模拟滚出：活动项远在渲染窗口之外
  container.scrollTop = 40 * 80;
  container.dispatchEvent(new dom.window.Event('scroll'));
  assert.equal(doc.activeElement, container, '滚出窗口后焦点仍在容器上，不丢失');
  assert.equal(container.getAttribute('aria-activedescendant'), 'vl-item-3', 'activedescendant 仍指向原项');
  assert.equal(vl.getActiveIndex(), 3);

  // 键盘继续导航（从原位置继续，而不是从头开始）
  container.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(vl.getActiveIndex(), 4);
  assert.ok(container.querySelector('[aria-posinset="5"]'), '滚回后该项已渲染');
});

/* ---------- 10. 纯键盘完成投稿、对比、返回原列表 ---------- */
test('纯键盘：投稿（含 422 纠错）→ 对比 → 返回原列表恢复焦点', async () => {
  const dom = makeDom();
  const doc = dom.window.document;
  const submissions = [];
  const fetchFn = async (url, opts = {}) => {
    if (url === '/api/submissions') {
      const body = JSON.parse(opts.body);
      if (!body.mediaAlt) return { ok: false, status: 422, json: async () => ({ errors: [{ code: 'ALT_TEXT_REQUIRED', field: 'mediaAlt', message: '投稿图片缺少必需替代说明' }] }) };
      submissions.push(body);
      return { ok: true, status: 201, json: async () => ({ id: 'sub-1' }) };
    }
    return makeFetch()(url, opts);
  };
  const app = App.createApp({ document: doc, fetchFn });
  await app.init();

  // —— 投稿：键盘打开弹层
  const openBtn = doc.getElementById('open-contribute');
  openBtn.focus();
  openBtn.click();
  const dlg = doc.getElementById('contribute-dialog');
  assert.equal(dlg.hidden, false);
  assert.ok(dlg.contains(doc.activeElement), '焦点进入投稿表单');

  // 提交缺替代说明 → 422，焦点移到错误区
  const form = doc.getElementById('contribute-form');
  form.querySelector('[name="title"]').value = '补充盲道信息';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 0));
  const errBox = doc.getElementById('contribute-errors');
  assert.equal(errBox.hidden, false);
  assert.equal(doc.activeElement, errBox, '校验失败后焦点移至错误摘要');
  assert.ok(errBox.textContent.includes('替代说明'));

  // 补全后提交成功 → 关闭弹层，焦点归还
  form.querySelector('[name="mediaAlt"]').value = '盲道中断点照片';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(submissions.length, 1, '投稿成功提交');
  assert.equal(dlg.hidden, true, '弹层关闭');
  assert.equal(doc.activeElement, openBtn, '焦点归还触发按钮');

  // —— 对比：键盘勾选两条路线
  doc.querySelector('li[data-route-id="riverside-walk"] input[type=checkbox]').click();
  doc.querySelector('li[data-route-id="lake-cycle"] input[type=checkbox]').click();
  const cmpBtn = doc.getElementById('open-compare');
  cmpBtn.focus();
  cmpBtn.click();
  const cmpDlg = doc.getElementById('compare-dialog');
  assert.equal(cmpDlg.hidden, false);
  assert.ok(doc.getElementById('compare-body').textContent.includes('riverside-walk'));
  assert.ok(doc.getElementById('compare-body').textContent.includes('lake-cycle'));

  // —— 返回原列表：焦点与滚动位置恢复
  doc.getElementById('compare-back').click();
  assert.equal(cmpDlg.hidden, true);
  assert.equal(doc.activeElement, cmpBtn, '返回后焦点回到对比按钮（原列表上下文）');
  assert.ok(app.announcer.history.some(m => m.includes('已返回路线列表')));
});

/* ---------- 11. 点位面板：选中路线后懒加载点位（虚拟列表接入真实页面） ---------- */
test('选中路线后点位面板懒加载同版点位，图片带替代说明', async () => {
  const dom = makeDom();
  const doc = dom.window.document;
  const points = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i + 1}`, seq: i + 1, kind: 'spot', name: `点位${i + 1}`, description: `描述${i + 1}`,
    a11y: { wheelchair: i % 2 === 0, tactilePaving: false, ramp: true, accessibleWc: false, audioGuide: false, slopeGrade: 'gentle', notes: '' },
    media: [{ id: `m${i + 1}`, url: `/img/p${i + 1}.jpg`, altText: `点位${i + 1}照片说明` }]
  }));
  const fetchFn = async url => {
    if (url.includes('/points')) {
      const u = new URL(url, 'http://x');
      const offset = Number(u.searchParams.get('offset'));
      const limit = Number(u.searchParams.get('limit'));
      return { ok: true, status: 200, json: async () => ({ routeId: 'lake-cycle', version: 1, total: points.length, offset, limit, points: points.slice(offset, offset + limit) }) };
    }
    return makeFetch()(url);
  };
  const app = App.createApp({ document: doc, fetchFn });
  await app.init();

  const panel = doc.getElementById('points-panel');
  assert.equal(panel.hidden, true, '未选中时面板隐藏');

  // 从地图选中 → 点位面板出现并懒加载
  doc.querySelector('.map-hit[data-route-id="lake-cycle"]').click();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(panel.hidden, false);
  const list = doc.getElementById('points-list');
  assert.equal(list.getAttribute('role'), 'listbox');
  assert.ok(list.querySelector('[role="option"]'), '点位已渲染');
  const img = list.querySelector('img[data-media-id="m1"]');
  assert.equal(img.alt, '点位1照片说明', '点位图片带同版替代说明');
});
