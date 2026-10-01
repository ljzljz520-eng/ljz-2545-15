// 内容弹层：点位详情（含同版文字与替代说明）、对比、投稿。
// 弹层嵌套：详情（一级）→ 对比/投稿（二级）；Esc 逐层关闭，焦点逐层返回，最终回到列表/地图原项。
import { say, sayAlert } from './announcer.js';

export function createContentDialogs({ store, dialogs, listView, mapView, lazyImages }) {
  const detail = document.getElementById('detail-dialog');
  const compare = document.getElementById('compare-dialog');
  const contribute = document.getElementById('contribute-dialog');

  function openDetail(pointId, opts = {}) {
    const p = store.getState().points.find((x) => x.id === pointId);
    if (!p) return;
    store.set({ selectedId: pointId });
    mapView.render();
    listView.render();

    const body = detail.querySelector('.dialog__body');
    body.innerHTML = detailHTML(p);
    detail.querySelector('.dialog__title').textContent = p.content.name;

    const returnTo = opts.returnTo || document.activeElement;
    dialogs.open(detail, { returnTo, labelledBy: 'detail-title' });
    say(`已打开 ${p.content.name} 详情弹层。`);

    body.querySelector('[data-action="compare-add"]').addEventListener('click', () => openCompare(pointId));
    body.querySelector('[data-action="contribute"]').addEventListener('click', () => openContribute(pointId));
  }

  function a11yRows(a) {
    const rows = [
      ['台阶情况', a.stepFree ? '全程无台阶' : '存在台阶'],
      ['轮椅通行', { full: '可全程独立通行', partial: '部分路段可行，建议结伴', none: '轮椅无法通行' }[a.wheelchair]],
      ['盲道', { full: '连续完整', partial: '部分不连续', none: '没有盲道' }[a.tactilePaving]],
      ['休息座椅', a.restSeating ? '有' : '无'],
      ['遮雨处', a.shelter ? '有' : '无'],
      ['无障碍卫生间', a.accessibleToilet ? '有' : '无'],
      ['夜间照明', { good: '良好', average: '一般', poor: '较差' }[a.lighting]],
      ['拥挤程度', { low: '人少', medium: '适中', high: '拥挤' }[a.crowdLevel]],
      ['安静区域', a.quietArea ? '有安静区域' : '无'],
      ['现场备注', a.note || '无']
    ];
    return rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('');
  }

  function detailHTML(p) {
    const c = p.content;
    return `
      <p class="version-tag">内容版本 v${c.contentVersion}${c.contentVersion === c.currentVersion ? '（最新）' : '（历史版本）'} · 更新于 ${new Date(c.updatedAt).toLocaleString('zh-CN')}</p>
      <section class="detail-block">
        <h4>一句话说明</h4>
        <p>${escapeHTML(c.summary)}</p>
      </section>
      <section class="detail-block">
        <h4>文字替代说明（与地图、列表同版）</h4>
        <p>${escapeHTML(c.textAlternative)}</p>
      </section>
      <section class="detail-block">
        <h4>易读版</h4>
        <p>${escapeHTML(c.easyRead || '暂无易读版说明')}</p>
      </section>
      <section class="detail-block">
        <h4>图片说明</h4>
        <p class="muted">${escapeHTML(c.imageAlt)}</p>
      </section>
      <section class="detail-block">
        <h4>无障碍元数据</h4>
        <table class="a11y-table"><tbody>${a11yRows(p.accessibility)}</tbody></table>
      </section>
      <div class="dialog__actions">
        <button type="button" class="btn" data-action="compare-add">加入对比</button>
        <button type="button" class="btn btn--primary" data-action="contribute">更新文字与图片说明（投稿）</button>
      </div>`;
  }

  // ---------- 对比（二级弹层，从详情打开） ----------
  let compareIds = [];
  function openCompare(firstId) {
    compareIds = firstId ? [firstId] : compareIds.slice(0, 2);
    renderCompare();
    dialogs.open(compare, { returnTo: document.activeElement, labelledBy: 'compare-title' });
  }
  function renderCompare() {
    const body = compare.querySelector('.dialog__body');
    const s = store.getState();
    const options = s.points.map((p) => `<option value="${p.id}">${p.content.name}</option>`).join('');
    body.innerHTML = `
      <p class="muted">选择两个点位，比较无障碍条件。此弹层从详情弹层打开，关闭后焦点返回详情弹层。</p>
      <div class="compare-pickers">
        <label>第一处
          <select data-slot="0"><option value="">请选择…</option>${options}</select>
        </label>
        <label>第二处
          <select data-slot="1"><option value="">请选择…</option>${options}</select>
        </label>
      </div>
      <div class="compare-output" role="region" aria-live="polite" aria-label="对比结果"></div>`;
    const selects = body.querySelectorAll('select');
    selects.forEach((sel) => {
      const slot = Number(sel.dataset.slot);
      sel.value = compareIds[slot] || '';
      sel.addEventListener('change', () => {
        compareIds[slot] = sel.value;
        renderCompareOutput(body.querySelector('.compare-output'));
      });
    });
    renderCompareOutput(body.querySelector('.compare-output'));
  }
  function renderCompareOutput(out) {
    const s = store.getState();
    const [a, b] = compareIds.map((id) => s.points.find((p) => p.id === id)).filter(Boolean);
    if (!a || !b) {
      out.innerHTML = `<p class="muted">${!a && !b ? '请选择两个点位。' : '请再选择一处点位进行对比。'}</p>`;
      return;
    }
    const dims = [
      ['无台阶', (x) => (x.accessibility.stepFree ? '是' : '否')],
      ['轮椅通行', (x) => ({ full: '全程可行', partial: '部分可行', none: '不可行' }[x.accessibility.wheelchair])],
      ['盲道', (x) => ({ full: '连续', partial: '部分', none: '无' }[x.accessibility.tactilePaving])],
      ['休息座椅', (x) => (x.accessibility.restSeating ? '有' : '无')],
      ['无障碍卫生间', (x) => (x.accessibility.accessibleToilet ? '有' : '无')],
      ['拥挤程度', (x) => ({ low: '人少', medium: '适中', high: '拥挤' }[x.accessibility.crowdLevel])]
    ];
    const rows = dims.map(([label, get]) => {
      const va = get(a); const vb = get(b);
      return `<tr><th scope="row">${label}</th><td class="${va === vb ? 'same' : 'diff'}">${va}</td><td class="${va === vb ? 'same' : 'diff'}">${vb}</td></tr>`;
    }).join('');
    out.innerHTML = `
      <table class="a11y-table compare-table">
        <thead><tr><th scope="col">比较项</th><th scope="col">${escapeHTML(a.content.name)}</th><th scope="col">${escapeHTML(b.content.name)}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="compare-verdict" aria-live="polite">结论：${verdict(a, b)}</p>`;
    say(`对比结果已更新：${a.content.name} 与 ${b.content.name}。`);
  }
  function verdict(a, b) {
    const score = (x) => [x.accessibility.stepFree, x.accessibility.wheelchair === 'full', x.accessibility.tactilePaving === 'full', x.accessibility.restSeating, x.accessibility.accessibleToilet].filter(Boolean).length;
    const sa = score(a); const sb = score(b);
    if (sa === sb) return `两处无障碍条件接近（${sa}/5）`;
    return sa > sb ? `${a.content.name}的无障碍条件更好（${sa}/5 对 ${sb}/5）` : `${b.content.name}的无障碍条件更好（${sb}/5 对 ${sa}/5）`;
  }

  // ---------- 投稿（二级弹层，纯键盘可完成） ----------
  function openContribute(pointId) {
    const p = store.getState().points.find((x) => x.id === pointId);
    const body = contribute.querySelector('.dialog__body');
    body.innerHTML = contributeFormHTML(p);
    body.querySelector('.contribute-point').textContent = p.content.name;
    body.querySelector('.contribute-ver').textContent = `当前 v${p.content.contentVersion}`;

    const form = body.querySelector('form');
    fillFormFromContent(form, p.content);

    // 图片说明字符计数
    const alt = form.elements.imageAlt;
    const counter = body.querySelector('[data-alt-count]');
    alt.addEventListener('input', () => { counter.textContent = `${alt.value.trim().length}/300`; });

    // 纯键盘完成投稿：字段错误用 aria-describedby 关联内联错误，焦点移到第一个错误字段
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitContribution(form, p);
    });
    dialogs.open(contribute, { returnTo: document.activeElement, labelledBy: 'contribute-title' });
  }

  function contributeFormHTML(p) {
    return `
      <p class="muted">为 <strong class="contribute-point"></strong>（<span class="contribute-ver"></span>）发布新的内容版本。名称、一句话说明、文字替代说明、图片说明均为发布必需项；后端会拒绝缺少必需替代说明的内容版。</p>
      <form novalidate>
        ${fieldHTML('name', '点位名称（必需）', 'text', true)}
        ${fieldHTML('summary', '一句话说明（必需，10-160 字）', 'textarea', true, 3)}
        ${fieldHTML('textAlternative', '文字替代说明（必需，20-1000 字）：给看不到地图的人描述位置与走法', 'textarea', true, 5)}
        ${fieldHTML('imageAlt', '图片说明 alt（必需，5-300 字）', 'textarea', true, 3)}
        ${fieldHTML('easyRead', '易读版说明（可选）', 'textarea', false, 3)}
        <p class="field-count" data-alt-count="1">0/300</p>
        <div class="form-error" role="alert" hidden></div>
        <div class="dialog__actions">
          <button type="submit" class="btn btn--primary">发布新版本</button>
          <button type="button" class="btn" data-draft="1">仅存草稿</button>
        </div>
      </form>`;
  }
  function fieldHTML(name, label, type, required, rows = 2) {
    const control = type === 'textarea'
      ? `<textarea id="cf-${name}" name="${name}" rows="${rows}" aria-describedby="cf-${name}-error"></textarea>`
      : `<input id="cf-${name}" name="${name}" type="${type}" aria-describedby="cf-${name}-error">`;
    return `
      <div class="field" data-field="${name}">
        <label for="cf-${name}">${label}${required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
        ${control}
        <p class="field-error" id="cf-${name}-error" hidden></p>
      </div>`;
  }
  function fillFormFromContent(form, c) {
    for (const k of ['name', 'summary', 'textAlternative', 'imageAlt', 'easyRead']) {
      if (form.elements[k] && c[k]) form.elements[k].value = c[k];
    }
    form.elements.imageAlt.dispatchEvent(new Event('input'));
  }

  async function submitContribution(form, point) {
    const payload = {
      name: form.elements.name.value,
      summary: form.elements.summary.value,
      textAlternative: form.elements.textAlternative.value,
      imageAlt: form.elements.imageAlt.value,
      easyRead: form.elements.easyRead.value
    };
    clearErrors(form);
    const errBox = form.querySelector('.form-error');
    errBox.hidden = true;

    const submitter = document.activeElement;
    const action = submitter?.dataset?.draft === '1' ? 'draft' : 'publish';
    if (action === 'draft') payload.action = 'draft';

    const res = await fetch(`/api/points/${point.id}/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await res.json();

    if (!res.ok) {
      const errors = body.errors || [];
      for (const err of errors) {
        const slot = form.querySelector(`[data-field="${err.field}"] .field-error`);
        if (slot) { slot.textContent = err.message; slot.hidden = false; form.elements[err.field]?.setAttribute('aria-invalid', 'true'); }
      }
      errBox.textContent = body.blocked
        ? '发布被后端拒绝：存在缺失或不合规的必需替代说明，请根据各字段提示补全后再发布。'
        : (body.message || '提交失败，请检查表单。');
      errBox.hidden = false;
      const firstInvalid = form.querySelector('[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus();
      sayAlert(errBox.textContent);
      return;
    }

    // 发布成功：用新版本更新内存中的同版文字
    await refreshPointContent(point.id, body.version);
    sayAlert(`${point.content.name}的内容版本 v${body.version} 已发布，地图、列表与图片说明使用同一新版本。`);
    // 关闭二级弹层，焦点先回详情，再刷新详情内容
    dialogs.close(contribute);
    const fresh = store.getState().points.find((x) => x.id === point.id);
    detail.querySelector('.dialog__title').textContent = fresh.content.name;
    detail.querySelector('.dialog__body').innerHTML = detailHTML(fresh);
    bindDetailActions(fresh);
    lazyImages.refreshAlt(point.id);
  }

  function bindDetailActions(p) {
    const body = detail.querySelector('.dialog__body');
    body.querySelector('[data-action="compare-add"]').addEventListener('click', () => openCompare(p.id));
    body.querySelector('[data-action="contribute"]').addEventListener('click', () => openContribute(p.id));
  }

  async function refreshPointContent(pointId, version) {
    const res = await fetch(`/api/points/${pointId}/content?version=${version}`);
    const content = await res.json();
    const s = store.getState();
    const points = s.points.map((p) => p.id === pointId
      ? { ...p, content, image: { ...p.image, alt: content.imageAlt }, currentVersion: version }
      : p);
    store.set({ points });
    mapView.render();
    listView.render();
  }

  // 顶部关闭按钮（所有弹层通用）
  for (const dlg of [detail, compare, contribute]) {
    dlg.querySelector('[data-close]').addEventListener('click', () => dialogs.close(dlg));
    const backdrop = dlg.closest('.dialog-backdrop');
    if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) dialogs.close(dlg); });
  }

  return { openDetail, openCompare };
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
