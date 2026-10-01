// 懒加载图片：IntersectionObserver 进入视口才请求 /api/media。
// 验收点：懒加载失败 → 显示可被读屏识别的错误状态 + 重试按钮（焦点可到达），不静默空白。
// 图片说明（alt）更新后同步刷新 alt 文本并播报，名称/说明与点位内容版本一致。
import { say, sayAlert } from './announcer.js';

export function createLazyImages({ store }) {
  const root = document.getElementById('lazy-gallery');

  function render() {
    const s = store.getState();
    const picks = s.points.filter((p) => ['p01', 'p03', 'p06', 'p07'].includes(p.id));
    root.innerHTML = '';
    for (const p of picks) {
      const figure = document.createElement('figure');
      figure.className = 'lazy-figure';
      figure.dataset.id = p.id;

      const img = document.createElement('img');
      img.alt = p.content.imageAlt;
      img.dataset.loaded = 'false';
      img.className = 'lazy-img lazy-img--pending';
      // 占位：用 CSS 背景，不设 src，直到进入视口
      img.setAttribute('aria-live', 'polite');

      const figcap = document.createElement('figcaption');
      figcap.className = 'lazy-cap';
      const capName = document.createElement('span');
      capName.className = 'lazy-cap__name';
      capName.textContent = `${p.content.name}（内容版本 v${p.content.contentVersion}）`;
      const capAlt = document.createElement('span');
      capAlt.className = 'lazy-cap__alt';
      capAlt.textContent = `图片说明：${p.content.imageAlt}`;
      figcap.append(capName, capAlt);

      const state = document.createElement('div');
      state.className = 'lazy-state';
      state.setAttribute('role', 'status');
      state.textContent = '图片尚未加载，滚动到此处时自动加载。';

      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'lazy-retry';
      retry.hidden = true;
      retry.textContent = '重新加载图片';

      figure.append(img, figcap, state, retry);
      root.appendChild(figure);

      retry.addEventListener('click', () => loadFigure(figure, p.id, true));
      observe(figure, p.id);
    }
  }

  function observe(figure, id) {
    if (!('IntersectionObserver' in window)) { loadFigure(figure, id, false); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          loadFigure(figure, id, false);
          io.disconnect();
        }
      }
    }, { rootMargin: '200px' });
    io.observe(figure);
  }

  function loadFigure(figure, id, isRetry) {
    const img = figure.querySelector('.lazy-img');
    const state = figure.querySelector('.lazy-state');
    const retry = figure.querySelector('.lazy-retry');
    // 验收模式：?mediafail=1 让所有图片请求失败
    const forcedFail = new URLSearchParams(location.search).get('mediafail') === '1';
    const url = `/api/media?id=${encodeURIComponent(id)}${forcedFail ? '&fail=1' : ''}`;
    state.textContent = isRetry ? '正在重新加载…' : '正在加载图片…';
    retry.hidden = true;
    img.classList.add('lazy-img--loading');

    const timer = setTimeout(() => {
      // 超时按失败处理
      fail();
    }, 8000);

    img.onload = () => {
      clearTimeout(timer);
      img.dataset.loaded = 'true';
      img.classList.remove('lazy-img--pending', 'lazy-img--loading', 'lazy-img--error');
      img.classList.add('lazy-img--ok');
      state.textContent = '图片加载完成。';
      say(`图片加载完成：${img.alt}`);
    };
    img.onerror = () => { clearTimeout(timer); fail(); };
    function fail() {
      img.classList.remove('lazy-img--loading');
      img.classList.add('lazy-img--error');
      img.alt = ''; // 加载失败时清除误导性 alt，改由状态文本承载
      state.textContent = '图片加载失败。你仍可阅读下方的文字说明，或重试加载。';
      retry.hidden = false;
      retry.dataset.figureId = id;
      sayAlert(`图片加载失败（${id}）。已提供文字说明，可用 Tab 找到"重新加载图片"按钮。`);
    }
    img.src = url;
  }

  // 内容版本更新后：同步 alt 与 caption，并播报说明已更新
  function refreshAlt(pointId) {
    const p = store.getState().points.find((x) => x.id === pointId);
    const figure = root.querySelector(`figure[data-id="${CSS.escape(pointId)}"]`);
    if (!p || !figure) return;
    const img = figure.querySelector('img');
    const capName = figure.querySelector('.lazy-cap__name');
    const capAlt = figure.querySelector('.lazy-cap__alt');
    if (img.dataset.loaded === 'true') {
      img.alt = p.content.imageAlt;
      // 强制重新拉取同版图片（图片上印了版本号）
      img.dataset.loaded = 'pending';
      img.src = `/api/media?id=${pointId}&t=${Date.now()}`;
    } else {
      img.alt = p.content.imageAlt;
    }
    capName.textContent = `${p.content.name}（内容版本 v${p.content.contentVersion}）`;
    capAlt.textContent = `图片说明：${p.content.imageAlt}`;
    say(`图片说明已更新为内容版本 v${p.content.contentVersion}：${p.content.imageAlt}`);
  }

  return { render, refreshAlt };
}
