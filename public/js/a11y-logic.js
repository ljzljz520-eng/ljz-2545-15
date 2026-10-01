// 慢行 SlowMoves — 纯逻辑层（无 DOM 依赖，可在 Node 中直接单元测试）。
// 地图与列表共享同一份查询状态、同一个 selectedId；本模块保证"双状态"推导一致。

export const ROW_HEIGHT = 72;
export const VIEWPORT_BUFFER = 6; // 上下各多渲染的行数

// ---------- 筛选 ----------
export function filterPoints(points, filters) {
  const kw = (filters.keyword || '').trim().toLowerCase();
  return points.filter((p) => {
    const c = p.content || {};
    const a = p.accessibility || {};
    if (kw) {
      const hay = [c.name, c.summary, c.textAlternative, c.easyRead, c.imageAlt, a.note]
        .filter(Boolean).join('\n').toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    if (filters.kind && p.kind !== filters.kind) return false;
    if (filters.stepFree && !a.stepFree) return false;
    if (filters.wheelchair && a.wheelchair === 'none') return false;
    if (filters.quiet && !a.quietArea) return false;
    if (filters.seating && !a.restSeating) return false;
    if (filters.toilet && !a.accessibleToilet) return false;
    return true;
  });
}

// ---------- 焦点恢复 ----------
// 筛选后原焦点项消失时，把焦点移到"可预测位置"：
// 1) 原项仍存在 → 原项；2) 记录的原索引位置仍在范围内 → 同位置（即原下一项）；
// 3) 否则取最接近且靠后的项；4) 列表为空 → null。绝不跳回页面开头。
export function resolveFocusTarget(prevIds, nextIds, prevFocusedId) {
  if (nextIds.length === 0) return { id: null, reason: 'empty' };
  if (prevFocusedId && nextIds.includes(prevFocusedId)) {
    return { id: prevFocusedId, reason: 'kept' };
  }
  const prevIndex = prevFocusedId ? prevIds.indexOf(prevFocusedId) : -1;
  if (prevIndex >= 0 && prevIndex < nextIds.length) {
    // 同位置即筛选前紧随其后的可见项
    return { id: nextIds[prevIndex], reason: 'same-position' };
  }
  if (prevIndex >= 0) {
    return { id: nextIds[nextIds.length - 1], reason: 'nearest-after' };
  }
  return { id: nextIds[0], reason: 'first' };
}

export function describeFilterChange({ prevCount, nextCount, focusLabel, reason }) {
  const parts = [`筛选完成，共 ${nextCount} 个点位（原 ${prevCount} 个）`];
  if (nextCount === 0) parts.push('没有匹配点位，焦点位于清空结果提示，可修改筛选条件');
  else if (reason === 'kept') parts.push(`焦点保留在 ${focusLabel}`);
  else if (reason === 'same-position') parts.push(`原焦点项已被筛除，焦点移到同位置的下一项：${focusLabel}`);
  else if (reason === 'nearest-after') parts.push(`原焦点项及其后项目均被筛除，焦点移到最后一个匹配项：${focusLabel}`);
  else parts.push(`焦点位于 ${focusLabel}`);
  return parts.join('。');
}

// ---------- 虚拟列表窗口 ----------
// 返回应渲染的行区间。焦点行与选中行必须始终被包含，避免滚出视口后焦点丢失。
export function computeVirtualRange({ itemCount, scrollTop, viewportH, rowHeight = ROW_HEIGHT, buffer = VIEWPORT_BUFFER, pinnedIndexes = [] }) {
  if (itemCount === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  const visibleCount = Math.ceil(viewportH / rowHeight);
  let start = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
  let end = Math.min(itemCount, start + visibleCount + buffer * 2);
  for (const idx of pinnedIndexes) {
    if (idx < 0 || idx >= itemCount) continue;
    if (idx < start) start = Math.max(0, idx - buffer);
    if (idx >= end) end = Math.min(itemCount, idx + buffer + 1);
  }
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: (itemCount - end) * rowHeight
  };
}

// 焦点/选中滚出虚拟窗口时，计算让其重新可见的滚动位置（保持可预测的最小滚动）。
export function ensureIndexVisible(scrollTop, viewportH, index, rowHeight = ROW_HEIGHT) {
  const top = index * rowHeight;
  const bottom = top + rowHeight;
  if (top < scrollTop) return top - rowHeight;
  if (bottom > scrollTop + viewportH) return bottom - viewportH + rowHeight;
  return scrollTop;
}

// ---------- 偏好跨设备同步 ----------
// 应用服务端偏好到"当前会话草稿"。规则：
// - 会话内已经被用户改动过的字段不被云端旧值覆盖（保留当前会话操作）；
// - 仅在云端 rev 更新且字段未被本地触碰时采用；
// - 返回是否真的发生了会影响表现层的变化（字号等），供调用方决定是否播报。
export function reconcilePrefs({ local, server, touched }) {
  const next = { ...local };
  const changed = [];
  for (const key of Object.keys(server)) {
    if (key === 'rev' || key === 'updatedAt' || key === 'userId') continue;
    if (touched.has(key)) continue; // 会话内已手动改：保留当前会话操作
    if (next[key] !== server[key]) {
      next[key] = server[key];
      changed.push(key);
    }
  }
  next.rev = server.rev;
  next.updatedAt = server.updatedAt;
  return { next, changed };
}

// 旧请求识别：带 requestSeq 的响应，只有最新一次请求允许落地。
// 旧请求绝不能突然改变字号或焦点。
export function isStaleResponse(requestSeq, latestSeq) {
  return requestSeq < latestSeq;
}

// 构造乐观更新后的本地状态（先改 UI，保存失败再回滚），并标记 touched。
export function optimisticPref(local, field, value) {
  return { next: { ...local, [field]: value }, touched: [field] };
}

// ---------- 同一选中项 ----------
// 地图标记与列表行共享 selectedId；当选中项因筛选消失，选择应清空（而非悄悄落到别的项）。
export function reconcileSelection(selectedId, visibleIds) {
  if (selectedId && !visibleIds.includes(selectedId)) return null;
  return selectedId;
}

// 地图 ↔ 列表双向定位：共享查询状态下，用同一个 id 找两侧索引。
export function locateInBoth(selectedId, listIds) {
  const listIndex = listIds.indexOf(selectedId);
  return {
    selectedId,
    listIndex, // -1 表示当前筛选结果中不可见
    visible: listIndex !== -1
  };
}

// ---------- 定位授权 ----------
export function geoErrorToMessage(error) {
  switch (error && error.code) {
    case 1: return { code: 'denied', title: '未获得定位授权', message: '你可以拒绝授权——这不影响使用。可在下方筛选条件或路线列表中直接选择点位。' };
    case 2: return { code: 'unavailable', title: '暂时无法定位', message: '设备或浏览器没有提供位置信息。请改用列表浏览。' };
    case 3: return { code: 'timeout', title: '定位超时', message: '获取位置时间过长，已停止。可重试或直接浏览路线列表。' };
    default: return { code: 'unknown', title: '定位失败', message: '未能获取你的位置，列表与地图仍可正常使用。' };
  }
}

// 两点间直线距离（km，Haversine）
export function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- 虚拟列表键盘 ----------
export function nextFocusIndex(current, key, itemCount) {
  if (itemCount === 0) return -1;
  if (current < 0) return key === 'ArrowUp' || key === 'Home' ? 0 : 0;
  switch (key) {
    case 'ArrowDown': return Math.min(itemCount - 1, current + 1);
    case 'ArrowUp': return Math.max(0, current - 1);
    case 'Home': return 0;
    case 'End': return itemCount - 1;
    case 'PageDown': return Math.min(itemCount - 1, current + 5);
    case 'PageUp': return Math.max(0, current - 5);
    default: return current;
  }
}
