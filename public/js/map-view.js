// SVG 地图：标记与结构化列表共享 selectedId / focusId。
// 地图是可聚焦、可方向键操作的组件；每个标记有 title 与 aria-label，并表达选中状态。
export function createMapView({ store, onActivate, onMarkerFocus }) {
  const svg = document.getElementById('slow-map');
  const layer = document.getElementById('map-markers');
  const routeLayer = document.getElementById('map-routes');
  const legend = document.getElementById('map-legend');

  // 经纬度 → SVG 坐标（围绕西湖范围做简单线性投影）
  const BOUNDS = { minLat: 30.228, maxLat: 30.262, minLng: 120.126, maxLng: 120.166 };
  function project(lat, lng) {
    const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 760 + 20;
    const y = 20 + (1 - (lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 400;
    return { x, y };
  }

  function render() {
    const s = store.getState();
    const visible = new Set(s.filtered.map((p) => p.id));
    layer.innerHTML = '';

    // 路线连线（折线从各路线的站点同版数据生成）
    routeLayer.innerHTML = '';
    for (const route of s.routes) {
      const pts = route.stops || [];
      const d = pts.map((st, i) => {
        const { x, y } = project(st.lat, st.lng);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'map-route-line');
      path.setAttribute('fill', 'none');
      const id = `route-${route.id}`;
      path.id = id;
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = route.name;
      path.appendChild(title);
      routeLayer.appendChild(path);
    }

    for (const p of s.points) {
      const { x, y } = project(p.lat, p.lng);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const isVisible = visible.has(p.id);
      const isSelected = p.id === s.selectedId;
      const isFocused = p.id === s.focusId;
      g.setAttribute('class', [
        'map-marker',
        isSelected ? 'is-selected' : '',
        isFocused ? 'is-focused' : '',
        isVisible ? '' : 'is-dimmed'
      ].join(' ').trim());
      g.setAttribute('data-id', p.id);
      g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      // 仅可见标记可 Tab 到达；方向键在可见标记间移动
      g.setAttribute('tabindex', isVisible ? (p.id === s.focusId ? '0' : '-1') : '-1');
      g.setAttribute('role', 'button');
      const stateText = [
        isSelected ? '已选中' : '',
        isVisible ? '' : '已被当前筛选排除'
      ].filter(Boolean).join('，');
      g.setAttribute('aria-label', `${p.content.name}，${p.content.summary}${stateText ? '，' + stateText : ''}。按 Enter 查看详情`);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', isSelected ? 11 : 8);
      circle.setAttribute('class', 'map-marker__dot');
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${p.content.name}${isSelected ? '（已选中）' : ''}`;
      g.appendChild(circle);
      g.appendChild(title);

      if (isSelected) {
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('r', '16');
        ring.setAttribute('class', 'map-marker__ring');
        g.appendChild(ring);
      }

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', '14');
      label.setAttribute('y', '4');
      label.setAttribute('class', 'map-marker__label');
      label.textContent = p.content.name;
      g.appendChild(label);

      g.addEventListener('click', () => {
        if (!isVisible) return;
        store.set({ selectedId: p.id, focusId: p.id });
        onActivate(p.id, { fromMap: true });
      });
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          store.set({ selectedId: p.id, focusId: p.id });
          onActivate(p.id, { fromMap: true });
        }
      });
      layer.appendChild(g);
    }

    legend.textContent = `${s.filtered.length} 个点位可见${s.selectedId ? '；' + (s.points.find((p) => p.id === s.selectedId)?.content.name || '') + '已选中，地图与列表保持同一选中项' : '；未选中'}`;
    svg.setAttribute('aria-label', `慢行点位地图，${s.points.length} 个点位中 ${s.filtered.length} 个符合当前筛选。方向键在标记间移动，Enter 查看详情。`);
  }

  // 在可见标记之间做方向键循环导航（左/上一个，右/下一个）
  svg.addEventListener('keydown', (e) => {
    const s = store.getState();
    const visible = s.filtered;
    if (!visible.length) return;
    const ids = visible.map((p) => p.id);
    const idx = ids.indexOf(s.focusId);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      next = idx < 0 ? 0 : (idx + 1) % ids.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      next = idx < 0 ? 0 : (idx - 1 + ids.length) % ids.length;
    } else if (e.key === 'Home') { e.preventDefault(); next = 0; }
    else if (e.key === 'End') { e.preventDefault(); next = ids.length - 1; }
    if (next !== idx && next >= 0) {
      const id = ids[next];
      store.set({ focusId: id });
      // 列表侧同步同一焦点行（滚动到可见但不抢走键盘焦点）
      if (onMarkerFocus) onMarkerFocus(id);
      layer.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus();
    }
  });

  return { render, project };
}
