'use strict';
/**
 * 弹层栈：支持嵌套弹层。
 *  - 每层独立焦点圈定（focus trap）
 *  - Escape 只关闭栈顶一层
 *  - 关闭后焦点归还该层的触发元素
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SlowDialog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function createDialogStack(doc, announcer) {
    const stack = [];

    function focusables(el) {
      // 过滤隐藏元素：hidden 属性链在浏览器与测试环境（jsdom）中都可靠
      return [...el.querySelectorAll(FOCUSABLE)].filter(n => !n.closest('[hidden]'));
    }

    function onKeydown(e) {
      const top = stack[stack.length - 1];
      if (!top) return;
      if (e.key === 'Escape') { e.preventDefault(); closeTop(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables(top.el);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function open(el, opts) {
      const invoker = (opts && opts.invoker) || doc.activeElement;
      el.hidden = false;
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      const layer = { el, invoker, label: (opts && opts.label) || el.getAttribute('aria-label') || '对话框' };
      stack.push(layer);
      if (stack.length === 1) doc.addEventListener('keydown', onKeydown, true);
      const target = el.querySelector('[data-autofocus]') || focusables(el)[0] || el;
      target.focus();
      if (announcer) announcer.announce(`${layer.label}已打开${stack.length > 1 ? '（嵌套弹层）' : ''}`);
      return layer;
    }

    function closeTop() {
      const layer = stack.pop();
      if (!layer) return null;
      layer.el.hidden = true;
      if (stack.length === 0) doc.removeEventListener('keydown', onKeydown, true);
      // 焦点归还：归还到本层触发元素；触发元素不在 DOM 时归还下一层弹层
      let target = layer.invoker;
      if (!target || !doc.contains(target)) {
        const below = stack[stack.length - 1];
        target = below ? (focusables(below.el)[0] || below.el) : null;
      }
      if (target && target.focus) target.focus();
      if (announcer) announcer.announce(`${layer.label}已关闭`);
      return layer;
    }

    return { open, closeTop, depth: () => stack.length, _stack: stack };
  }
  return { createDialogStack, FOCUSABLE };
});
