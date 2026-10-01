'use strict';
/**
 * 动态内容播报：所有状态变化（筛选结果、选中、懒加载失败、图片说明更新…）
 * 统一经 aria-live 区域播报，与大字模式等表现层变化解耦。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SlowLive = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function createAnnouncer(regionEl) {
    const history = [];
    function announce(message, priority) {
      const text = String(message);
      history.push(text);
      if (!regionEl) return text;
      // 先清空再写入，确保相同文本也会重新播报
      regionEl.setAttribute('aria-live', priority === 'assertive' ? 'assertive' : 'polite');
      regionEl.textContent = '';
      regionEl.textContent = text;
      return text;
    }
    return { announce, history };
  }
  return { createAnnouncer };
});
