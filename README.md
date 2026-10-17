# novel-reader · 浮生

单机 WebView 的小说人物 RP 聊天 App：自研 RP 引擎，App 内直接开聊，无后端、用户自配 LLM Key。

- 包名 `com.ling.novelreader`，Android 原生壳 + WebView（`www/` 纯 HTML/JS/CSS，零依赖）
- 人物卡由 novel-distill 管线从原著蒸馏而来（红楼梦全本），随 App 内置

## 功能

- **单聊 / 群聊**：群聊 v2 对标 SillyTavern Natural Order——点名优先、每位成员独立发言欲（0–100 可调）、一轮最多 3 人依次发言、自然/轮流两种排序策略
- **记忆系统**：记忆事件簿（Talkie Memory Album 式）、记忆 Pin、上下文用量条、单条消息 👍/👎
- **世界书**：触发词匹配（单条上限 8 条注入）、触发可视化、ST 格式导入
- **人设**：Persona 全局/单会话覆盖、叙事视角与人称切换
- **剧情线**：角色原著剧情大纲（读者可编辑）、剧情选项卡
- **平行存档**：快照聊天 + 记忆 + 剧情线
- **写卡助手**：五步向导生成原创角色卡；角色卡 PNG 导出（Tavern chara_card_v2 兼容）
- **穿越模式（P0–P3）**：魂穿（扮演原著角色进入剧情锚点）、肉身穿越（AI 十项完整身份捏造、逐项重随、现代人直穿携带手机/打火机/纸巾、出戏值）、酒馆角色卡导入（PNG tEXt/iTXt + JSON，AI 补完卡片世界）、异世界穿越（P2：书↔卡异世界框架，林黛玉→水浒式；水浒 profile/plot 数据待蒸馏管线接入，不预置人物剧情）、组团穿越（P3：2–4 人组队，复用群聊 v2 发言欲 0–100 可调 + Natural Order）；世界状态栏 + `<ws>` 状态自动合并、OOC 提醒
- **RP 设置**：温度 / Top P / 最大 token / 上下文、ST 预设导入、正则表达式、打字机效果（默认开，可打断）、聊天壁纸（默认 + 4 套古风深色渐变）、界面字体（系统/宋体/楷体）、记忆小说风格（白话直叙/古风雅致/戏剧化）、大体积角色卡与聊天历史自动迁 IndexedDB（失败回退 localStorage）

## 试玩（不用打包）

`www/` 是纯静态页面，直接用浏览器打开即可体验全部聊天逻辑（聊天需要自备 OpenAI 兼容接口的 Key，在 App 内设置页填写，只存本地）：

```bash
cd www && python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

Node 回归测试（834 项）：

```bash
for f in tests/test_*.js; do node "$f"; done
```

## 打包 APK

`android/build.sh` 是极简原生壳打包脚本（javac + d8 + aapt2 + apksigner，不依赖 Gradle）：

```bash
cd android
# 需先准备 Android SDK（build-tools 34、platform-34）并导出 ANDROID_HOME
VCODE=31 VNAME=1.30 bash build.sh
```

签名**不再使用脚本内置的 debug keystore**（旧版本把口令 `android` 硬编码在脚本里，任何人都能伪造同名包）。
正式包需要自己准备 keystore 并用环境变量传入：

```bash
export RELEASE_KEYSTORE=/abs/path/release.jks
export RELEASE_KEY_ALIAS=novelreader
export RELEASE_STOREPASS='...'
export RELEASE_KEYPASS='...'
VCODE=31 VNAME=1.30 bash build.sh      # 缺任一变量时脚本会拒绝出包
```

打包流程会先 zipalign 再 apksigner，并写入 `VCODE/VNAME` 对应的 versionCode/versionName。

### 可调试包（只用于验收/排障）

```bash
DEBUG=1 VCODE=99 VNAME=accept bash build.sh   # 产出 novel-reader-v99-debug.apk
```

`DEBUG=1` 只做两件事：给清单加 `android:debuggable="true"`，并允许打开 WebView 远程调试。
**正式包不要带这个开关**——代码里用 `FLAG_DEBUGGABLE` 做了守卫，release 包不会开出
`webview_devtools` 套接字，第三方应用无法通过 `adb forward` 接管页面执行 JS。

拿到可调试包后可以在模拟器/真机上跑端到端验收（通过 CDP 在真实 WebView 里执行断言）：

```bash
node tools/device_acceptance.js --adb "<adb 路径>" --serial 127.0.0.1:62001
```

它覆盖：资源加载、`jq()` 逃逸、ReDoS、渲染吞吐、原生文件桥、通知、清库、转屏重建、
远程文档/iframe 拦截。没有设备时退出码为 2，不影响 CI。


成品 APK 请走 GitHub Releases 分发，不要提交进仓库。

## 安全说明

- **API Key**：只存本机 localStorage，设置页不再把 Key 回显到页面 DOM（输入框留空表示沿用已保存的 Key）；导出/分享不包含 Key。请优先使用 `https://` 接口，填 `http://` 时保存前会二次确认并提示明文传输风险。
- **导入角色卡视为不可信输入**：字段有长度上限，世界书触发键里的正则做灾难性回溯（ReDoS）静态拦截并对匹配文本截断；`<small>`/世界书等所有渲染路径走统一转义。
- **清除数据**走 `RP_STORE.wipeAll()`，同时清 localStorage / IndexedDB / App 私有目录文件，不会留下可恢复的副本。

## 数据来源

`www/data/` 内置红楼梦人物卡与剧情大纲，由 novel-distill 管线蒸馏生成（`tools/gen_char_plots.py`）。红楼梦原著已进入公有领域。

## License

MIT
