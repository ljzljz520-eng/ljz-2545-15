// 弹层栈：嵌套弹层、焦点陷阱、Esc 关闭、关闭后焦点返回触发元素。
// 验收：弹层嵌套 —— 详情弹层中打开"对比/投稿"二级弹层，焦点逐层进入、逐层返回。
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
  'input:not([disabled])', 'select:not([disabled])', '[tabindex]:not([tabindex="-1"])'
].join(',');

export function getFocusable(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE))
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export class DialogStack {
  constructor({ onTopChange } = {}) {
    this.stack = [];
    this.onTopChange = onTopChange || (() => {});
    this._onKeydown = this._onKeydown.bind(this);
  }

  #backdropFor(dialogEl) {
    return dialogEl.closest('.dialog-backdrop') || null;
  }

  // open(dialogEl, { returnTo, onClose })
  open(dialogEl, { returnTo = document.activeElement, onClose, labelledBy } = {}) {
    const previous = this.top();
    if (previous) previous.el.setAttribute('aria-hidden', 'true');

    dialogEl.classList.add('is-open');
    dialogEl.setAttribute('aria-hidden', 'false');
    const backdrop = this.#backdropFor(dialogEl);
    if (backdrop) backdrop.hidden = false;
    if (!dialogEl.getAttribute('role')) dialogEl.setAttribute('role', 'dialog');
    if (!dialogEl.getAttribute('aria-modal')) dialogEl.setAttribute('aria-modal', 'true');
    if (labelledBy) dialogEl.setAttribute('aria-labelledby', labelledBy);

    const entry = { el: dialogEl, returnTo, onClose };
    this.stack.push(entry);
    document.body.classList.add('dialog-open');
    document.addEventListener('keydown', this._onKeydown, true);
    this.onTopChange(this.snapshot());

    // 焦点进入弹层：标题优先，否则首个可聚焦元素，再退而求其次弹层本身
    const focusable = getFocusable(dialogEl);
    const heading = dialogEl.querySelector('[data-autofocus]') || focusable[0];
    (heading || dialogEl).focus({ preventScroll: false });
    if (!heading) dialogEl.setAttribute('tabindex', '-1');
    return entry;
  }

  close(dialogEl) {
    const idx = this.stack.findIndex((e) => e.el === dialogEl);
    if (idx === -1) return;
    // 关闭顶层（允许关闭中间层时一起关闭其上层）
    const removed = this.stack.splice(idx)[0];
    removed.el.classList.remove('is-open');
    removed.el.setAttribute('aria-hidden', 'true');
    const removedBackdrop = this.#backdropFor(removed.el);
    if (removedBackdrop && !this.stack.some((e) => this.#backdropFor(e.el) === removedBackdrop)) {
      removedBackdrop.hidden = true;
    }
    if (removed.onClose) {
      try { removed.onClose(); } catch { /* 关闭回调不阻断焦点恢复 */ }
    }

    const top = this.top();
    if (top) {
      top.el.setAttribute('aria-hidden', 'false');
      // 返回上层弹层时，焦点回到上层触发元素（在 open 时由调用方记录）
      const backTo = removed.returnTo && removed.returnTo.closest('.dialog.is-open') ? removed.returnTo : getFocusable(top.el)[0];
      (backTo || top.el).focus();
    } else {
      document.body.classList.remove('dialog-open');
      document.removeEventListener('keydown', this._onKeydown, true);
      // 关闭整个弹层流程：焦点返回页面原触发元素，而不是页面开头
      const target = removed.returnTo;
      if (target && target.isConnected) target.focus();
      else document.body.focus();
    }
    this.onTopChange(this.snapshot());
  }

  closeTop() {
    const t = this.top();
    if (t) this.close(t.el);
  }

  top() { return this.stack[this.stack.length - 1] || null; }
  get depth() { return this.stack.length; }

  snapshot() {
    return this.stack.map((e, i) => ({ level: i + 1, id: e.el.id, open: true }));
  }

  _onKeydown(e) {
    const top = this.top();
    if (!top) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      this.closeTop();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = getFocusable(top.el);
    if (f.length === 0) { e.preventDefault(); return; }
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }
}
