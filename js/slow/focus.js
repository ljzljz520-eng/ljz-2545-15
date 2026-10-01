'use strict';
/**
 * 焦点管理器。
 * 核心承诺：
 *  1. 筛选后原焦点项消失 → 移到可预测位置（结果状态区），并播报变化；绝不跳回页面开头。
 *  2. 焦点历史栈：进入对比视图/弹层后，能“返回原列表”并恢复焦点与滚动位置。
 *  3. 表现层变化（大字模式）永不触碰焦点。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SlowFocus = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function createFocusManager(opts) {
    const doc = opts.document;
    const announcer = opts.announcer;           // SlowLive
    const itemSelector = opts.itemSelector || '[data-route-id]';
    const statusEl = opts.statusEl;             // 可预测落点：结果状态区（tabindex=-1）
    const history = [];                          // 焦点历史栈

    function activeRouteId() {
      const el = doc.activeElement;
      const item = el && el.closest ? el.closest(itemSelector) : null;
      return item ? item.getAttribute('data-route-id') : null;
    }

    /** 找到 id 对应项的可聚焦目标：优先项内主交互元素，兜底项容器本身 */
    function findItem(id) {
      const item = doc.querySelector(`${itemSelector}[data-route-id="${id}"]`);
      if (!item) return null;
      return item.querySelector('button, a[href], input, select, textarea, [tabindex]') || item;
    }

    /**
     * 筛选/数据更新后调用。
     * visibleIds: 当前可见路线 id 数组。
     * 返回焦点处置结果，便于测试断言。
     */
    function reconcileAfterFilter(visibleIds, context) {
      // prevId 必须由调用方在 DOM 重建前捕获传入（重建后 activeElement 已被浏览器重置）
      const prevId = context && 'prevId' in context ? context.prevId : activeRouteId();
      const count = visibleIds.length;
      // 1) 原焦点项仍可见 → 保持/恢复焦点到同 id 元素（DOM 可能重建）
      if (prevId && visibleIds.includes(prevId)) {
        const el = findItem(prevId);
        // 仅当焦点已丢失（被重建销毁→回落到 body）才恢复；焦点在筛选控件上时不抢夺
        const lost = !doc.activeElement || doc.activeElement === doc.body || !doc.contains(doc.activeElement);
        if (el && lost) el.focus();
        return { action: 'kept', id: prevId };
      }
      // 2) 原焦点项消失（或原本不在列表上）且焦点已丢失 → 移到可预测位置
      const focusLost = !doc.activeElement || doc.activeElement === doc.body || !doc.contains(doc.activeElement);
      if (prevId && !visibleIds.includes(prevId)) {
        statusEl.focus();
        announcer.announce(`筛选结果已更新，共 ${count} 条。原先关注的路线已不在结果中，焦点已移至结果摘要。`);
        return { action: 'moved-to-status', from: prevId };
      }
      if (focusLost && context && context.focusWasInList) {
        statusEl.focus();
        announcer.announce(`筛选结果已更新，共 ${count} 条。`);
        return { action: 'moved-to-status', from: null };
      }
      // 3) 焦点在筛选控件上 → 不动，仅播报
      announcer.announce(`筛选结果已更新，共 ${count} 条。`);
      return { action: 'announced-only' };
    }

    /** 进入新上下文（对比视图、弹层）前记录现场 */
    function pushContext(label) {
      const scroller = opts.getScroller ? opts.getScroller() : null;
      history.push({
        label,
        activeId: activeRouteId(),
        activeSelector: doc.activeElement && doc.activeElement.id ? `#${doc.activeElement.id}` : null,
        scrollTop: scroller ? scroller.scrollTop : 0
      });
    }

    /** 返回原列表：恢复滚动位置与焦点，绝不回页面开头 */
    function popContext() {
      const ctx = history.pop();
      if (!ctx) return null;
      const scroller = opts.getScroller ? opts.getScroller() : null;
      if (scroller) scroller.scrollTop = ctx.scrollTop;
      let target = null;
      if (ctx.activeId) target = findItem(ctx.activeId);
      if (!target && ctx.activeSelector) target = doc.querySelector(ctx.activeSelector);
      if (!target) target = statusEl; // 可预测兜底，而不是页面顶部
      target.focus();
      return ctx;
    }

    return { reconcileAfterFilter, pushContext, popContext, activeRouteId, _history: history };
  }
  return { createFocusManager };
});
