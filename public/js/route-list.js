// 结构化路线列表：虚拟滚动 + roving tabindex + 与地图共享 selectedId。
import {
  ROW_HEIGHT, computeVirtualRange, ensureIndexVisible,
  resolveFocusTarget, nextFocusIndex, reconcileSelection
} from './a11y-logic.js';
import { say } from './announcer.js';

export function createRouteList({ store, onActivate, onFocusChange }) {
  const viewport = document.getElementById('route-list-viewport');
  const inner = document.getElementById('route-list-inner');
  const status = document.getElementById('list-status');
  const empty = document.getElementById('list-empty');
  let prevIds = [];
  let prevCount = 0;
  let announceAfterRender = null;

  function ids() { return store.getState().filtered.map((p) => p.id); }

  function render(reason = {}) {
    const s = store.getState();
    const all = s.filtered;
    const curIds = all.map((p) => p.id);

    // 选中项若被筛除则清空（不会悄悄落到别的点位）
    const selectedId = reconcileSelection(s.selectedId, curIds);
    if (selectedId !== s.selectedId) {
      store.set({ selectedId }, { silentSelection: true });
    }

    // 筛选导致列表变化时，决定焦点的可预测落点
    let focusId = s.focusId;
    if (reason.filterChanged) {
      const target = resolveFocusTarget(prevIds, curIds, s.focusId);
      focusId = target.id;
      const label = focusId ? labelFor(all.find((p) => p.id === focusId)) : '';
      const msg = describeCount(all.length, prevIds.length, target.reason, label);
      announceAfterRender = { focusId, msg, reason: target.reason };
      store.set({ focusId }, { skipFocus: true });
    }

    // 焦点行与选中行必须处于渲染窗口内
    const focusIndex = focusId ? curIds.indexOf(focusId) : -1;
    const selectedIndex = selectedId ? curIds.indexOf(selectedId) : -1;
    const range = computeVirtualRange({
      itemCount: all.length,
      scrollTop: viewport.scrollTop,
      viewportH: viewport.clientHeight || 420,
      pinnedIndexes: [focusIndex, selectedIndex].filter((i) => i >= 0)
    });

    const slice = all.slice(range.start, range.end);
    inner.style.paddingTop = `${range.padTop}px`;
    inner.style.paddingBottom = `${range.padBottom}px`;
    inner.innerHTML = '';

    for (let i = 0; i < slice.length; i++) {
      const p = slice[i];
      const absoluteIndex = range.start + i;
      const row = document.createElement('div');
      row.className = 'route-row';
      row.dataset.id = p.id;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(p.id === selectedId));
      row.tabIndex = p.id === focusId ? 0 : -1;
      row.style.height = `${ROW_HEIGHT}px`;
      row.innerHTML = rowHTML(p, absoluteIndex + 1);
      if (p.id === selectedId) row.classList.add('is-selected');
      inner.appendChild(row);
    }

    status.textContent = `当前显示 ${all.length} 个点位，共 ${s.points.length} 个`;
    empty.hidden = all.length !== 0;
    viewport.setAttribute('aria-rowcount', String(all.length));

    prevIds = curIds;
    prevCount = s.points.length;

    if (announceAfterRender) {
      const a = announceAfterRender;
      announceAfterRender = null;
      requestAnimationFrame(() => {
        say(a.msg);
        if (reason.filterChanged) {
          if (onFocusChange) onFocusChange(a.focusId);
          moveFocus(a.focusId, a.reason === 'empty');
        }
      });
    }
  }

  function labelFor(p) {
    if (!p) return '';
    return `${p.content.name}（${kindLabel(p.kind)}）`;
  }

  function describeCount(nextCount, beforeCount, focusReason, focusLabel) {
    const base = `筛选完成，共 ${nextCount} 个点位（筛选前 ${beforeCount} 个）。`;
    if (nextCount === 0) return `${base}没有匹配点位，焦点位于"清空筛选"按钮，不会跳回页面开头。`;
    if (focusReason === 'kept') return `${base}原焦点项仍在结果中，焦点保留在 ${focusLabel}。`;
    if (focusReason === 'same-position') return `${base}原焦点项已被筛除，焦点移到同位置的下一项：${focusLabel}。`;
    if (focusReason === 'nearest-after') return `${base}原位置之后已无匹配项，焦点移到最接近的最后一项：${focusLabel}。`;
    return `${base}焦点位于 ${focusLabel}。`;
  }

  function kindLabel(k) {
    return { view: '观景点', path: '步道', park: '公园', landmark: '地标', rest: '休息点', transport: '交通', poi: '点位' }[k] || '点位';
  }

  function a11yBadges(a) {
    const out = [];
    out.push(a.stepFree ? '无台阶' : '有台阶');
    out.push({ full: '轮椅可全程', partial: '轮椅部分可行', none: '轮椅不可行' }[a.wheelchair]);
    if (a.restSeating) out.push('有座椅');
    if (a.accessibleToilet) out.push('有无障碍卫生间');
    if (a.quietArea) out.push('安静');
    return out;
  }

  function rowHTML(p, n) {
    const c = p.content;
    const badges = a11yBadges(p.accessibility).map((b) => `<span class="badge">${b}</span>`).join('');
    return `
      <div class="route-row__main">
        <span class="route-row__index" aria-hidden="true">${n}</span>
        <span class="route-row__text">
          <span class="route-row__name">${escapeHTML(c.name)}</span>
          <span class="route-row__meta">${escapeHTML(c.summary)}</span>
          <span class="route-row__badges">${badges}</span>
        </span>
      </div>
      <span class="route-row__hint" aria-hidden="true">Enter 详情 · ↕ 移动</span>`;
  }

  function moveFocus(id, toEmptyReset = false) {
    const row = id && inner.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (row) { row.focus(); return; }
    // 焦点项不在当前渲染窗口（例如滚出）：先滚动再渲染一次
    const curIds = ids();
    const idx = curIds.indexOf(id);
    if (idx >= 0) {
      viewport.scrollTop = ensureIndexVisible(viewport.scrollTop, viewport.clientHeight, idx);
      render();
      requestAnimationFrame(() => inner.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus());
    } else if (toEmptyReset) {
      document.getElementById('clear-filters').focus();
    }
  }

  function scrollFocusIntoView(id) {
    const idx = ids().indexOf(id);
    if (idx < 0) return;
    const next = ensureIndexVisible(viewport.scrollTop, viewport.clientHeight, idx);
    if (next !== viewport.scrollTop) viewport.scrollTop = next;
  }

  // 键盘：方向键移动焦点，Enter/Space 打开详情，列表内选择与地图联动
  viewport.addEventListener('keydown', (e) => {
    const s = store.getState();
    const curIds = s.filtered.map((p) => p.id);
    if (!curIds.length) return;
    const current = curIds.indexOf(s.focusId);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      const idx = nextFocusIndex(current, e.key, curIds.length);
      const id = curIds[idx];
      store.set({ focusId: id });
      scrollFocusIntoView(id);
      render();
      requestAnimationFrame(() => moveFocus(id));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const id = s.focusId || curIds[0];
      store.set({ selectedId: id });
      onActivate(id);
    }
  });

  // 鼠标点击同样走统一的选择入口
  inner.addEventListener('click', (e) => {
    const row = e.target.closest('.route-row');
    if (!row) return;
    const id = row.dataset.id;
    store.set({ focusId: id, selectedId: id });
    render();
    onActivate(id);
  });

  // 滚动时重算虚拟窗口；焦点行滚出时由 pinnedIndexes 保证仍渲染
  viewport.addEventListener('scroll', () => {
    store.set({ listScrollTop: viewport.scrollTop }, { scroll: true });
    render();
  }, { passive: true });

  return { render, moveFocus };
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
