# www/js 索引（v41 app.js 拆分）

`app.js` 原 9330 行。v41 起，前段按区段**原样**迁到 `js/app_*.js`（代码未改动，只加文件头注释），
`app.js` 只保留：设置、分析任务、写卡助手、卡片编辑器、新手引导、**启动**、穿越（约 2700 行）。

## 加载规则（改动前必读）

- `index.html` 中 `js/app_01…19` 按编号**紧挨在 `app.js` 之前**加载，顺序 = 原 `app.js` 内的先后顺序；
  `js/a11y.js` 仍在 `app.js` 之后。
- 都是**经典脚本**：顶层 `function` 仍挂在 `window` 上；顶层 `const/let/class`（如 `view`、`CHAT`、`INDEX`）
  进共享的全局词法作用域——其它脚本能按裸名访问，但 **`window.X` 取不到**（见 `tests/test_globals_export.js`）。
- 拆分前同一脚本内的函数声明会整体提升；拆分后**后面文件里的函数在前面文件载入期还不存在**。
  因此分段的**载入期**代码（顶层立即执行的语句、IIFE、`setTimeout`/`then` 回调）不得调用后面分段/`app.js` 里定义的东西。
  事件回调（`addEventListener`、`onclick`）在全部脚本载入后才会触发，不受影响。
- 跨文件**不得**重复声明顶层 `const/let/class`（运行时 SyntaxError，整个脚本不执行）。
  `copyText` 在 `app_lore.js` 与 `app_foreshadow.js` 各有一份（拆分前即如此），后者生效。
- 新增分段：新建 `js/app_<名>.js`，在 index.html 中按位置插入，文件头写「浮生 · app 分段 NN：」并保持编号连续；守卫测试 `tests/test_app_split.js` 会核对顺序、编号与本索引。
- 读 app 源码做断言的测试统一经 `tests/lib_appsrc.js`（`APP_FILES` / `appSource`），不要直接读 `www/app.js`。

## 分段一览

| # | 文件 | 行数 | 内容 |
|---|---|---|---|
| 01 | `js/app_core.js` | 110 | 核心：DOM 句柄与全局状态、系统返回键、esc、极简 markdown、顶层导航 |
| 02 | `js/app_shelf.js` | 473 | 书架/产物浏览（书目、人物列表、标签页）+ 红学三项展示 |
| 03 | `js/app_rundata.js` | 258 | run 数据按需加载门卫（data.js 拆包）、DAG/事件历/世界卡懒加载、立绘卡 |
| 04 | `js/app_tts.js` | 111 | TTS 朗读 + 语音气泡 |
| 05 | `js/app_lore.js` | 446 | 世界书编辑、编辑器 token 计数器、正则替换、任务管理 |
| 06 | `js/app_chat_core.js` | 528 | RP 聊天核心（历史读写、渲染签名）、沉浸背景、聊天壁纸/全局壁纸 |
| 07 | `js/app_group.js` | 197 | 群聊 + 群聊角色关系编辑器 |
| 08 | `js/app_picker.js` | 342 | 发现页/选人页 helpers、卡集、聊天外壳（退出/抽屉开合/滚动跟随/顶栏隐藏/导出） |
| 09 | `js/app_foreshadow.js` | 436 | 伏笔面板 + 剧情导出 |
| 10 | `js/app_msgmenu.js` | 217 | 消息编辑 + 长按消息菜单 + 切换会话/开聊入口 |
| 11 | `js/app_prefs.js` | 515 | 成就、字号缩放、PIN 应用锁、聊天记录搜索、打字机效果 |
| 12 | `js/app_chat_hud.js` | 237 | 上下文用量条、世界模拟 HUD/编辑器、消息评分、剧情选项卡 |
| 13 | `js/app_plotline.js` | 518 | 剧情线（发送/重生成/改写、剧情大纲） |
| 14 | `js/app_chapter.js` | 219 | 章节进度、情景预设、叙事视角/人称 |
| 15 | `js/app_memory.js` | 506 | 记忆事件簿、记忆日记、事实增改删、记忆转小说 |
| 16 | `js/app_saves.js` | 464 | 平行存档/故事树、Rewind 回溯、Persona、角色卡 PNG 导出 |
| 17 | `js/app_character.js` | 624 | 角色详情页（落地页、卡片档案、人物弧光） |
| 18 | `js/app_chat_settings.js` | 516 | 浮生小助手、统一聊天设置面板、Prompt 诊断、角色召回通知、heartbeat |
| 19 | `js/app_ui.js` | — | v42 新增（非迁移）：聊天「人」的呈现（立绘背景、头像名牌、旁白/对白分排）及后续 v42 界面辅助 |
| — | `app.js` | 2706 | 设置（存储用量、API/模型、外观、数据管理）、分析任务、写卡助手、卡片编辑器、新手引导、启动、穿越 P0–P3 |
| — | `js/a11y.js` | 115 | 通用无障碍补丁（在 app.js 之后加载） |
