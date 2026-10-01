// 偏好跨设备同步。
// 关键不变量：
// 1) 字号只是表现层：所有尺寸用 rem，切换只改 :root font-size；
// 2) 用户当前会话内手动改过的字段（touched）不被云端推送覆盖；
// 3) 每次请求带递增序号，旧响应晚到也不会改变字号/焦点；
// 4) 409 冲突时拉取服务端版本，仅合入未被本地触碰的字段，并播报变化。
import { reconcilePrefs } from './a11y-logic.js';
import { say, sayAlert } from './announcer.js';
import { latestRequest } from './store.js';

const request = latestRequest();

export function createPrefs({ store, userId = 'demo' }) {
  const root = document.documentElement;
  const controls = {
    font: document.getElementById('pref-font'),
    contrast: document.getElementById('pref-contrast'),
    motion: document.getElementById('pref-motion'),
    sync: document.getElementById('pref-sync'),
    status: document.getElementById('pref-status')
  };

  function applyPresentation(prefs, { announce = false, changed = [] } = {}) {
    root.style.fontSize = `${Math.round(prefs.baseFontRem * 100)}%`;
    root.classList.toggle('high-contrast', !!prefs.highContrast);
    root.classList.toggle('reduce-motion', !!prefs.reduceMotion);
    controls.font.value = String(prefs.baseFontRem);
    controls.contrast.checked = !!prefs.highContrast;
    controls.motion.checked = !!prefs.reduceMotion;
    if (announce && changed.length) {
      const names = changed.map(fieldName).join('、');
      say(`已应用其他设备同步过来的偏好：${names}。当前会话中你手动修改过的设置保持不变。`);
    }
  }

  function fieldName(k) {
    return { baseFontRem: '字号', highContrast: '高对比度', reduceMotion: '减少动态' }[k] || k;
  }

  function setStatus(text, tone = 'info') {
    controls.status.dataset.tone = tone;
    controls.status.textContent = text;
  }

  // 本地立即生效（乐观更新），再异步 PUT；失败回滚并保留焦点
  async function update(field, value) {
    const s = store.getState();
    const before = s.prefs;
    const next = { ...before, [field]: value };
    s.touched.add(field);
    store.set({ prefs: next });
    applyPresentation(next);
    setStatus('正在保存到云端…');

    const res = await request(`/api/users/${userId}/prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value, baseRev: before.rev })
    });
    if (res.isStale) return; // 旧请求：绝不改变字号或焦点
    if (!res.ok) {
      if (res.status === 409) {
        setStatus('检测到其他设备已更新，正在合并…', 'warn');
        const merged = reconcilePrefs({
          local: store.getState().prefs,
          server: res.body.server,
          touched: store.getState().touched
        });
        store.set({ prefs: merged.next });
        applyPresentation(merged.next, { announce: true, changed: merged.changed });
        setStatus('已合并：保留你本次会话的修改，其余采用云端最新版', 'ok');
        // 合并后基于最新 rev 重试保存被触碰字段（当前会话操作优先）
        const touchPatch = Object.fromEntries(
          [...store.getState().touched].map((k) => [k, store.getState().prefs[k]])
        );
        const retry = await request(`/api/users/${userId}/prefs`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...touchPatch, baseRev: merged.next.rev })
        });
        if (retry.ok) {
          store.set({ prefs: { ...store.getState().prefs, ...retry.body } });
          setStatus(`已合并并保存你的本次修改（rev ${retry.body.rev}）`, 'ok');
        } else {
          setStatus('合并成功，但你的修改保存失败，可稍后重试', 'warn');
        }
      } else {
        // 回滚字号，但焦点不动
        store.set({ prefs: before });
        applyPresentation(before);
        setStatus(`保存失败，已恢复本次改动前的设置：${res.body?.message || res.status}`, 'error');
        sayAlert('偏好保存失败，已恢复为之前的字号与显示设置。');
      }
      return;
    }
    store.set({ prefs: { ...store.getState().prefs, ...res.body } });
    setStatus(`已同步（版本 rev ${res.body.rev}）`, 'ok');
  }

  async function pullRemote({ announce = true } = {}) {
    const res = await request(`/api/users/${userId}/prefs`);
    if (res.isStale) return; // 旧请求落地保护
    if (!res.ok) {
      if (announce) setStatus('云端暂无偏好或拉取失败，继续使用本机设置', 'warn');
      return;
    }
    const s = store.getState();
    const { next, changed } = reconcilePrefs({ local: s.prefs, server: res.body, touched: s.touched });
    store.set({ prefs: next });
    applyPresentation(next, { announce, changed });
    if (announce) setStatus(changed.length ? '已同步其他设备的改动，你本次会话手动修改的项保持不变' : '云端偏好与本机一致', 'ok');
  }

  controls.font.addEventListener('change', () => update('baseFontRem', Number(controls.font.value)));
  controls.contrast.addEventListener('change', () => update('highContrast', controls.contrast.checked));
  controls.motion.addEventListener('change', () => update('reduceMotion', controls.motion.checked));
  controls.sync.addEventListener('click', () => pullRemote({ announce: true }));

  return { applyPresentation, pullRemote, update };
}
