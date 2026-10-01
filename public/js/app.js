// 应用入口：装配共享状态与所有视图。
import { createStore } from './store.js';
import { initAnnouncer, say } from './announcer.js';
import { filterPoints, ensureIndexVisible } from './a11y-logic.js';
import { DialogStack } from './dialog.js';
import { createRouteList } from './route-list.js';
import { createMapView } from './map-view.js';
import { createFilters } from './filters.js';
import { createGeo } from './geo.js';
import { createPrefs } from './prefs.js';
import { createLazyImages } from './lazy-images.js';
import { createContentDialogs } from './content-dialogs.js';

initAnnouncer();

const store = createStore();

// 弹层栈：详情 → 对比/投稿 的嵌套与逐层焦点返回
const dialogs = new DialogStack();

const lazyImages = createLazyImages({ store });

const listView = createRouteList({
  store,
  dialogs,
  onActivate: (id) => openDetailFrom(id, 'list'),
  onFocusChange: () => mapView.render()
});
const mapView = createMapView({
  store,
  onActivate: (id) => openDetailFrom(id, 'map'),
  onMarkerFocus: (id) => {
    // 地图方向键移动：列表同步渲染焦点行并滚动到可见，但焦点留在地图
    listView.render({ filterChanged: false });
    const ids = store.getState().filtered.map((p) => p.id);
    const idx = ids.indexOf(id);
    if (idx >= 0) {
      const vp = document.getElementById('route-list-viewport');
      vp.scrollTop = ensureIndexVisible(vp.scrollTop, vp.clientHeight, idx);
      listView.render({ filterChanged: false });
    }
  }
});

// 记录详情弹层的打开来源，关闭后焦点回到原视图（地图标记或列表行），而不是页面开头
let detailOrigin = 'list';
function openDetailFrom(id, origin) {
  detailOrigin = origin;
  content.openDetail(id);
}

const content = createContentDialogs({ store, dialogs, listView, mapView, lazyImages });

// 弹层栈：详情 → 对比/投稿 的嵌套与逐层焦点返回
dialogs.onTopChange = (snap) => {
  if (snap.length === 0) {
    const s = store.getState();
    requestAnimationFrame(() => {
      const targetId = s.focusId || s.selectedId || '';
      if (detailOrigin === 'map') {
        const marker = document.querySelector(`.map-marker[data-id="${CSS.escape(targetId)}"]`);
        if (marker) { marker.focus(); return; }
      }
      const row = document.querySelector(`.route-row[data-id="${CSS.escape(targetId)}"]`);
      if (row) { row.focus(); return; }
      document.getElementById('route-list-viewport').focus();
    });
  }
};

// 应用筛选：地图与列表从同一份 filtered 派生
function recompute() {
  const s = store.getState();
  const filtered = filterPoints(s.points, s.filters);
  store.set({ filtered });
  mapView.render();
  listView.render({ filterChanged: false });
  renderRouteCards();
}

const filters = createFilters({
  store,
  routeList: listView,
  mapView,
  onApplied: ({ filterChanged }) => {
    const s = store.getState();
    const filtered = filterPoints(s.points, s.filters);
    store.set({ filtered });
    mapView.render();
    // route-list.render 内部根据 prevIds 决定焦点可预测落点并播报变化
    listView.render({ filterChanged });
  }
});

const geo = createGeo({
  store, listView,
  onPointSelect: (id) => {
    store.set({ selectedId: id, focusId: id });
    mapView.render();
    listView.render({ filterChanged: false });
  }
});
const prefs = createPrefs({ store });

function renderRouteCards() {
  const wrap = document.getElementById('routes-cards');
  const s = store.getState();
  wrap.innerHTML = '';
  for (const route of s.routes) {
    const card = document.createElement('article');
    card.className = 'route-card';
    const h = document.createElement('h3');
    h.textContent = route.name;
    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `${route.distanceKm} 公里 · 约 ${route.durationMin} 分钟 · ${route.stopIds.length} 站`;
    const summary = document.createElement('p');
    summary.textContent = route.summary;
    const ol = document.createElement('ol');
    ol.className = 'route-stops';
    for (const stop of route.stops || []) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'link-btn stop-btn';
      btn.dataset.id = stop.pointId;
      btn.textContent = stop.content.name;
      btn.setAttribute('aria-label', `第 ${stop.order} 站：${stop.content.name}，${stop.accessibility.stepFree ? '无台阶' : '有台阶'}`);
      btn.addEventListener('click', () => {
        store.set({ selectedId: stop.pointId, focusId: stop.pointId });
        recompute();
        content.openDetail(stop.pointId);
      });
      li.append(btn);
      const note = document.createElement('span');
      note.className = 'stop-note';
      note.textContent = `— ${stop.content.summary}`;
      li.append(note);
      ol.append(li);
    }
    const alt = document.createElement('details');
    alt.className = 'route-alt';
    const sum = document.createElement('summary');
    sum.textContent = '整条路线的文字替代说明';
    const altp = document.createElement('p');
    altp.textContent = route.textAlternative;
    alt.append(sum, altp);
    card.append(h, meta, summary, ol, alt);
    wrap.append(card);
  }
}

async function boot() {
  say('慢行应用正在加载点位与路线。');
  try {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    store.set({
      points: data.points,
      routes: data.routes,
      filtered: data.points,
      contentSeq: data.contentSequence,
      focusId: data.points[0]?.id || null
    });
    mapView.render();
    listView.render({ filterChanged: false });
    lazyImages.render();
    renderRouteCards();
    prefs.pullRemote({ announce: false }).then(() => {
      prefs.applyPresentation(store.getState().prefs);
    });
    say(`加载完成：${data.points.length} 个点位，${data.routes.length} 条路线。地图标记与列表行同步。`);
  } catch (err) {
    document.getElementById('list-status').textContent = `初始数据加载失败：${err.message}。请刷新重试。`;
  }
}

// 共享查询状态由各视图显式渲染；selectedId 在 store 中全应用唯一。

boot();
