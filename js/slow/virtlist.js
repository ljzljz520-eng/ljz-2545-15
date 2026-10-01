'use strict';
/**
 * 虚拟列表：窗口化渲染长路线点位/结果列表。
 * 焦点策略：焦点常驻容器（role=listbox, tabindex=0），
 * 通过 aria-activedescendant 指向当前项 —— 当前项滚出渲染窗口被卸载时，
 * 焦点不会丢失（仍在容器上），滚回时高亮恢复。
 * 懒加载：滚动接近底部触发加载；失败时渲染错误行 + 可键盘到达的重试按钮。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SlowVirtList = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function createVirtualList(opts) {
    const doc = opts.document;
    const container = opts.container;          // 滚动容器（也是焦点容器）
    const itemHeight = opts.itemHeight || 48;
    const buffer = opts.buffer || 3;
    const renderItem = opts.renderItem;        // (item, index) => HTMLElement
    const announcer = opts.announcer;
    const onLoadMore = opts.onLoadMore || null; // 懒加载回调，返回 Promise<{items,total}>
    const viewportItems = opts.viewportItems || 10;

    let items = [];
    let total = 0;
    let activeIndex = -1;
    let start = 0, end = 0;
    let loading = false;
    let loadError = null;

    container.setAttribute('role', 'listbox');
    container.setAttribute('tabindex', '0');

    const spacer = doc.createElement('div');
    spacer.className = 'vl-spacer';
    const window_ = doc.createElement('div');
    window_.className = 'vl-window';
    container.appendChild(spacer);
    container.appendChild(window_);

    function windowRange() {
      const scrollTop = container.scrollTop || 0;
      const first = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
      const last = Math.min(items.length - 1, first + viewportItems + buffer * 2);
      return [first, last];
    }

    function render() {
      [start, end] = windowRange();
      spacer.style.height = `${items.length * itemHeight}px`;
      window_.style.transform = `translateY(${start * itemHeight}px)`;
      window_.innerHTML = '';
      for (let i = start; i <= end; i++) {
        const el = renderItem(items[i], i);
        el.setAttribute('role', 'option');
        el.id = el.id || `vl-item-${i}`;
        el.setAttribute('aria-setsize', String(items.length));
        el.setAttribute('aria-posinset', String(i + 1));
        el.dataset.vlIndex = String(i);
        if (i === activeIndex) el.setAttribute('aria-selected', 'true');
        else el.removeAttribute('aria-selected');
        window_.appendChild(el);
      }
      if (loadError) {
        const row = doc.createElement('div');
        row.className = 'vl-error';
        row.setAttribute('role', 'alert');
        row.innerHTML = `<span>内容加载失败：${loadError}</span>`;
        const retry = doc.createElement('button');
        retry.type = 'button';
        retry.className = 'vl-retry';
        retry.textContent = '重试';
        retry.addEventListener('click', () => loadMore());
        row.appendChild(retry);
        window_.appendChild(row);
      }
      syncActiveDescendant();
    }

    function syncActiveDescendant() {
      if (activeIndex >= 0 && activeIndex < items.length) {
        // 当前项在窗口外时仍保持 id 引用 —— 焦点在容器上，不丢失
        container.setAttribute('aria-activedescendant', `vl-item-${activeIndex}`);
      } else {
        container.removeAttribute('aria-activedescendant');
      }
    }

    function setActive(index, announce) {
      if (index < 0 || index >= items.length) return false;
      activeIndex = index;
      // 确保活动项进入渲染窗口
      const top = activeIndex * itemHeight;
      if (top < container.scrollTop || top > container.scrollTop + viewportItems * itemHeight - itemHeight) {
        container.scrollTop = Math.max(0, top - itemHeight);
      }
      render();
      if (announce && announcer) announcer.announce(`第 ${index + 1} 项，共 ${items.length} 项`);
      return true;
    }

    async function loadMore() {
      if (!onLoadMore || loading) return;
      loading = true; loadError = null; render();
      try {
        const res = await onLoadMore(items.length);
        items = items.concat(res.items);
        total = res.total != null ? res.total : items.length;
        if (announcer) announcer.announce(`已加载 ${items.length} 条，共 ${total} 条`);
      } catch (e) {
        loadError = (e && e.message) || '网络错误';
        if (announcer) announcer.announce(`加载失败：${loadError}，可移动至错误行按重试`, 'assertive');
      } finally {
        loading = false; render();
      }
    }

    function onScroll() {
      render();
      if (onLoadMore && !loading && !loadError && items.length < total) {
        const nearBottom = (container.scrollTop || 0) + viewportItems * itemHeight >= items.length * itemHeight - itemHeight * 2;
        if (nearBottom) loadMore();
      }
    }

    function onKeydown(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIndex + 1, items.length - 1), true); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIndex - 1, 0), true); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0, true); }
      else if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1, true); }
    }

    container.addEventListener('scroll', onScroll);
    container.addEventListener('keydown', onKeydown);

    return {
      setItems(list, t) { items = list.slice(); total = t != null ? t : items.length; activeIndex = items.length ? 0 : -1; render(); },
      appendLoad: loadMore,
      setActive,
      getActiveIndex: () => activeIndex,
      getItems: () => items.slice(),
      isLoading: () => loading,
      getLoadError: () => loadError,
      render
    };
  }
  return { createVirtualList };
});
