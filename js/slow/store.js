'use strict';
/**
 * 共享查询状态存储（单一数据源）。
 * 地图视图与列表视图都只是 store 的订阅者：
 * 选中项只有一份 selectedId，从设计上保证地图与列表永远是同一选中项。
 * 表现层偏好（如大字模式）放在 presentation 切片，变更不会触发数据重渲染。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SlowStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function createStore(initial) {
    const state = Object.assign({
      query: { category: 'all', keyword: '', accessibleOnly: false },
      routes: [],            // 当前查询结果（结构化路线列表数据）
      selectedId: null,      // 唯一选中来源：地图与列表共享
      compareIds: [],        // 对比选择（最多 2 条）
      presentation: { fontSize: 'normal', contrast: 'normal', reduceMotion: false },
      status: 'idle'         // idle / loading / error
    }, initial || {});

    const listeners = new Set();

    function get() { return state; }

    function set(patch, meta) {
      const changed = [];
      for (const k of Object.keys(patch)) {
        if (state[k] !== patch[k]) { state[k] = patch[k]; changed.push(k); }
      }
      if (!changed.length) return;
      const evt = { changed, meta: meta || {} };
      for (const fn of [...listeners]) fn(state, evt);
    }

    function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

    /** 更新查询条件（地图与列表共享同一份 query） */
    function setQuery(patch, meta) {
      set({ query: Object.assign({}, state.query, patch) }, Object.assign({ source: 'query' }, meta));
    }

    /** 唯一选中入口：无论地图点击还是列表点击都走这里 */
    function select(id, meta) {
      if (id != null && !state.routes.some(r => r.id === id)) return false; // 只允许选中当前结果内的项
      set({ selectedId: id }, Object.assign({ source: 'select' }, meta));
      return true;
    }

    /** 表现层偏好：只改 presentation，不触碰数据与选中 */
    function setPresentation(patch, meta) {
      set({ presentation: Object.assign({}, state.presentation, patch) },
        Object.assign({ source: 'presentation' }, meta));
    }

    function toggleCompare(id) {
      const cur = state.compareIds.slice();
      const i = cur.indexOf(id);
      if (i >= 0) cur.splice(i, 1);
      else { if (cur.length >= 2) cur.shift(); cur.push(id); }
      set({ compareIds: cur }, { source: 'compare' });
    }

    return { get, set, subscribe, setQuery, select, setPresentation, toggleCompare };
  }
  return { createStore };
});
