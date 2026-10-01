// 共享查询状态 store：地图、列表、筛选条件、选中项共享同一状态源。
export function createStore(initial = {}) {
  let state = {
    points: [],
    routes: [],
    filters: { keyword: '', kind: '', stepFree: false, wheelchair: false, quiet: false, seating: false, toilet: false },
    filtered: [],
    selectedId: null,     // 地图与列表共用的唯一选中项
    focusId: null,        // 列表当前 roving-tabindex 焦点项
    listScrollTop: 0,
    prefs: { baseFontRem: 1, highContrast: false, reduceMotion: false, rev: 0 },
    touched: new Set(),   // 会话内手动改动过的偏好字段（云端同步不得覆盖）
    geo: { status: 'idle', pos: null, error: null },
    contentSeq: 1,
    ...initial
  };
  const listeners = new Set();

  return {
    getState: () => state,
    set(patch, meta) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state, meta || {});
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}

// 带请求序号的 fetch：旧响应即使晚到也不落地。
export function latestRequest() {
  let seq = 0;
  return function run(url, options) {
    const my = ++seq;
    return Promise.resolve(fetch(url, options)).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body, seq: my, isStale: my < seq };
    }).catch((err) => ({ ok: false, status: 0, body: { error: 'network', message: String(err) }, seq: my, isStale: my < seq }));
  };
}
