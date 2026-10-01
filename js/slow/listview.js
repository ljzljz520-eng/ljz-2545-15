'use strict';
/**
 * 结构化路线列表视图：地图操作同步成的文字列表。
 * 与地图共享 store：同一份 query、同一个 selectedId。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SlowListView = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function createListView(opts) {
    const doc = opts.document;
    const store = opts.store;
    const announcer = opts.announcer;
    const ul = opts.ul;

    function render(state) {
      ul.innerHTML = '';
      state.routes.forEach(r => {
        const li = doc.createElement('li');
        li.className = 'route-item' + (state.selectedId === r.id ? ' selected' : '');
        li.dataset.routeId = r.id;
        li.innerHTML = `
          <button type="button" class="route-select" aria-pressed="${state.selectedId === r.id}">
            <span class="route-name">${r.id}</span>
            <span class="route-meta">${r.city} · ${r.length_km}km · 无障碍点位 ${r.wheelchair_spots}/${r.poi_count}</span>
          </button>
          <label class="route-compare">
            <input type="checkbox" ${state.compareIds.includes(r.id) ? 'checked' : ''}
              aria-label="将 ${r.id} 加入对比"> 对比
          </label>`;
        li.querySelector('.route-select').addEventListener('click', () => {
          store.select(r.id, { source: 'list' });
          announcer.announce(`已选中路线 ${r.id}，地图已同步`);
        });
        li.querySelector('input[type=checkbox]').addEventListener('change', () => store.toggleCompare(r.id));
        ul.appendChild(li);
      });
    }

    function update(state, evt) {
      if (evt.changed.includes('routes') || evt.changed.includes('compareIds')) render(state);
      else if (evt.changed.includes('selectedId')) {
        [...ul.children].forEach(li => {
          const on = li.dataset.routeId === state.selectedId;
          li.classList.toggle('selected', on);
          li.querySelector('.route-select').setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }
    }

    store.subscribe(update);
    render(store.get());
    return { render };
  }
  return { createListView };
});
