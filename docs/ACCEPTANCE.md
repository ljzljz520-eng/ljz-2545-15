# 慢行 SlowMoves 无障碍交互验收手册

本文档把需求逐条映射到实现与可复现的验收步骤。启动：`npm start`（默认 http://localhost:3000），测试：`npm test`。

## 一、架构与"同版"保证

| 关注点 | 实现 |
| --- | --- |
| 网页：地图操作 ↔ 结构化路线列表 | `public/js/map-view.js`（SVG 地图，键盘可操作）与 `public/js/route-list.js`（虚拟滚动 listbox）共享同一个 store（`store.js`）中的 `selectedId` / `focusId` / `filters` / `filtered`。 |
| API：同版点位文字 + 替代说明 | `GET /api/points/:id`、`/api/state`、`/api/routes/:id` 的每个点位都通过 `db.pointContent()` 输出同一个 `contentVersion` 下的 `name / summary / textAlternative / easyRead / imageAlt`。历史版本可 `?version=n` 读取。 |
| 数据库：无障碍元数据 + 用户偏好 | `server/lib/db.js`（文件 JSON，接口可换 Postgres）。每点含 `accessibility`（台阶、轮椅、盲道、座椅、卫生间、照明、人流、安静区、现场备注）与按版本存储的替代文字；`users.*` 存跨设备偏好与 `rev`。 |
| 地图 vs 列表"双状态" | 只有一份共享查询状态：`filters → filtered → selectedId/focusId`。地图标记与列表行是同一状态的两种投影；选中项被筛除时统一清空（`reconcileSelection`），不会两侧各选各的。 |

## 二、大字模式只是表现层

- 所有尺寸使用 `rem`；切换字号只改 `:root { font-size }`（100%–200%），不改 DOM 顺序、不移动焦点。
- 高对比度、减少动态是独立开关（`.high-contrast` / `.reduce-motion`）。
- 实现：`public/js/prefs.js#applyPresentation`、`public/css/styles.css`。

## 三、键盘焦点、动态播报、地图选择协调

- 列表为 `role="listbox"` + `role="option"` + roving tabindex：↑↓/Home/End/PageUp/PageDown 移动，Enter/Space 打开详情。
- 地图为可聚焦 SVG：方向键在可见标记间循环、Home/End 跳转、Enter 打开详情；标记有 `aria-label`（名称+摘要+选中/被筛除状态）。
- 双 live region：`#a11y-live`（polite）播报筛选结果、图片加载、同步结果；`#a11y-alert`（assertive）播报定位拒绝、发布被拒、图片失败。
- 地图方向键移动会同步列表焦点行并滚动到可见，但键盘焦点留在地图；反之亦然。

## 四、筛选后焦点恢复（不跳回开头）

规则在 `resolveFocusTarget()`（有单元测试）：
1. 原焦点项仍在结果 → 保留（kept）；
2. 原项消失 → 同位置的下一项（same-position）；
3. 原位置之后全部消失 → 最接近的最后一项（nearest-after）；
4. 结果为空 → 焦点交给"清空筛选"按钮（empty），并播报数量与去向。

任何路径都不会把焦点重置到 `<body>` 或页面开头。播报文案由 `describeFilterChange` / `describeCount` 生成。

## 五、偏好跨设备同步：保留会话操作，旧请求不改字号/焦点

- `PUT /api/users/:id/prefs` 带 `baseRev`；服务端 rev 不匹配返回 **409** 且**不写入**（测试验证：旧请求后字号仍是原值）。
- 客户端 `latestRequest()` 为每个请求打递增序号，晚到的旧响应 `isStale === true` 直接丢弃，字号/焦点不变。
- 冲突合并 `reconcilePrefs()`：会话内手动改动过的字段（`touched` 集合，如字号）绝不被云端值覆盖；未触碰字段才采用云端，随后用新 rev 回存本地修改，并播报哪些字段来自其他设备。

## 六、验收场景（需求点名的 5 + 3 项）

### 1. 懒加载失败
- 打开 `/?mediafail=1`：图片进入视口请求 `/api/media?fail=1` → 503，图片位显示错误状态文字（role=status + assertive 播报），出现可 Tab 到达的"重新加载图片"按钮；下方文字说明仍然完整可读。
- 服务端另支持 `?flaky=1` 制造波动失败。

### 2. 弹层嵌套
- 列表/地图/路线站点 Enter 打开"详情"（一级）→ 详情内"加入对比"或"更新文字与图片说明"打开二级弹层。
- Tab 焦点被陷阱限制在顶层弹层；Esc 逐层关闭：二级关 → 焦点回详情内触发按钮；详情关 → 焦点回原列表行 / 地图标记 / 路线站点按钮（由 `DialogStack` 记录 `returnTo`）。

### 3. 无定位授权
- 点击"使用我的位置"后拒绝授权（或打开 `/?geo=denied`）：出现非阻断状态卡（标题+说明+替代操作按钮"改用无台阶筛选"），assertive 播报；列表、地图、筛选全部照常可用。定位成功则提供按距离排序的文字列表。

### 4. 图片说明更新
- 详情 → 投稿 → 修改"图片说明 alt"→ 发布：后端产生新内容版本，前端 `refreshAlt()` 同步更新 `<img alt>`、图注中的版本号与说明，并播报"图片说明已更新为内容版本 vN"；地图/列表名称与摘要也同步到新版本。

### 5. 虚拟列表滚出
- 焦点行或选中行被滚动到视口外时，`computeVirtualRange()` 把对应索引 pin 进渲染窗口（单元测试覆盖），DOM 中的焦点元素不被回收；程序定位时 `ensureIndexVisible()` 做最小滚动。

### 纯键盘：投稿
- 详情（Enter）→ Tab 到"更新文字与图片说明（投稿）"（Enter）→ 各字段用 Tab 填写、Enter 提交。错误以内联 `role="alert"` + `aria-describedby` 关联，焦点自动移到第一个错误字段，全程无需鼠标。

### 纯键盘：对比
- 详情 → "加入对比"（Enter）→ Tab 到两个下拉选择 → 结果表格随选择更新并播报结论；Esc 返回详情。

### 返回原列表
- 关闭详情（Esc 或关闭按钮）后焦点回到触发它的列表行/地图标记/路线按钮，而不是页面顶部。

## 七、后端拒绝缺少必需替代说明的发布

- `POST /api/points/:id/content`，必需字段：`name`、`summary`、`textAlternative`（≥20 字）、`imageAlt`（≥5 字）；`easyRead` 可选。
- 缺失任一必需替代说明 → **HTTP 422**，`blocked: true`，错误带 `code: "MISSING_REQUIRED_ALTERNATIVE"`，整个内容版不会落库（测试覆盖）。
- 草稿（`action:"draft"`）同样要求必需字段合规；校验规则见 `server/lib/validation.js`。

## 八、自动化测试清单（`npm test`，28 项）

- 逻辑（`tests/logic.test.js`）：筛选、四种焦点恢复、播报文案、虚拟窗口 pin、最小滚动、偏好 touched 合并、旧请求识别、选中项一致性、定位错误文案、距离、键盘移动。
- API（`tests/api.test.js`）：同版内容、筛选、历史版本、422 拒绝、发布后地图/列表/媒体同新版、草稿、偏好 409 与 rev 递增、非法字号拒绝、媒体 503、SVG alt 同版、静态首页可达性。

## 九、给真实读屏/键盘验收的建议路径

1. 仅用键盘从"跳到主要内容"开始：Tab 到字号 → 选"大字"；
2. Tab 到"仅无台阶"复选框按空格：听筛选播报，焦点应在列表同位置下一项；
3. 方向键浏览列表，Enter 打开详情 → Tab 到"加入对比" → Esc 两次，确认焦点回到原行；
4. 打开 `/?geo=denied` 验证定位；打开 `/?mediafail=1` 验证图片失败与重试；
5. 投稿时清空图片说明后发布，应被后端拒绝并把焦点带到错误字段。
