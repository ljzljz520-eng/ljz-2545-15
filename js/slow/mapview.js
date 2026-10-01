'use strict';
/**
 * 地图视图：SVG 慢行地图，点位为可键盘操作的按钮。
 * 地图只是 store 的一个视图 —— 选中态唯一来源是 store.selectedId，
 * 与列表视图共享同一查询状态，保证两侧永远是同一选中项。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SlowMapView = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function createMapView(opts) {
    const doc = opts.document;
    const store = opts.store;
    const announcer = opts.announcer;
    const svg = opts.svg;
    const markers = new Map(); // routeId -> element

    function render(state) {
      svg.innerHTML = '';
      markers.clear();
      const routes = state.routes;
      routes.forEach((r, i) => {
        const x = 40 + (i % 4) * 110;
        const y = 40 + Math.floor(i / 4) * 90;
        const g = doc.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'map-marker');
        const circle = doc.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', '16');
        circle.setAttribute('class', 'marker-dot' + (state.selectedId === r.id ? ' selected' : ''));
        const btn = doc.createElementNS(SVG_NS, 'text');
        btn.setAttribute('x', x); btn.setAttribute('y', y + 34);
        btn.setAttribute('class', 'marker-label');
        btn.textContent = r.id;
        // 用 HTML button 覆盖以保证键盘与读屏语义
        g.appendChild(circle); g.appendChild(btn);
        svg.appendChild(g);
        const hit = doc.createElement('button');
        hit.type = 'button';
        hit.className = 'map-hit';
        hit.dataset.routeId = r.id;
        hit.style.left = `${x - 18}px`; hit.style.top = `${y - 18}px`;
        hit.setAttribute('aria-label', `在地图上选择路线 ${r.id}${state.selectedId === r.id ? '（当前已选中）' : ''}`);
        hit.setAttribute('aria-pressed', state.selectedId === r.id ? 'true' : 'false');
        hit.addEventListener('click', () => {
          store.select(r.id, { source: 'map' });
          announcer.announce(`已选中路线 ${r.id}，列表已同步`);
        });
        svg.parentNode.appendChild(hit);
        markers.set(r.id, { g, circle, hit });
      });
      // 清理多余 hit 按钮
      [...svg.parentNode.querySelectorAll('.map-hit')].forEach(el => {
        if (!markers.has(el.dataset.routeId)) el.remove();
      });
    }

    function update(state, evt) {
      if (evt.changed.includes('routes')) render(state);
      if (evt.changed.includes('selectedId')) {
        for (const [id, m] of markers) {
          const on = id === state.selectedId;
          m.circle.setAttribute('class', 'marker-dot' + (on ? ' selected' : ''));
          m.hit.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      }
    }

    store.subscribe(update);
    render(store.get());
    return { render, markers };
  }
  return { createMapView };
});
