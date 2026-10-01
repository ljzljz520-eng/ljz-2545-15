-- 慢行产品数据库结构：无障碍元数据、内容版本、用户偏好
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 慢行路线
CREATE TABLE IF NOT EXISTS route (
  id          TEXT PRIMARY KEY,
  city        TEXT NOT NULL,
  category    TEXT NOT NULL,           -- walk / cycle / waterfront / heritage
  length_km   REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 路线点位
CREATE TABLE IF NOT EXISTS poi (
  id          TEXT PRIMARY KEY,
  route_id    TEXT NOT NULL REFERENCES route(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,        -- 点位顺序
  kind        TEXT NOT NULL DEFAULT 'spot',  -- spot / rest / transit / toilet
  lng         REAL, lat REAL
);
CREATE INDEX IF NOT EXISTS idx_poi_route ON poi(route_id, seq);

-- 内容版本：点位文字与替代说明必须同版发布
CREATE TABLE IF NOT EXISTS content_version (
  id            TEXT PRIMARY KEY,
  route_id      TEXT NOT NULL REFERENCES route(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'   -- draft / published / archived
                CHECK (status IN ('draft','published','archived')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  published_at  TEXT,
  UNIQUE(route_id, version)
);

-- 点位文字（归属某内容版本）
CREATE TABLE IF NOT EXISTS poi_text (
  version_id  TEXT NOT NULL REFERENCES content_version(id) ON DELETE CASCADE,
  poi_id      TEXT NOT NULL REFERENCES poi(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (version_id, poi_id)
);

-- 媒体与替代说明（归属某内容版本）；alt_text 为发布必填
CREATE TABLE IF NOT EXISTS media (
  id           TEXT PRIMARY KEY,
  version_id   TEXT NOT NULL REFERENCES content_version(id) ON DELETE CASCADE,
  poi_id       TEXT NOT NULL REFERENCES poi(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  alt_text     TEXT NOT NULL DEFAULT '',   -- 替代说明：发布时不得为空
  alt_required INTEGER NOT NULL DEFAULT 1  -- 是否为必需替代说明
);
CREATE INDEX IF NOT EXISTS idx_media_version ON media(version_id);

-- 无障碍元数据（按点位）
CREATE TABLE IF NOT EXISTS a11y_metadata (
  poi_id           TEXT PRIMARY KEY REFERENCES poi(id) ON DELETE CASCADE,
  wheelchair       INTEGER NOT NULL DEFAULT 0,  -- 轮椅可通行
  tactile_paving   INTEGER NOT NULL DEFAULT 0,  -- 盲道
  ramp             INTEGER NOT NULL DEFAULT 0,  -- 坡道
  accessible_wc    INTEGER NOT NULL DEFAULT 0,  -- 无障碍卫生间
  audio_guide      INTEGER NOT NULL DEFAULT 0,  -- 语音导览
  slope_grade      TEXT NOT NULL DEFAULT 'unknown', -- gentle/moderate/steep/unknown
  notes            TEXT NOT NULL DEFAULT ''
);

-- 用户偏好（跨设备同步，版本号防旧请求覆盖）
CREATE TABLE IF NOT EXISTS user_preference (
  user_id     TEXT NOT NULL,
  key         TEXT NOT NULL,              -- fontSize / contrast / reduceMotion ...
  value       TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1, -- 单调递增
  device_id   TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);

-- 投稿（用户贡献内容，发布前同样校验替代说明）
CREATE TABLE IF NOT EXISTS submission (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  route_id    TEXT NOT NULL REFERENCES route(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  media_alt   TEXT NOT NULL DEFAULT '',   -- 投稿图片的替代说明（必需）
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
