'use strict';
/**
 * 用户偏好跨设备同步。
 * 原则：
 *  1. 本地会话操作优先：用户当前会话修改立即生效并异步保存；
 *  2. 旧请求无害化：过期响应（版本不新）一律丢弃，绝不能突然改变字号或焦点；
 *  3. 远端新偏好只改表现层（data 属性），不重建 DOM、不移动焦点。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SlowPrefs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function createPrefsSync(opts) {
    const store = opts.store;
    const doc = opts.document;
    const fetchFn = opts.fetchFn;              // 注入便于测试
    const userId = opts.userId;
    const deviceId = opts.deviceId || 'web';
    const announcer = opts.announcer;

    const localVersions = {};                  // key -> 已应用版本
    const sessionDirty = new Set();            // 本会话正在编辑/刚保存的 key
    let inflightSeq = 0;
    let latestAckSeq = 0;

    /** 应用偏好到表现层：仅切换根元素 data 属性，不触碰焦点与选中 */
    function applyPresentation(patch, source) {
      const before = doc.activeElement;
      store.setPresentation(patch, { source: source || 'prefs' });
      const p = store.get().presentation;
      doc.documentElement.dataset.fontsize = p.fontSize;
      doc.documentElement.dataset.contrast = p.contrast;
      if (doc.activeElement !== before && before && doc.contains(before)) before.focus(); // 双保险：焦点不得漂移
    }

    /** 本地修改：立即生效 + 异步保存 */
    async function setLocal(key, value) {
      sessionDirty.add(key);
      applyPresentation({ [key]: value }, 'local');
      const expected = localVersions[key] || 0;
      const seq = ++inflightSeq;
      try {
        const res = await fetchFn(`/api/prefs/${userId}`, {
          method: 'PUT',
          body: JSON.stringify({ key, value, expectedVersion: expected, deviceId })
        });
        const data = await res.json();
        if (res.status === 409) {           // 版本冲突：拉取远端合并
          await refresh();
        } else if (res.ok && seq > latestAckSeq) {
          latestAckSeq = seq;
          localVersions[key] = data.version;
        }
      } finally {
        sessionDirty.delete(key);
      }
    }

    /** 拉取远端偏好：只应用“更新且本会话未在编辑”的键 */
    async function refresh() {
      const seq = ++inflightSeq;
      const res = await fetchFn(`/api/prefs/${userId}`);
      const data = await res.json();
      if (seq < latestAckSeq) return { applied: [] }; // 过期响应：丢弃
      const applied = [];
      for (const [key, pref] of Object.entries(data.prefs || {})) {
        const newer = (localVersions[key] || 0) < pref.version;
        if (newer && !sessionDirty.has(key)) {
          localVersions[key] = pref.version;
          applyPresentation({ [key]: pref.value }, 'remote');
          applied.push(key);
        }
      }
      if (applied.length && announcer) announcer.announce('已从其他设备同步显示偏好');
      return { applied };
    }

    return { setLocal, refresh, applyPresentation, localVersions, _sessionDirty: sessionDirty };
  }
  return { createPrefsSync };
});
