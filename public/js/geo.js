// 无定位授权处理：拒绝授权不阻断任何流程；给出状态说明与替代路径。
import { geoErrorToMessage, distanceKm } from './a11y-logic.js';
import { say, sayAlert } from './announcer.js';

export function createGeo({ store, listView, onPointSelect }) {
  const btn = document.getElementById('geo-btn');
  const status = document.getElementById('geo-status');
  const listbox = document.getElementById('nearby-list');

  function renderStatus() {
    const g = store.getState().geo;
    if (g.status === 'idle') {
      status.hidden = true;
      return;
    }
    status.hidden = false;
    status.className = `geo-status geo-status--${g.status}`;
    if (g.status === 'requesting') {
      status.textContent = '正在请求定位授权并获取位置…';
      return;
    }
    if (g.status === 'denied' || g.status === 'error') {
      const info = geoErrorToMessage(g.error);
      status.innerHTML = '';
      const title = document.createElement('strong');
      title.textContent = info.title + '。';
      const msg = document.createElement('span');
      msg.textContent = info.message;
      const altBtn = document.createElement('button');
      altBtn.type = 'button';
      altBtn.className = 'link-btn';
      altBtn.textContent = '改用"无台阶"筛选浏览';
      altBtn.addEventListener('click', () => {
        document.getElementById('f-stepfree').checked = true;
        document.getElementById('f-stepfree').dispatchEvent(new Event('change'));
      });
      status.append(title, ' ', msg, ' ', altBtn);
      sayAlert(`${info.title}。${info.message}`);
      return;
    }
    if (g.status === 'success') {
      status.textContent = `已定位（模拟坐标 ${g.pos.lat.toFixed(4)}, ${g.pos.lng.toFixed(4)}），以下按距离排序。`;
      say('定位成功，已按离你由近到远排序点位。');
    }
  }

  function renderNearby() {
    const s = store.getState();
    if (s.geo.status !== 'success') { listbox.hidden = true; return; }
    listbox.hidden = false;
    const ranked = s.points
      .map((p) => ({ p, d: distanceKm(s.geo.pos, p) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    listbox.innerHTML = '<h3>离你最近的点位（替代地图定位的文字列表）</h3>';
    const ul = document.createElement('ul');
    ul.className = 'nearby-ul';
    for (const { p, d } of ranked) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'link-btn';
      btn.textContent = `${p.content.name} — 约 ${d.toFixed(1)} 公里，${p.accessibility.stepFree ? '无台阶' : '有台阶'}`;
      btn.addEventListener('click', () => {
        store.set({ selectedId: p.id, focusId: p.id });
        if (onPointSelect) onPointSelect(p.id);
      });
      li.appendChild(btn);
      ul.appendChild(li);
    }
    listbox.appendChild(ul);
  }

  btn.addEventListener('click', () => {
    store.set({ geo: { status: 'requesting', pos: null, error: null } });
    renderStatus();

    const fail = new URLSearchParams(location.search).get('geo');
    if (fail === 'denied') {
      // 验收模式：?geo=denied 直接模拟拒绝授权
      setTimeout(() => {
        store.set({ geo: { status: 'denied', pos: null, error: { code: 1 } } });
        renderStatus();
      }, 200);
      return;
    }
    if (!navigator.geolocation) {
      store.set({ geo: { status: 'error', pos: null, error: { code: 2 } } });
      renderStatus();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        store.set({ geo: { status: 'success', pos: { lat: pos.coords.latitude, lng: pos.coords.longitude }, error: null } });
        renderStatus(); renderNearby();
      },
      (err) => {
        store.set({ geo: { status: err.code === 1 ? 'denied' : 'error', pos: null, error: err } });
        renderStatus();
      },
      { timeout: 6000, maximumAge: 300000 }
    );
  });

  return { renderStatus, renderNearby };
}
