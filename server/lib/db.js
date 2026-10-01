// 文件数据库：管理无障碍元数据、点位内容版本、路线与跨设备用户偏好。
// 生产可替换为 Postgres + 版本表；接口保持不变。
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSeed } from './seed.js';

export class JsonDB {
  constructor(file) {
    this.file = file;
    this.data = null;
  }

  load() {
    if (!existsSync(this.file)) {
      mkdirSync(dirname(this.file), { recursive: true });
      this.data = createSeed();
      this.#persist();
      return;
    }
    this.data = JSON.parse(readFileSync(this.file, 'utf8'));
  }

  #persist() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }

  save() {
    this.#persist();
  }

  // ---- 点位 / 内容版本 ----
  listPoints() {
    return this.data.points;
  }
  getPoint(id) {
    return this.data.points.find((p) => p.id === id) || null;
  }

  // 读取某点位当前版本（或指定版本）的"同版点位文字 + 替代说明"。
  // 地图、结构化列表、API 必须共用本函数，保证三份文字永远同版。
  pointContent(point, version) {
    const v = version ?? point.currentVersion;
    const c = point.contentVersions[String(v)];
    if (!c) return null;
    return {
      pointId: point.id,
      contentVersion: v,
      currentVersion: point.currentVersion,
      name: c.name,
      summary: c.summary,
      textAlternative: c.textAlternative,
      easyRead: c.easyRead,
      imageAlt: c.imageAlt,
      updatedAt: c.updatedAt
    };
  }

  addContentVersion(pointId, payload) {
    const point = this.getPoint(pointId);
    if (!point) return { error: 404, message: `点位 ${pointId} 不存在` };
    const next = point.currentVersion + 1;
    point.contentVersions[String(next)] = {
      version: next,
      name: payload.name,
      summary: payload.summary,
      textAlternative: payload.textAlternative,
      easyRead: payload.easyRead || '',
      imageAlt: payload.imageAlt,
      updatedAt: new Date().toISOString()
    };
    point.currentVersion = next;
    point.image.alt = payload.imageAlt;
    this.data.meta.contentSequence += 1;
    this.save();
    return { version: next, content: this.pointContent(point) };
  }

  // ---- 路线 ----
  listRoutes() {
    return this.data.routes;
  }
  getRoute(id) {
    return this.data.routes.find((r) => r.id === id) || null;
  }

  // 把路线展开为结构化站点列表（每一站都带同版文字与无障碍元数据）。
  expandRoute(route) {
    return route.stopIds.map((pid, i) => {
      const p = this.getPoint(pid);
      if (!p) return null;
      return {
        order: i + 1,
        pointId: p.id,
        lat: p.lat,
        lng: p.lng,
        kind: p.kind,
        accessibility: p.accessibility,
        content: this.pointContent(p)
      };
    }).filter(Boolean);
  }

  // ---- 用户偏好（跨设备同步，带 rev 乐观锁） ----
  getPrefs(userId) {
    return this.data.users[userId] || null;
  }

  // merge 语义：服务端保留 updatedAt 更新者 + rev 递增；客户端带 rev 做冲突检测。
  // stale 请求（baseRev < 服务端 rev）默认不覆盖，由调用方决定 409。
  putPrefs(userId, patch, baseRev, strategy = 'reject-stale') {
    const now = new Date().toISOString();
    const existing = this.data.users[userId];
    if (!existing) {
      const rev = 1;
      this.data.users[userId] = { userId, ...patch, updatedAt: now, rev };
      this.save();
      return { status: 'created', prefs: this.data.users[userId] };
    }
    if (typeof baseRev === 'number' && baseRev !== existing.rev) {
      if (strategy === 'reject-stale') {
        return { status: 'conflict', http: 409, server: existing };
      }
      // merge：只采用客户端显式提供、且服务端未更新的字段由路由层处理；
      // 这里采用 last-write-wins-by-field（field 级时间戳简化为整体 rev 判断）。
    }
    const merged = { ...existing, ...patch, userId, updatedAt: now, rev: existing.rev + 1 };
    this.data.users[userId] = merged;
    this.save();
    return { status: 'updated', prefs: merged };
  }
}

let singleton = null;
export function getDB(file) {
  if (!singleton) {
    singleton = new JsonDB(file || process.env.DB_FILE || 'data/db.json');
    singleton.load();
  }
  return singleton;
}
