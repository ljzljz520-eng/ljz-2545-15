'use strict';
/**
 * 慢行页面组装：地图/列表双视图、筛选、焦点协调、弹层、投稿、对比、定位降级、图片说明更新。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./store.js'), require('./live.js'), require('./focus.js'),
      require('./dialog.js'), require('./virtlist.js'), require('./mapview.js'),
      require('./listview.js'), require('./prefs.js'));
  } else {
    root.SlowApp = factory(root.SlowStore, root.SlowLive, root.SlowFocus, root.SlowDialog,
      root.SlowVirtList, root.SlowMapView, root.SlowListView, root.SlowPrefs);
  }
})(typeof self !== 'undefined' ? self : this, function (Store, Live, Focus, Dialog, VirtList, MapView, ListView, Prefs) {

  function createApp(opts) {
    const doc = opts.document;
    const fetchFn = opts.fetchFn || ((...a) => fetch(...a));
    const store = Store.createStore();
    const announcer = Live.createAnnouncer(doc.getElementById('a11y-live'));
    const statusEl = doc.getElementById('filter-status');
    const listScroller = doc.getElementById('route-results');

    const focusMgr = Focus.createFocusManager({
      document: doc, announcer, statusEl,
      itemSelector: '#route-list [data-route-id]', // 焦点协调只针对列表项，避免误匹配地图按钮
      getScroller: () => listScroller
    });
    const dialogs = Dialog.createDialogStack(doc, announcer);
    const prefs = Prefs.createPrefsSync({
      store, document: doc, fetchFn, announcer,
      userId: opts.userId || 'demo-user', deviceId: opts.deviceId || 'web'
    });

    /* ---------- 数据加载与筛选 ---------- */
    async function applyQuery() {
      const q = store.get().query;
      const params = new URLSearchParams();
      if (q.category !== 'all') params.set('category', q.category);
      if (q.keyword) params.set('keyword', q.keyword);
      if (q.accessibleOnly) params.set('accessibleOnly', '1');
      const res = await fetchFn(`/api/routes?${params}`);
      const data = await res.json();
      // 关键：在列表 DOM 重建【之前】捕获焦点上下文，重建后 activeElement 已被重置
      const focusWasInList = listScroller.contains(doc.activeElement);
      const prevId = focusMgr.activeRouteId();
      store.set({ routes: data.routes }, { source: 'query' });
      focusMgr.reconcileAfterFilter(data.routes.map(r => r.id), { focusWasInList, prevId });
    }

    function bindFilters() {
      doc.querySelectorAll('[data-filter-category]').forEach(btn => {
        btn.addEventListener('click', () => {
          doc.querySelectorAll('[data-filter-category]').forEach(b => b.setAttribute('aria-pressed', 'false'));
          btn.setAttribute('aria-pressed', 'true');
          store.setQuery({ category: btn.dataset.filterCategory });
          applyQuery();
        });
      });
      const search = doc.getElementById('route-search');
      search.addEventListener('input', () => { store.setQuery({ keyword: search.value }); applyQuery(); });
      const a11yOnly = doc.getElementById('accessible-only');
      a11yOnly.addEventListener('change', () => { store.setQuery({ accessibleOnly: a11yOnly.checked }); applyQuery(); });
    }

    /* ---------- 大字模式：纯表现层 ---------- */
    function bindFontSize() {
      doc.querySelectorAll('[data-fontsize-choice]').forEach(btn => {
        btn.addEventListener('click', () => prefs.setLocal('fontSize', btn.dataset.fontsizeChoice));
      });
    }

    /* ---------- 定位：无授权时降级 ---------- */
    function locate() {
      const status = doc.getElementById('geo-status');
      const manual = doc.getElementById('manual-origin');
      const geo = opts.geolocation || (typeof navigator !== 'undefined' ? navigator.geolocation : null);
      if (!geo) { showManual('此设备不支持定位，请手动选择起点'); return; }
      geo.getCurrentPosition(
        pos => { status.textContent = `已定位：${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`; announcer.announce('定位成功'); },
        () => showManual('无法获取定位授权，可手动选择起点'),
        { timeout: 5000 }
      );
      function showManual(msg) {
        status.textContent = msg;
        manual.hidden = false;               // 降级 UI 直接展开，不弹窗、不抢焦点
        announcer.announce(msg);
      }
    }

    /* ---------- 图片说明更新（同版替换） ---------- */
    async function refreshAltTexts(routeId) {
      const res = await fetchFn(`/api/routes/${routeId}`);
      if (!res.ok) return false;
      const data = await res.json();
      let updated = 0;
      for (const p of data.points) {
        for (const m of p.media) {
          const img = doc.querySelector(`img[data-media-id="${m.id}"]`);
          if (img && img.alt !== m.altText) { img.alt = m.altText; updated++; }
        }
      }
      if (updated) announcer.announce(`已更新 ${updated} 处点位图片说明`);
      return updated;
    }

    /* ---------- 投稿（纯键盘可完成） ---------- */
    function bindContribute() {
      const dlg = doc.getElementById('contribute-dialog');
      const form = doc.getElementById('contribute-form');
      doc.getElementById('open-contribute').addEventListener('click', e => {
        focusMgr.pushContext('contribute');
        dialogs.open(dlg, { invoker: e.currentTarget, label: '投稿' });
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        // 使用表单所属窗口的 FormData（兼容浏览器与测试环境）
        const Win = form.ownerDocument.defaultView;
        const fd = new Win.FormData(form);
        const res = await fetchFn('/api/submissions', {
          method: 'POST',
          body: JSON.stringify({
            routeId: store.get().selectedId || fd.get('routeId'),
            title: fd.get('title'), description: fd.get('description'), mediaAlt: fd.get('mediaAlt')
          })
        });
        const errBox = doc.getElementById('contribute-errors');
        if (res.status === 422) {
          const data = await res.json();
          errBox.hidden = false;
          errBox.innerHTML = '<ul>' + data.errors.map(x => `<li>${x.message}</li>`).join('') + '</ul>';
          errBox.focus();
          announcer.announce(`投稿被拒绝：${data.errors[0].message}`, 'assertive');
          return;
        }
        if (res.ok) {
          errBox.hidden = true;
          dialogs.closeTop();
          focusMgr.popContext();
          announcer.announce('投稿成功，感谢补充无障碍信息');
        }
      });
    }

    /* ---------- 对比 + 返回原列表 ---------- */
    function bindCompare() {
      const dlg = doc.getElementById('compare-dialog');
      doc.getElementById('open-compare').addEventListener('click', e => {
        const ids = store.get().compareIds;
        if (ids.length < 2) { announcer.announce('请先在列表中勾选两条路线再对比', 'assertive'); return; }
        focusMgr.pushContext('compare');
        const rows = ids.map(id => {
          const r = store.get().routes.find(x => x.id === id);
          return `<tr><th scope="row">${r.id}</th><td>${r.city}</td><td>${r.length_km}km</td>
            <td>${r.wheelchair_spots}/${r.poi_count}</td></tr>`;
        }).join('');
        doc.getElementById('compare-body').innerHTML = rows;
        dialogs.open(dlg, { invoker: e.currentTarget, label: '路线对比' });
      });
      doc.getElementById('compare-back').addEventListener('click', () => {
        dialogs.closeTop();
        focusMgr.popContext();               // 返回原列表：恢复滚动与焦点
        announcer.announce('已返回路线列表');
      });
    }

    /* ---------- 点位虚拟列表：选中路线后懒加载点位（同版文字+替代说明） ---------- */
    function bindPointsPanel() {
      const panel = doc.getElementById('points-panel');
      if (!panel) return null;
      const vl = VirtList.createVirtualList({
        document: doc,
        container: doc.getElementById('points-list'),
        announcer,
        itemHeight: 64, viewportItems: 8,
        renderItem: p => {
          const d = doc.createElement('div');
          d.className = 'point-item';
          const a11yTags = [
            p.a11y && p.a11y.wheelchair ? '♿ 轮椅可通行' : null,
            p.a11y && p.a11y.tactilePaving ? '盲道' : null,
            p.a11y && p.a11y.ramp ? '坡道' : null
          ].filter(Boolean).join(' · ') || '无障碍信息待补充';
          d.innerHTML = `<strong>${p.seq}. ${p.name}</strong>
            <span class="point-desc">${p.description}</span>
            <span class="point-a11y">${a11yTags}</span>`;
          const img = doc.createElement('img');
          const m = (p.media || [])[0];
          if (m) { img.src = m.url; img.alt = m.altText; img.setAttribute('data-media-id', m.id); }
          else { img.alt = ''; img.hidden = true; }
          d.appendChild(img);
          return d;
        },
        onLoadMore: async offset => {
          const id = store.get().selectedId;
          const res = await fetchFn(`/api/routes/${id}/points?offset=${offset}&limit=8`);
          if (!res.ok) throw new Error(`服务器错误 ${res.status}`);
          const data = await res.json();
          if (!Array.isArray(data.points)) throw new Error('响应格式错误');
          return { items: data.points, total: data.total != null ? data.total : data.points.length };
        }
      });
      store.subscribe((state, evt) => {
        if (!evt.changed.includes('selectedId')) return;
        if (state.selectedId) {
          panel.hidden = false;
          doc.getElementById('points-title').textContent = `路线点位：${state.selectedId}`;
          vl.setItems([], 0);
          vl.appendLoad();
        } else {
          panel.hidden = true;
        }
      });
      return vl;
    }

    /* ---------- 初始化 ---------- */
    async function init() {
      MapView.createMapView({ document: doc, store, announcer, svg: doc.getElementById('slow-map') });
      ListView.createListView({ document: doc, store, announcer, ul: doc.getElementById('route-list') });
      bindFilters(); bindFontSize(); bindContribute(); bindCompare();
      const pointsVl = bindPointsPanel();
      doc.getElementById('locate-btn').addEventListener('click', locate);
      await applyQuery();
      await prefs.refresh();
      return { pointsVl };
    }

    return { store, announcer, focusMgr, dialogs, prefs, applyQuery, locate, refreshAltTexts, init };
  }
  return { createApp };
});
