// 屏幕阅读器播报：polite 用于结果变化等非紧急信息，assertive 仅用于错误/拒绝发布等。
let politeEl = null;
let assertiveEl = null;
let clearTimers = {};

function ensure(id, role) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'sr-only';
    el.setAttribute('aria-live', role === 'alert' ? 'assertive' : 'polite');
    el.setAttribute('role', role === 'alert' ? 'alert' : 'status');
    document.body.appendChild(el);
  }
  return el;
}

export function initAnnouncer() {
  politeEl = ensure('a11y-live', 'status');
  assertiveEl = ensure('a11y-alert', 'alert');
}

// 先清空再写入，确保相同文案重复播报
function announce(el, message) {
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = message; });
}

export function say(message) { announce(politeEl, message); }
export function sayAlert(message) { announce(assertiveEl, message); }

export const srOnlyCSS = '';
