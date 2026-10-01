import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterPoints, resolveFocusTarget, describeFilterChange,
  computeVirtualRange, ensureIndexVisible, reconcilePrefs,
  isStaleResponse, reconcileSelection, locateInBoth,
  geoErrorToMessage, distanceKm, nextFocusIndex, ROW_HEIGHT
} from '../public/js/a11y-logic.js';

function P(id, a = {}, c = {}) {
  return {
    id, kind: 'view',
    accessibility: { stepFree: true, wheelchair: 'full', restSeating: false, accessibleToilet: false, quietArea: false, note: '', ...a },
    content: { name: id, summary: 'summary text', textAlternative: 'alternative text body', easyRead: '', imageAlt: 'alt text', ...c }
  };
}

test('筛选：无台阶 / 轮椅 / 关键词在同一份查询状态上工作', () => {
  const points = [P('a', { stepFree: false }), P('b', { stepFree: true, wheelchair: 'none' }), P('c')];
  assert.deepEqual(filterPoints(points, { stepFree: true }).map((p) => p.id), ['b', 'c']);
  assert.deepEqual(filterPoints(points, { wheelchair: true }).map((p) => p.id), ['a', 'c']);
  assert.deepEqual(filterPoints(points, { keyword: 'c-name' }).map((p) => p.id), []);
  assert.deepEqual(filterPoints(points, { keyword: 'alt text' }).map((p) => p.id), ['a', 'b', 'c']);
});

test('焦点恢复：原项仍在 → kept', () => {
  assert.deepEqual(resolveFocusTarget(['a', 'b', 'c'], ['a', 'c'], 'a'), { id: 'a', reason: 'kept' });
});

test('焦点恢复：原焦点项消失 → 同位置的下一项，绝不跳回开头', () => {
  // 焦点在 b（索引1），b 被筛除，c（新列表索引1）成为同位置目标
  assert.deepEqual(resolveFocusTarget(['a', 'b', 'c'], ['a', 'c'], 'b'), { id: 'c', reason: 'same-position' });
  // 焦点在 a（索引0），a 消失 → 新索引 0 项（b 上移），不是页面开头
  assert.deepEqual(resolveFocusTarget(['a', 'b', 'c'], ['b', 'c'], 'a'), { id: 'b', reason: 'same-position' });
});

test('焦点恢复：原位置之后均无匹配 → 落到最后一个匹配项（nearest-after）', () => {
  // 焦点在 c（索引2），只剩 a,b
  assert.deepEqual(resolveFocusTarget(['a', 'b', 'c'], ['a', 'b'], 'c'), { id: 'b', reason: 'nearest-after' });
});

test('焦点恢复：结果为空 → empty，调用方应把焦点交给"清空筛选"按钮', () => {
  assert.deepEqual(resolveFocusTarget(['a'], [], 'a'), { id: null, reason: 'empty' });
});

test('筛选变化播报包含数量与焦点去向', () => {
  const msg = describeFilterChange({ prevCount: 12, nextCount: 4, focusLabel: '断桥残雪', reason: 'same-position' });
  assert.match(msg, /4 个点位/);
  assert.match(msg, /同位置的下一项/);
  assert.match(msg, /断桥残雪/);
  const emptyMsg = describeFilterChange({ prevCount: 12, nextCount: 0, focusLabel: '', reason: 'empty' });
  assert.match(emptyMsg, /没有匹配点位/);
});

test('虚拟列表：焦点行/选中行滚出视口时仍被纳入渲染范围', () => {
  // 1000 行，滚动到很后面，焦点在第 2 行
  const r1 = computeVirtualRange({ itemCount: 1000, scrollTop: 900 * ROW_HEIGHT, viewportH: 400, pinnedIndexes: [2, -1] });
  assert.ok(r1.start <= 2 && r1.end > 2, '焦点行必须渲染');
  // 选中行在下方远处也应被纳入
  const r2 = computeVirtualRange({ itemCount: 1000, scrollTop: 0, viewportH: 400, pinnedIndexes: [950] });
  assert.ok(r2.end > 950, '选中行必须渲染');
  // 空列表
  assert.deepEqual(computeVirtualRange({ itemCount: 0, scrollTop: 0, viewportH: 400 }), { start: 0, end: 0, padTop: 0, padBottom: 0 });
});

test('虚拟列表：padding 与未渲染行数一致（总高度不变）', () => {
  const r = computeVirtualRange({ itemCount: 100, scrollTop: 50 * ROW_HEIGHT, viewportH: 360 });
  assert.equal(r.padTop, r.start * ROW_HEIGHT);
  assert.equal(r.padBottom, (100 - r.end) * ROW_HEIGHT);
});

test('ensureIndexVisible：最小滚动让目标行可见', () => {
  assert.equal(ensureIndexVisible(0, 360, 0), 0);
  assert.ok(ensureIndexVisible(0, 360, 10) > 0);
  assert.equal(ensureIndexVisible(1000, 360, 0), -ROW_HEIGHT);
});

test('偏好合并：会话内 touched 字段不被云端覆盖（保留当前会话操作）', () => {
  const { next, changed } = reconcilePrefs({
    local: { baseFontRem: 1.5, highContrast: false, rev: 3 },
    server: { baseFontRem: 1, highContrast: true, rev: 4, updatedAt: 't', userId: 'demo' },
    touched: new Set(['baseFontRem'])
  });
  assert.equal(next.baseFontRem, 1.5, '本地刚改的字号不被旧云端值覆盖');
  assert.equal(next.highContrast, true, '未触碰字段采用云端');
  assert.deepEqual(changed, ['highContrast']);
  assert.equal(next.rev, 4);
});

test('旧请求识别：序号更小的响应必须被丢弃（不得改变字号/焦点）', () => {
  assert.equal(isStaleResponse(1, 3), true);
  assert.equal(isStaleResponse(3, 3), false);
  assert.equal(isStaleResponse(5, 3), false);
});

test('同一选中项：被筛除时清空，不错位到其他项；地图/列表定位一致', () => {
  assert.equal(reconcileSelection('b', ['a', 'b', 'c']), 'b');
  assert.equal(reconcileSelection('x', ['a', 'b']), null);
  assert.deepEqual(locateInBoth('b', ['a', 'b', 'c']), { selectedId: 'b', listIndex: 1, visible: true });
  assert.equal(locateInBoth('z', ['a']).visible, false);
});

test('定位：拒绝授权给出友好说明而非阻断', () => {
  const m = geoErrorToMessage({ code: 1 });
  assert.equal(m.code, 'denied');
  assert.match(m.message, /拒绝/);
  const t = geoErrorToMessage({ code: 3 });
  assert.equal(t.code, 'timeout');
});

test('距离计算合理（西湖周边公里级）', () => {
  const d = distanceKm({ lat: 30.2587, lng: 120.1458 }, { lat: 30.2317, lng: 120.1472 });
  assert.ok(d > 2.5 && d < 3.5, `got ${d}`);
});

test('键盘：roving 焦点移动有界，Home/End/Page 均可预测', () => {
  assert.equal(nextFocusIndex(0, 'ArrowDown', 10), 1);
  assert.equal(nextFocusIndex(9, 'ArrowDown', 10), 9);
  assert.equal(nextFocusIndex(9, 'ArrowUp', 10), 8);
  assert.equal(nextFocusIndex(0, 'ArrowUp', 10), 0);
  assert.equal(nextFocusIndex(5, 'Home', 10), 0);
  assert.equal(nextFocusIndex(0, 'End', 10), 9);
  assert.equal(nextFocusIndex(0, 'PageDown', 10), 5);
  assert.equal(nextFocusIndex(2, 'PageUp', 10), 0);
});
