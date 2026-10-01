'use strict';
/**
 * 慢行产品 API 服务：
 *  - 同版点位文字 + 替代说明
 *  - 无障碍元数据查询
 *  - 用户偏好跨设备同步（版本号防旧请求覆盖）
 *  - 发布校验：缺少必需替代说明 → 422
 * 同时托管项目静态页面。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openDb, listRoutes, getRouteVersion, publishVersion, getPrefs, putPref, createSubmission } = require('./db');

const ROOT = path.resolve(__dirname, '..', '..'); // 项目根目录（静态页面）
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };

function send(res, status, body, headers = {}) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  const payload = isObj ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...headers });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function createApp(db = openDb(process.env.SLOW_DB || ':memory:')) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    try {
      /* ---------- API ---------- */
      // 路线列表（筛选与前端共享查询状态同构）
      if (req.method === 'GET' && p === '/api/routes') {
        return send(res, 200, {
          routes: listRoutes(db, {
            category: url.searchParams.get('category'),
            keyword: url.searchParams.get('keyword'),
            accessibleOnly: url.searchParams.get('accessibleOnly') === '1'
          })
        });
      }
      // 路线某版本内容：点位文字与替代说明同版返回
      let m = p.match(/^\/api\/routes\/([\w-]+)$/);
      if (req.method === 'GET' && m) {
        const v = url.searchParams.get('version');
        const out = getRouteVersion(db, m[1], v == null ? null : Number(v));
        if (!out) return send(res, 404, { error: 'ROUTE_VERSION_NOT_FOUND' });
        return send(res, 200, out);
      }
      // 点位懒加载分页（同版）
      m = p.match(/^\/api\/routes\/([\w-]+)\/points$/);
      if (req.method === 'GET' && m) {
        const full = getRouteVersion(db, m[1], url.searchParams.get('version') == null ? null : Number(url.searchParams.get('version')));
        if (!full) return send(res, 404, { error: 'ROUTE_VERSION_NOT_FOUND' });
        const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
        const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 10)));
        return send(res, 200, {
          routeId: full.routeId, version: full.version,
          total: full.points.length, offset, limit,
          points: full.points.slice(offset, offset + limit)
        });
      }
      // 无障碍元数据
      m = p.match(/^\/api\/a11y\/([\w-]+)$/);
      if (req.method === 'GET' && m) {
        const row = db.prepare('SELECT * FROM a11y_metadata WHERE poi_id=?').get(m[1]);
        if (!row) return send(res, 404, { error: 'A11Y_NOT_FOUND' });
        return send(res, 200, { poiId: row.poi_id, wheelchair: !!row.wheelchair, tactilePaving: !!row.tactile_paving,
          ramp: !!row.ramp, accessibleWc: !!row.accessible_wc, audioGuide: !!row.audio_guide,
          slopeGrade: row.slope_grade, notes: row.notes });
      }
      // 用户偏好读取
      m = p.match(/^\/api\/prefs\/([\w-]+)$/);
      if (req.method === 'GET' && m) return send(res, 200, { userId: m[1], prefs: getPrefs(db, m[1]) });
      // 用户偏好写入（带版本，防旧请求覆盖）
      m = p.match(/^\/api\/prefs\/([\w-]+)$/);
      if (req.method === 'PUT' && m) {
        const body = await readBody(req);
        if (!body.key) return send(res, 400, { error: 'KEY_REQUIRED' });
        const r = putPref(db, m[1], body.key, body.value, body.expectedVersion ?? null, body.deviceId || '');
        if (!r.ok) return send(res, r.status, r);
        return send(res, 200, r);
      }
      // 新建内容版本（草稿）
      m = p.match(/^\/api\/routes\/([\w-]+)\/versions$/);
      if (req.method === 'POST' && m) {
        const body = await readBody(req);
        const routeId = m[1];
        if (!db.prepare('SELECT 1 FROM route WHERE id=?').get(routeId)) return send(res, 404, { error: 'ROUTE_NOT_FOUND' });
        const next = (db.prepare('SELECT COALESCE(MAX(version),0) v FROM content_version WHERE route_id=?').get(routeId).v) + 1;
        const vid = crypto.randomUUID();
        const tx = db.transaction(() => {
          db.prepare('INSERT INTO content_version (id, route_id, version) VALUES (?,?,?)').run(vid, routeId, next);
          for (const pt of body.points || []) {
            db.prepare('INSERT INTO poi_text (version_id, poi_id, name, description) VALUES (?,?,?,?)')
              .run(vid, pt.id, pt.name || '', pt.description || '');
            for (const md of pt.media || []) {
              db.prepare('INSERT INTO media (id, version_id, poi_id, url, alt_text, alt_required) VALUES (?,?,?,?,?,?)')
                .run(md.id || crypto.randomUUID(), vid, pt.id, md.url || '', md.altText || '', md.altRequired === false ? 0 : 1);
            }
          }
        });
        tx();
        return send(res, 201, { versionId: vid, version: next, status: 'draft' });
      }
      // 发布版本：缺少必需替代说明 → 422 拒绝
      m = p.match(/^\/api\/versions\/([\w-]+)\/publish$/);
      if (req.method === 'POST' && m) {
        const r = publishVersion(db, m[1]);
        if (!r.ok) return send(res, r.status, r);
        return send(res, 200, r);
      }
      // 投稿：同样强制替代说明
      if (req.method === 'POST' && p === '/api/submissions') {
        const body = await readBody(req);
        const r = createSubmission(db, { id: crypto.randomUUID(), userId: body.userId || 'anon',
          routeId: body.routeId, title: body.title, description: body.description, mediaAlt: body.mediaAlt });
        if (!r.ok) return send(res, r.status, r);
        return send(res, 201, r);
      }
      if (p.startsWith('/api/')) return send(res, 404, { error: 'NOT_FOUND' });

      /* ---------- 静态文件 ---------- */
      let fp = path.normalize(path.join(ROOT, p === '/' ? 'index.html' : p));
      if (!fp.startsWith(ROOT)) return send(res, 403, 'Forbidden');
      fs.readFile(fp, (err, buf) => {
        if (err) return send(res, 404, 'Not Found');
        send(res, 200, buf, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      });
    } catch (e) {
      send(res, 500, { error: 'INTERNAL', message: e.message });
    }
  });
  server.db = db;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const server = createApp();
  server.listen(port, () => console.log(`慢行产品服务已启动: http://localhost:${port}`));
}
module.exports = { createApp, openDb };
