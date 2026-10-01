'use strict';
/**
 * 数据访问层：无障碍元数据、内容版本、用户偏好
 * 所有查询集中在这一层，路由层只做 HTTP 语义。
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function openDb(file = ':memory:') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

/* ---------- 路线与点位 ---------- */

function listRoutes(db, { category, keyword, accessibleOnly } = {}) {
  let sql = `SELECT r.id, r.city, r.category, r.length_km,
      (SELECT COUNT(*) FROM poi p WHERE p.route_id = r.id) AS poi_count,
      (SELECT COALESCE(SUM(a.wheelchair),0) FROM poi p
         JOIN a11y_metadata a ON a.poi_id = p.id WHERE p.route_id = r.id) AS wheelchair_spots
    FROM route r`;
  const where = [];
  const args = {};
  if (category && category !== 'all') { where.push('r.category = @category'); args.category = category; }
  if (keyword) { where.push('r.id IN (SELECT route_id FROM poi WHERE id LIKE @kw) OR r.id LIKE @kw OR r.city LIKE @kw'); args.kw = `%${keyword}%`; }
  if (accessibleOnly) {
    where.push(`NOT EXISTS (SELECT 1 FROM poi p LEFT JOIN a11y_metadata a ON a.poi_id = p.id
                  WHERE p.route_id = r.id AND COALESCE(a.wheelchair,0) = 0)`);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY r.id';
  return db.prepare(sql).all(args);
}

/**
 * 取路线某版本的完整内容：点位文字与替代说明必须来自同一 content_version，
 * 杜绝“文字是新版、说明是旧版”的混版。
 */
function getRouteVersion(db, routeId, version) {
  const v = version == null
    ? db.prepare(`SELECT * FROM content_version WHERE route_id=? AND status='published'
                  ORDER BY version DESC LIMIT 1`).get(routeId)
    : db.prepare('SELECT * FROM content_version WHERE route_id=? AND version=?').get(routeId, version);
  if (!v) return null;
  const points = db.prepare(`
    SELECT p.id, p.seq, p.kind, p.lng, p.lat,
           t.name, t.description,
           a.wheelchair, a.tactile_paving, a.ramp, a.accessible_wc, a.audio_guide, a.slope_grade, a.notes
    FROM poi p
    JOIN poi_text t ON t.poi_id = p.id AND t.version_id = @vid
    LEFT JOIN a11y_metadata a ON a.poi_id = p.id
    WHERE p.route_id = @rid
    ORDER BY p.seq`).all({ vid: v.id, rid: routeId });
  const media = db.prepare(`
    SELECT id, poi_id, url, alt_text, alt_required FROM media
    WHERE version_id = ? ORDER BY poi_id, id`).all(v.id);
  const mediaByPoi = {};
  for (const m of media) (mediaByPoi[m.poi_id] ||= []).push(m);
  return {
    routeId,
    version: v.version,
    status: v.status,
    points: points.map(p => ({
      id: p.id, seq: p.seq, kind: p.kind, lng: p.lng, lat: p.lat,
      name: p.name, description: p.description,
      a11y: {
        wheelchair: !!p.wheelchair, tactilePaving: !!p.tactile_paving, ramp: !!p.ramp,
        accessibleWc: !!p.accessible_wc, audioGuide: !!p.audio_guide,
        slopeGrade: p.slope_grade, notes: p.notes
      },
      media: (mediaByPoi[p.id] || []).map(m => ({
        id: m.id, url: m.url, altText: m.alt_text, altRequired: !!m.alt_required
      }))
    }))
  };
}

/* ---------- 发布校验：缺少必需替代说明 → 拒绝 ---------- */

function findMissingAltText(db, versionId) {
  return db.prepare(`
    SELECT m.id AS mediaId, m.poi_id AS poiId
    FROM media m
    WHERE m.version_id = ? AND m.alt_required = 1 AND TRIM(m.alt_text) = ''`).all(versionId);
}

function publishVersion(db, versionId) {
  const v = db.prepare('SELECT * FROM content_version WHERE id=?').get(versionId);
  if (!v) return { ok: false, status: 404, errors: [{ code: 'VERSION_NOT_FOUND' }] };
  const missing = findMissingAltText(db, versionId);
  if (missing.length) {
    return {
      ok: false, status: 422,
      errors: missing.map(m => ({
        code: 'ALT_TEXT_REQUIRED', field: `media.${m.mediaId}.altText`,
        poiId: m.poiId, message: `点位 ${m.poiId} 的媒体 ${m.mediaId} 缺少必需替代说明`
      }))
    };
  }
  db.prepare(`UPDATE content_version SET status='published', published_at=datetime('now') WHERE id=?`).run(versionId);
  return { ok: true, version: v.version };
}

/* ---------- 用户偏好：版本号防旧请求覆盖 ---------- */

function getPrefs(db, userId) {
  const rows = db.prepare('SELECT key, value, version, device_id, updated_at FROM user_preference WHERE user_id=?').all(userId);
  const prefs = {};
  for (const r of rows) prefs[r.key] = { value: r.value, version: r.version, deviceId: r.device_id, updatedAt: r.updated_at };
  return prefs;
}

/**
 * 写入偏好。expectedVersion 用于乐观并发：
 * 旧版本号的请求（过期请求）一律 409 拒绝，不能突然改变用户状态。
 */
function putPref(db, userId, key, value, expectedVersion, deviceId = '') {
  const cur = db.prepare('SELECT version FROM user_preference WHERE user_id=? AND key=?').get(userId, key);
  const curVersion = cur ? cur.version : 0;
  if (expectedVersion != null && expectedVersion !== curVersion) {
    return { ok: false, status: 409, currentVersion: curVersion,
             message: `偏好版本冲突：期望 ${expectedVersion}，当前 ${curVersion}` };
  }
  const next = curVersion + 1;
  db.prepare(`INSERT INTO user_preference (user_id, key, value, version, device_id, updated_at)
              VALUES (?,?,?,?,?,datetime('now'))
              ON CONFLICT(user_id,key) DO UPDATE SET
                value=excluded.value, version=excluded.version,
                device_id=excluded.device_id, updated_at=excluded.updated_at`)
    .run(userId, key, String(value), next, deviceId);
  return { ok: true, version: next };
}

/* ---------- 投稿 ---------- */

function createSubmission(db, { id, userId, routeId, title, description, mediaAlt }) {
  const errors = [];
  if (!title || !title.trim()) errors.push({ code: 'TITLE_REQUIRED', field: 'title', message: '标题必填' });
  if (!mediaAlt || !mediaAlt.trim()) errors.push({ code: 'ALT_TEXT_REQUIRED', field: 'mediaAlt', message: '投稿图片缺少必需替代说明' });
  if (!db.prepare('SELECT 1 FROM route WHERE id=?').get(routeId)) errors.push({ code: 'ROUTE_NOT_FOUND', field: 'routeId' });
  if (errors.length) return { ok: false, status: 422, errors };
  db.prepare(`INSERT INTO submission (id, user_id, route_id, title, description, media_alt)
              VALUES (?,?,?,?,?,?)`).run(id, userId, routeId, title.trim(), description || '', mediaAlt.trim());
  return { ok: true, id };
}

module.exports = { openDb, listRoutes, getRouteVersion, findMissingAltText, publishVersion, getPrefs, putPref, createSubmission };
