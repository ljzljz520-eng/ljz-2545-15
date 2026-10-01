'use strict';
/** 种子数据：3 条慢行路线 + 点位 + 无障碍元数据 + 已发布内容版本 */
const { openDb } = require('./db');

function seed(db) {
  const routes = [
    { id: 'riverside-walk', city: '杭州', category: 'waterfront', length_km: 4.2 },
    { id: 'old-town-heritage', city: '苏州', category: 'heritage', length_km: 2.8 },
    { id: 'lake-cycle', city: '杭州', category: 'cycle', length_km: 12.5 }
  ];
  const insRoute = db.prepare('INSERT OR REPLACE INTO route (id, city, category, length_km) VALUES (?,?,?,?)');
  const insPoi = db.prepare('INSERT OR REPLACE INTO poi (id, route_id, seq, kind, lng, lat) VALUES (?,?,?,?,?,?)');
  const insA11y = db.prepare(`INSERT OR REPLACE INTO a11y_metadata
    (poi_id, wheelchair, tactile_paving, ramp, accessible_wc, audio_guide, slope_grade, notes)
    VALUES (?,?,?,?,?,?,?,?)`);
  const insVer = db.prepare(`INSERT OR REPLACE INTO content_version (id, route_id, version, status, published_at)
    VALUES (?,?,?,'published',datetime('now'))`);
  const insText = db.prepare('INSERT OR REPLACE INTO poi_text (version_id, poi_id, name, description) VALUES (?,?,?,?)');
  const insMedia = db.prepare('INSERT OR REPLACE INTO media (id, version_id, poi_id, url, alt_text, alt_required) VALUES (?,?,?,?,?,1)');

  const pois = {
    'riverside-walk': [
      { id: 'rw-1', seq: 1, kind: 'spot', name: '江湾观景台', desc: '开阔江景，设有休息长椅。', a11y: [1,1,1,0,1,'gentle','全程平坦'] },
      { id: 'rw-2', seq: 2, kind: 'rest', name: '柳荫休憩区', desc: '树荫覆盖的休息区，有直饮水。', a11y: [1,1,1,1,0,'gentle',''] },
      { id: 'rw-3', seq: 3, kind: 'toilet', name: '滨江服务站', desc: '含无障碍卫生间与母婴室。', a11y: [1,1,1,1,0,'gentle',''] },
      { id: 'rw-4', seq: 4, kind: 'spot', name: '潮声广场', desc: '傍晚可听潮，地面为防滑砖。', a11y: [1,0,1,0,1,'gentle','盲道在广场东侧中断 20 米'] }
    ],
    'old-town-heritage': [
      { id: 'oh-1', seq: 1, kind: 'spot', name: '古城门', desc: '明代城门遗址，有语音导览。', a11y: [1,1,1,0,1,'gentle',''] },
      { id: 'oh-2', seq: 2, kind: 'spot', name: '石板巷', desc: '历史石板路，略有起伏。', a11y: [0,0,0,0,1,'moderate','石板缝隙较大，轮椅通行困难'] },
      { id: 'oh-3', seq: 3, kind: 'rest', name: '评弹茶馆', desc: '可欣赏评弹表演的老茶馆。', a11y: [1,0,1,0,0,'gentle','入口有一处 5cm 门槛，已配便携坡板'] }
    ],
    'lake-cycle': [
      { id: 'lc-1', seq: 1, kind: 'spot', name: '湖畔租车点', desc: '提供双人车与儿童座椅。', a11y: [1,0,1,1,0,'gentle',''] },
      { id: 'lc-2', seq: 2, kind: 'spot', name: '断桥观景台', desc: '湖面视野开阔。', a11y: [1,1,1,0,1,'moderate','观景台坡道坡度 1:12'] },
      { id: 'lc-3', seq: 3, kind: 'rest', name: '荷风茶亭', desc: '夏季荷花观赏点。', a11y: [1,0,1,0,0,'gentle',''] },
      { id: 'lc-4', seq: 4, kind: 'spot', name: '南山坡道', desc: '全程最陡路段，建议推行。', a11y: [0,0,0,0,0,'steep','坡度约 8%，不建议轮椅独行'] },
      { id: 'lc-5', seq: 5, kind: 'toilet', name: '环湖驿站', desc: '补给点与无障碍卫生间。', a11y: [1,1,1,1,0,'gentle',''] }
    ]
  };

  const tx = db.transaction(() => {
    for (const r of routes) insRoute.run(r.id, r.city, r.category, r.length_km);
    for (const [rid, list] of Object.entries(pois)) {
      const vid = `v1-${rid}`;
      insVer.run(vid, rid, 1);
      for (const p of list) {
        insPoi.run(p.id, rid, p.seq, p.kind, 120.1 + p.seq * 0.01, 30.2 + p.seq * 0.008);
        insA11y.run(p.id, ...p.a11y);
        insText.run(vid, p.id, p.name, p.desc);
        insMedia.run(`m-${p.id}`, vid, p.id, `/img/${p.id}.jpg`, `${p.name}实景照片`, );
      }
    }
  });
  tx();
  return db;
}

if (require.main === module) {
  const file = process.env.SLOW_DB || require('path').join(__dirname, '..', 'slow.db');
  seed(openDb(file));
  console.log(`种子数据已写入: ${file}`);
}
module.exports = { seed };
