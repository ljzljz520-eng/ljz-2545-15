// 慢行 SlowMoves HTTP 服务：零依赖 Node http。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDB } from './lib/db.js';
import { validateContentVersion, validatePrefsPatch } from './lib/validation.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);
const db = getDB();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJSON(res, status, body, headers = {}) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(buf);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload-too-large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('bad-json')); }
    });
    req.on('error', reject);
  });
}

// 点位序列化：始终附带当前内容版本（与地图、列表同版的文字与替代说明）。
function serializePoint(p, { version } = {}) {
  return {
    id: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    kind: p.kind,
    accessibility: p.accessibility,
    image: { ...p.image, alt: p.image.alt },
    content: db.pointContent(p, version)
  };
}

function applyFilters(points, q) {
  let out = points;
  if (q.keyword) {
    const kw = String(q.keyword).trim().toLowerCase();
    if (kw) {
      out = out.filter((p) => {
        const c = db.pointContent(p);
        return [c.name, c.summary, c.textAlternative, c.easyRead, c.imageAlt, p.accessibility.note]
          .some((t) => (t || '').toLowerCase().includes(kw));
      });
    }
  }
  if (q.kind) out = out.filter((p) => p.kind === q.kind);
  if (q.stepFree === 'true') out = out.filter((p) => p.accessibility.stepFree);
  if (q.wheelchair) {
    const level = { full: 3, partial: 2, none: 1 }[q.wheelchair] || 0;
    out = out.filter((p) => ({ full: 3, partial: 2, none: 1 })[p.accessibility.wheelchair] >= level);
  }
  if (q.quiet === 'true') out = out.filter((p) => p.accessibility.quietArea);
  if (q.seating === 'true') out = out.filter((p) => p.accessibility.restSeating);
  if (q.toilet === 'true') out = out.filter((p) => p.accessibility.accessibleToilet);
  return out;
}

// 媒体接口：支持用 ?fail=1 / ?flaky=1 模拟懒加载失败，供验收。
async function mediaHandler(req, res, url) {
  if (url.searchParams.get('fail') === '1') {
    sendJSON(res, 503, { error: 'media-unavailable', message: '图片服务暂时不可用（验收模拟：懒加载失败）' });
    return;
  }
  if (url.searchParams.get('flaky') === '1' && Math.random() < 0.8) {
    sendJSON(res, 500, { error: 'media-flaky', message: '图片服务波动，请重试（验收模拟）' });
    return;
  }
  const id = url.searchParams.get('id') || 'p01';
  const point = db.getPoint(id) || db.listPoints()[0];
  const hueMap = { view: 200, path: 130, park: 90, landmark: 35, rest: 280, transport: 45, poi: 180 };
  const hue = hueMap[point.kind] ?? 180;
  const alt = point.image.alt;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300" role="img" aria-label="${escapeXml(alt)}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue},55%,72%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},50%,55%)"/>
  </linearGradient></defs>
  <rect width="480" height="300" fill="url(#g)"/>
  <circle cx="390" cy="70" r="34" fill="rgba(255,255,255,.85)"/>
  <path d="M0 230 Q120 170 240 220 T480 210 V300 H0 Z" fill="rgba(255,255,255,.35)"/>
  <path d="M0 262 Q140 210 280 252 T480 246 V300 H0 Z" fill="rgba(255,255,255,.55)"/>
  <text x="24" y="48" font-family="sans-serif" font-size="22" fill="#1a202c">${escapeXml(point.name)}</text>
  <text x="24" y="78" font-family="sans-serif" font-size="13" fill="#2d3748">慢行点位图 · 内容版本 v${point.currentVersion}</text>
</svg>`;
  res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
  res.end(svg);
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

async function apiHandler(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;

  // GET /api/state — 一次拉取共享查询所需的全部初始数据（筛选/地图/列表同一份）
  if (method === 'GET' && url.pathname === '/api/state') {
    const points = db.listPoints().map((p) => serializePoint(p));
    const routes = db.listRoutes().map((r) => ({
      ...r,
      stops: db.expandRoute(r).map((s) => ({ ...s, content: s.content }))
    }));
    return sendJSON(res, 200, {
      contentSequence: db.data.meta.contentSequence,
      points,
      routes,
      kinds: ['view', 'path', 'park', 'landmark', 'rest', 'transport'],
      filters: [
        { id: 'stepFree', label: '仅无台阶' },
        { id: 'wheelchair', label: '轮椅可通行（含部分）' },
        { id: 'quiet', label: '安静可休息' },
        { id: 'seating', label: '有座椅' },
        { id: 'toilet', label: '有无障碍卫生间' }
      ]
    });
  }

  // GET /api/points?…
  if (method === 'GET' && url.pathname === '/api/points') {
    const version = url.searchParams.get('version') ? Number(url.searchParams.get('version')) : undefined;
    const points = applyFilters(db.listPoints(), Object.fromEntries(url.searchParams));
    return sendJSON(res, 200, {
      count: points.length,
      contentSequence: db.data.meta.contentSequence,
      points: points.map((p) => serializePoint(p, { version }))
    });
  }

  // GET /api/points/:id[/content?version=n]
  const pointMatch = seg[1] === 'points' && seg[2];
  if (method === 'GET' && pointMatch) {
    const p = db.getPoint(seg[2]);
    if (!p) return sendJSON(res, 404, { error: 'not-found', message: '点位不存在' });
    if (seg[3] === 'content') {
      const v = url.searchParams.get('version') ? Number(url.searchParams.get('version')) : undefined;
      const content = db.pointContent(p, v);
      if (!content) return sendJSON(res, 404, { error: 'version-not-found', message: '该内容版本不存在' });
      return sendJSON(res, 200, content);
    }
    return sendJSON(res, 200, serializePoint(p));
  }

  // GET /api/routes, /api/routes/:id
  if (method === 'GET' && seg[1] === 'routes') {
    if (!seg[2]) {
      return sendJSON(res, 200, { routes: db.listRoutes().map((r) => ({ ...r, stopCount: r.stopIds.length })) });
    }
    const r = db.getRoute(seg[2]);
    if (!r) return sendJSON(res, 404, { error: 'not-found', message: '路线不存在' });
    return sendJSON(res, 200, { ...r, stops: db.expandRoute(r) });
  }

  // POST /api/points/:id/content — 投稿/发布新内容版（必需替代说明缺失则拒绝）
  if (method === 'POST' && pointMatch && seg[3] === 'content') {
    const p = db.getPoint(seg[2]);
    if (!p) return sendJSON(res, 404, { error: 'not-found', message: '点位不存在' });
    let body;
    try { body = await readBody(req); }
    catch (e) {
      const status = e.message === 'payload-too-large' ? 413 : 400;
      return sendJSON(res, status, { error: e.message });
    }
    const publish = body.action !== 'draft';
    const result = validateContentVersion(body, { publish });
    if (!result.valid) {
      const blocked = result.errors.some((e) => e.code === 'MISSING_REQUIRED_ALTERNATIVE');
      return sendJSON(res, blocked ? 422 : 400, {
        error: 'validation-failed',
        blocked: blocked || undefined,
        message: blocked ? '后端拒绝发布：内容版缺少必需的替代说明' : '内容校验未通过',
        errors: result.errors
      });
    }
    const saved = db.addContentVersion(p.id, result.clean);
    return sendJSON(res, 201, { message: publish ? '新内容版已发布' : '草稿已保存', ...saved });
  }

  // GET/PUT /api/users/:id/prefs — 偏好跨设备同步（rev 乐观锁）
  if (seg[1] === 'users' && seg[3] === 'prefs') {
    const userId = seg[2];
    if (method === 'GET') {
      const prefs = db.getPrefs(userId);
      if (!prefs) return sendJSON(res, 404, { error: 'no-prefs', message: '该用户暂无云端偏好' });
      return sendJSON(res, 200, prefs);
    }
    if (method === 'PUT') {
      let body;
      try { body = await readBody(req); }
      catch { return sendJSON(res, 400, { error: 'bad-request' }); }
      const result = validatePrefsPatch(body);
      if (!result.valid) return sendJSON(res, 400, { error: 'validation-failed', errors: result.errors });
      const baseRev = Number.isInteger(body.baseRev) ? body.baseRev : undefined;
      const out = db.putPrefs(userId, result.clean, baseRev, 'reject-stale');
      if (out.status === 'conflict') {
        return sendJSON(res, 409, {
          error: 'stale-revision',
          message: '偏好已在其他设备更新，请先合并再保存（本次旧请求未改动任何设置）',
          server: out.server
        });
      }
      return sendJSON(res, out.status === 'created' ? 201 : 200, { ...out.prefs });
    }
  }

  // GET /api/media?id=&fail=&flaky= — 懒加载图片（可模拟失败）
  if (method === 'GET' && url.pathname === '/api/media') return mediaHandler(req, res, url);

  return sendJSON(res, 404, { error: 'not-found', message: '未知 API 路径' });
}

async function staticHandler(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('forbidden');
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    // SPA 回退
    try {
      const buf = await readFile(join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await apiHandler(req, res, url);
    return await staticHandler(req, res, url);
  } catch (err) {
    sendJSON(res, 500, { error: 'server-error', message: String(err && err.message || err) });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`慢行 SlowMoves 已启动: http://localhost:${PORT}`);
  });
}

export { server };
