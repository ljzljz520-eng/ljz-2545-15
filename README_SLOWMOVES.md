# 慢行 SlowMoves — 无障碍慢行路线（全栈演示）

为慢行产品完善可访问交互的参考实现：**地图操作与结构化路线列表双状态同步、同版点位文字与替代说明 API、无障碍元数据与跨设备偏好管理、可预测的焦点恢复、旧请求保护、纯键盘可完成的投稿与对比、后端强制校验替代说明**。

- 零依赖：Node.js 内置 `http` / `node:test`，无需联网安装。
- 前端：原生 ES Module + 可单测的纯逻辑层（`public/js/a11y-logic.js`）。
- 数据：JSON 文件数据库（`server/lib/db.js`），接口按关系库设计，可平滑替换为 Postgres。

## 启动

```bash
npm start            # http://localhost:3000
PORT=3100 npm start  # 自定义端口
npm test             # 28 项单元 + API 验收测试
```

首次启动自动生成 12 个西湖周边示例点位（含完整无障碍元数据与 v1 文字）和 2 条路线。

## 目录

```
server/
  index.js            HTTP 服务 + REST API + 静态托管
  lib/db.js           文件数据库（点位/内容版本/路线/用户偏好，rev 乐观锁）
  lib/validation.js   内容版发布校验（必需替代说明缺失 → 422）
  lib/seed.js         示例数据
public/
  index.html
  css/styles.css      rem 缩放 / 焦点环 / 高对比度 / 减少动态 / 弹层 / 虚拟列表
  js/
    a11y-logic.js     纯逻辑：筛选、焦点恢复、虚拟窗口、偏好合并、旧请求、同选
    store.js          共享查询状态 + 带序号的 fetch（旧响应不落地）
    announcer.js      polite/assertive 双 live region
    dialog.js         弹层栈：嵌套、焦点陷阱、Esc 逐层关闭、焦点返回
    route-list.js     虚拟滚动结构化路线列表（roving tabindex）
    map-view.js       键盘可操作 SVG 地图，与列表共享 selectedId
    filters.js geo.js prefs.js lazy-images.js content-dialogs.js app.js
tests/                node:test 验收测试
docs/ACCEPTANCE.md    逐条需求验收手册
```

## 核心 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/state` | 地图与列表共用的初始数据（点位均带当前内容版本） |
| GET | `/api/points?keyword=&stepFree=&wheelchair=&quiet=&seating=&toilet=&kind=` | 服务端筛选 |
| GET | `/api/points/:id` / `/content?version=n` | 点位 + 同版文字与替代说明（可查历史版） |
| GET | `/api/routes` / `/api/routes/:id` | 路线及有序站点（每站同版 content） |
| POST | `/api/points/:id/content` | 发布/存草稿内容版；缺必需替代说明返回 422 |
| GET/PUT | `/api/users/:id/prefs` | 跨设备偏好；PUT 带 `baseRev`，旧 rev 返回 409 |
| GET | `/api/media?id=&fail=1&flaky=1` | 懒加载图片（SVG，aria-label 与当前 alt 同版；可模拟失败） |

## 验收快捷参数

- `/?geo=denied` — 模拟拒绝定位授权
- `/?mediafail=1` — 所有懒加载图片失败（验证错误状态与重试）

详见 [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)。

## 设计要点速览

1. **大字只是表现层**：全站 rem，字号只改 `:root`，结构/焦点不变。
2. **筛选焦点**：原项消失 → 同位置下一项；其后全消失 → 最后匹配项；空结果 → "清空筛选"按钮；绝不回页面开头。
3. **同步不打断**：会话内 touched 字段不被云端覆盖；带序号请求丢弃晚到旧响应，旧 rev 由 409 拦截。
4. **同一选中项**：地图/列表从同一 `selectedId` 投影；选中项被筛除则清空而非错位。
5. **虚拟列表**：焦点行/选中行始终 pin 在渲染窗口，滚出也不丢焦点。
6. **后端守门**：缺少 name/一句话说明/文字替代说明/图片 alt 的内容版一律拒绝发布。
