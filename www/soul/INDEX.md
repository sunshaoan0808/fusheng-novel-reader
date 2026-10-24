# Soul 模块索引 / Soul module index

`www/rp/soul*.js` 文件名沿用历史编号（soul_h … soul_zz、soul_aa … soul_ak 是按「50 条特性」一批批加的扩展目录），
**不改名**（改名会破坏 git 历史与外部引用）。本表把每个文件映射到它的职责、导出的全局、加载状态和 localStorage 键前缀。

- 「全局」都是 `<script>` 顶层 `var`，浏览器里即 `window.X`；新增的 `RP_SOUL_KV` 额外显式挂到 `globalThis`。
- 「KV 前缀」一列的模块通过共用的 `rp/soul_kv.js`（`RP_SOUL_KV.bucket(prefix)`）读写 `localStorage`，
  v41 前它们各自复制了一份相同的 `k/g/s` 三件套；键名与读写语义未变（已做新旧实现逐调用差分比对）。
- 加载顺序：核心（soul / soul_runtime / soul_orch / soul_config …）→ `soul_kv.js` → soul_h … soul_x。
  未加载的模块如需启用，必须排在 `soul_kv.js` 之后。

| 文件 | 全局 | 职责（取自文件头注释） | 加载状态 | KV 前缀 |
|---|---|---|---|---|
| `soul.js` | `RP_SOUL` | Soul 数据层 - WorldLines 式角色灵魂包 (纯前端实现) | 已加载 |  |
| `soul_aa.js` | `RP_SOUL_AA` | AA. 生物生态 50条 (1051-1100) | **未加载**（无 script 标签，死代码保留） | `nd_soulaa_*` |
| `soul_ab.js` | `RP_SOUL_AB` | AB. 气象天文 50条 (1101-1150) | **未加载**（无 script 标签，死代码保留） | `nd_soulab_*` |
| `soul_ac.js` | `RP_SOUL_AC` | AC. 建筑场所 50条 (1151-1200) | **未加载**（无 script 标签，死代码保留） | `nd_soulac_*` |
| `soul_ad.js` | `RP_SOUL_AD` | AD. 交通旅行 50条 (1201-1250) | **未加载**（无 script 标签，死代码保留） | `nd_soulad_*` |
| `soul_ae.js` | `RP_SOUL_AE` | AE. 通讯信息 50条 (1251-1300) | **未加载**（无 script 标签，死代码保留） | `nd_soulae_*` |
| `soul_af.js` | `RP_SOUL_AF` | AF. 教育知识 50条 (1301-1350) | **未加载**（无 script 标签，死代码保留） | `nd_soulaf_*` |
| `soul_ag.js` | `RP_SOUL_AG` | 医疗健康 50条 (1351-1400) | **未加载**（无 script 标签，死代码保留） | `nd_soulag_*` |
| `soul_ah.js` | `RP_SOUL_AH` | 法律秩序 50条 (1401-1450) | **未加载**（无 script 标签，死代码保留） | `nd_soulah_*` |
| `soul_ai.js` | `RP_SOUL_AI` | 艺术娱乐 50条 (1451-1500) | **未加载**（无 script 标签，死代码保留） | `nd_soulai_*` |
| `soul_aj.js` | `RP_SOUL_AJ` | 饮食生活 50条 (1501-1550) | **未加载**（无 script 标签，死代码保留） | `nd_soulaj_*` |
| `soul_ak.js` | `RP_SOUL_AK` | 服饰装扮 50条 (1551-1600) | **未加载**（无 script 标签，死代码保留） | `nd_soulak_*` |
| `soul_config.js` | `RP_SOUL_CFG` | Soul 配置 UI - Profile 管理 + 角色绑定 + 优先级解析 | 已加载 |  |
| `soul_data.js` | `RP_SOUL_DATA` | Soul 数据层扩展 (100条挖掘 A组 1-15) | 已加载 |  |
| `soul_debug.js` | `RP_SOUL_DEBUG` | Soul 调试/运维扩展 (100条挖掘 E组 66-75) | 已加载 |  |
| `soul_detone.js` | `RP_DETONE` | Soul 去AI味模块 (2026-10-14) | 已加载 |  |
| `soul_gen.js` | `RP_SOUL_GEN` | Soul 生成器 - 用 LLM 从角色卡生成完整 soul 包 | 已加载 |  |
| `soul_group.js` | `RP_SOUL_GROUP` | Soul 群聊编排扩展 (100条挖掘 B组 16-35) | 已加载 |  |
| `soul_h.js` | `RP_SOUL_H` | H. Soul 人格深度 50条 (101-150) | 已加载 |  |
| `soul_i.js` | `RP_SOUL_I` | I. 群聊高级玩法 50条 (151-200) | 已加载 | `nd_souli_*` |
| `soul_j.js` | `RP_SOUL_J` | J. 记忆高级 50条 (201-250) | 已加载 |  |
| `soul_k.js` | `RP_SOUL_K` | K. 世界模拟 50条 (251-300) | 已加载 | `nd_soulk_*` |
| `soul_kv.js` | `RP_SOUL_KV` | v41 Soul 扩展模块共用的 localStorage 读写 / shared JSON-bucket storage for soul_h…soul_zz | 已加载 |  |
| `soul_l.js` | `RP_SOUL_L` | L. 叙事引擎 50条 (301-350) | 已加载 | `nd_soull_*` |
| `soul_m.js` | `RP_SOUL_M` | M. 关系网 50条 (351-400) | 已加载 | `nd_soulm_*` |
| `soul_mem.js` | `RP_SOUL_MEM` | Soul 记忆系统扩展 (100条挖掘 C组 36-50) | 已加载 |  |
| `soul_model.js` | `RP_SOUL_MODEL` | Soul 模型/成本扩展 (100条挖掘 D组 51-65) | 已加载 |  |
| `soul_n.js` | `RP_SOUL_N` | N. 性能优化 50条 (401-450) | 已加载 |  |
| `soul_o.js` | `RP_SOUL_O` | O. 安全隐私 50条 (451-500) | 已加载 |  |
| `soul_orch.js` | `RP_SOUL_ORCH` | Soul 编排层 - Selector + Orchestrator-Workers + 整合者 | 已加载 |  |
| `soul_p.js` | `RP_SOUL_P` | P. 无障碍/国际化 50条 (501-550) | 已加载 |  |
| `soul_q.js` | `RP_SOUL_Q` | Q. AI前沿实验 50条 (551-600) | 已加载 |  |
| `soul_r.js` | `RP_SOUL_R` | R. 时间系统 50条 (601-650) | 已加载 | `nd_soulr_*` |
| `soul_runtime.js` | `RP_SOUL_RT` | Soul 运行时策略 - 并发/超时/降级/预算统一入口 | 已加载 |  |
| `soul_s.js` | `RP_SOUL_S` | S. 空间导航 50条 (651-700) | 已加载 | `nd_souls_*` |
| `soul_sync.js` | `RP_SOUL_SYNC` | Soul 数据集成扩展 (100条挖掘 G组 91-100) | 已加载 |  |
| `soul_t.js` | `RP_SOUL_T` | T. 经济系统 50条 (701-750) | 已加载 | `nd_soult_*` |
| `soul_u.js` | `RP_SOUL_U` | U. 战斗系统 50条 (751-800) | 已加载 | `nd_soulu_*` |
| `soul_ux.js` | `RP_SOUL_UX` | Soul UX 扩展 (100条挖掘 F组 76-90) | 已加载 |  |
| `soul_v.js` | `RP_SOUL_V` | V. 任务剧情 50条 (801-850) | 已加载 | `nd_soulv_*` |
| `soul_w.js` | `RP_SOUL_W` | W. 社交礼仪 50条 (851-900) | 已加载 | `nd_soulw_*` |
| `soul_warm.css` | `—` | 浮生暖系主题 (2026-10-15): 参考「故事馆」类 RP 应用的暖奶油设计语言 | CSS（`<link>`） |  |
| `soul_warm.js` | `RP_SOUL_WARM` | 浮生暖系 UI (2026-10-15): 参考「故事馆」暖奶油设计语言 | 已加载 |  |
| `soul_x.js` | `RP_SOUL_X` | X. 文化习俗 50条 (901-950) | 已加载 | `nd_soulx_*` |
| `soul_y.js` | `RP_SOUL_Y` | Y. 魔法超自然 50条 (951-1000) | **未加载**（无 script 标签，死代码保留） | `nd_souly_*` |
| `soul_zz.js` | `RP_SOUL_Z` | Z. 科技物品 50条 (1001-1050) | **未加载**（无 script 标签，死代码保留） | `nd_soulz_*` |
