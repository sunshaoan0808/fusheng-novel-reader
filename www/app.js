/* 浮生 v3 主脚本（剩余部分：设置、分析任务、写卡助手、卡片编辑器、新手引导、启动、穿越）。
 * v41 起前段已按区段原样拆到 18 个文件（index.html 中按顺序紧挨本文件之前加载）：
 * js/app_core.js
 * js/app_shelf.js
 * js/app_rundata.js
 * js/app_tts.js
 * js/app_lore.js
 * js/app_chat_core.js
 * js/app_group.js
 * js/app_picker.js
 * js/app_foreshadow.js
 * js/app_msgmenu.js
 * js/app_prefs.js
 * js/app_chat_hud.js
 * js/app_plotline.js
 * js/app_chapter.js
 * js/app_memory.js
 * js/app_saves.js
 * js/app_character.js
 * js/app_chat_settings.js
 * 原 app.js 第 1 行起的头部（DOM 句柄、全局状态 INDEX/RUN/TAB/NAV、esc 等）在 js/app_core.js。 */
/* ================= 设置 ================= */
/* ============ P0-5 本地存储用量可视化 ============ */
const STORAGE_GROUPS = [
{label: "单聊历史", prefixes: ["nd_chat_"]},
{label: "群聊历史", prefixes: ["nd_group_"]},
{label: "穿越数据", prefixes: ["nd_trav", "nd_travchat_", "nd_travws_", "nd_identity_"]},
{label: "记忆事件簿", prefixes: ["nd_mem2_"]},
{label: "世界书", prefixes: ["nd_lore_"]},
{label: "角色卡", prefixes: ["nd_custom_chars", "nd_imported_cards", "nd_cw_"]},
{label: "人设与正则", prefixes: ["nd_persona", "nd_regex_"]},
];
window.fmtBytes = (b)=>{
if(b < 1024) return b + " B";
if(b < 1024*1024) return (b/1024).toFixed(1) + " KB";
if(b < 1024*1024*1024) return (b/1024/1024).toFixed(2) + " MB";
return (b/1024/1024/1024).toFixed(2) + " GB";
};
/* 本地存储总配额 2GB：localStorage（5MB 硬上限，浏览器规定改不了）+ IndexedDB（系统按磁盘余量算）
 * + 原生文件层（App 私有目录 files/ndblob/，2GB 自设上限，真机大文件走这里）。 */
window.ND_QUOTA_BYTES = 2*1024*1024*1024;
/* P1-7: localStorage 有 5MB 硬上限（浏览器规定），必须单独计算告警；
 * 原来用 2GB 做分母，LS 部分永远只占 0.25%，告警形同虚设。 */
window.ND_LS_QUOTA_BYTES = 5*1024*1024;
window.storageUsage = ()=>{
const groups = STORAGE_GROUPS.map(g=>({label: g.label, bytes: 0, keys: 0}));
const other = {label: "配置与其他", bytes: 0, keys: 0};
let total = 0;
for(let i = 0; i < localStorage.length; i++){
const k = localStorage.key(i);
let v = "";
try{ v = localStorage.getItem(k) || ""; }catch(e){}
const b = (k.length + v.length) * 2; // localStorage 按 UTF-16 存, 每码元 2 字节
total += b;
let gi = -1;
for(let j = 0; j < STORAGE_GROUPS.length; j++){
if(STORAGE_GROUPS[j].prefixes.some(p=>k.indexOf(p) === 0)){ gi = j; break; }
}
const t = gi >= 0 ? groups[gi] : other;
t.bytes += b; t.keys += 1;
}
/* 文件层（原生 2GB）不计入 localStorage，单独加上 */
let fileBytes = 0, fileCount = 0;
try{
if(typeof RP_STORE!=="undefined"){
if(RP_STORE.fileBytes){ const fb = RP_STORE.fileBytes(); if(typeof fb==="number" && fb > 0) fileBytes = fb; }
if(RP_STORE.fileCount){ fileCount = RP_STORE.fileCount()||0; }
}
}catch(e){}
const lsTotal = total; /* P1-7: localStorage 部分单独记，用于 5MB 告警 */
total += fileBytes;
groups.push(other);
return {total: total, lsTotal: lsTotal, quota: window.ND_QUOTA_BYTES, lsQuota: window.ND_LS_QUOTA_BYTES, fileBytes: fileBytes, fileCount: fileCount, groups: groups.filter(g=>g.keys > 0)};
};
window.renderStorageCard = ()=>{
const su = storageUsage();
const pct = Math.min(100, su.total / su.quota * 100);
/* P1-7: 告警看 localStorage 占用 / 5MB（这才是会爆的瓶颈），不再看 2GB 总量 */
const lsPct = Math.min(100, (su.lsTotal||0) / (su.lsQuota||1) * 100);
const warn = lsPct >= 80;
return `<div class="setcard"><h3>本地存储用量</h3>
<div class="storbar"><div class="storbar-fg${warn?" warn":""}" style="width:${pct.toFixed(1)}%"></div></div>
<div class="stornum${warn?" warn":""}">${fmtBytes(su.total)} / 2 GB（${pct.toFixed(0)}%）${warn?" · 空间告急，建议清理":""}</div>
<div class="storow"><span>浏览器本地存储<br><small style="color:var(--ink-faint);font-size:calc(11px * var(--fs))">上限 5MB，超限聊天无法保存</small></span><span class="${warn?"warn":""}">${fmtBytes(su.lsTotal||0)} / 5 MB（${lsPct.toFixed(0)}%）</span></div>
${su.groups.map(g=>`<div class="storow"><span>${g.label}</span><span>${g.keys} 项 · ${fmtBytes(g.bytes)}</span></div>`).join("")}
<div class="storow" id="fileline"><span>大文件存储<br><small style="color:var(--ink-faint);font-size:calc(11px * var(--fs))">App 私有目录，上限 2GB</small></span><span>${su.fileCount} 个文件 · ${fmtBytes(su.fileBytes)}</span></div>
<div class="storow" id="idbline"><span>浏览器大文件存储（估算）</span><span>统计中…</span></div>
<div class="storow" id="idbcopied"><span>已备份到大文件存储</span><span>—</span></div>
<div class="btnrow"><button class="btn ghost" onclick="if(confirm('清空所有单聊/群聊/穿越聊天记录？\n会清空记忆和关系，从头来过。'))clearChat()">清空聊天记录</button>
<button class="btn ghost" onclick="storeCleanup()">释放大文件空间</button>
<button class="btn danger" onclick="wipeAll()">清空全部数据</button></div>
</div>`;
};
/* 设置页搜索：按卡片文本过滤，顺带隐藏空分组标题 */
window.filterSettings = (q)=>{
  q = (q||"").trim();
  document.querySelectorAll("#view .setcard").forEach(c=>{
    c.style.display = (!q || c.textContent.indexOf(q)>=0) ? "" : "none";
  });
  document.querySelectorAll("#view .setsec").forEach(h=>{
    let el = h.nextElementSibling, vis = false;
    while(el && !el.classList.contains("setsec")){
      if(el.classList.contains("setcard") && el.style.display!=="none"){ vis = true; break; }
      el = el.nextElementSibling;
    }
    h.style.display = vis ? "" : "none";
  });
};
function showSettings(){
__backAction = null;
titleEl.textContent = "设置";
subEl.textContent = "";
const c = getCfg();
view.innerHTML = `<div class="searchwrap"><input id="set_q" placeholder="搜索设置…" oninput="filterSettings(this.value)"></div>`
+ `<h2 class="sec setsec">本机</h2>` + renderStorageCard()
+ `<h2 class="sec setsec">外观</h2>` + `
<div class="setcard"><h3>${icon("palette",15)} 命名主题</h3>
<div class="kv">八套中式意象色板（夜间 3 · 日间 5），纯本地，切换即时生效。每套主题自带壁纸，切换时壁纸跟着换；当前外观还能命名存成你的自定义主题。</div>
${themeCardsHTML()}</div>` + `
<div class="setcard"><h3>${icon("type",15)} 字号</h3>
<div class="kv">整体缩放界面，聊天泡泡也会变大，即时生效。</div>
${fontScaleCardsHTML()}</div>` + `\n<div class="setcard"><h3>${icon("type",15)} 字体</h3>
<div class="kv">内置开源字体（霞鹜文楷 / 思源宋体 / 马善政毛笔 / 得意黑），随包分发，离线可用。</div>
${fontCardsHTML()}</div>` + `\n<div class="setcard"><h3>${icon("image",15)} 全局壁纸</h3>
<div class="kv">聊天背景默认跟随主题；你上传的图是「自定义壁纸」，在编辑器里选用后才压过主题，存在本机。某个聊天单独设过壁纸的不受影响。</div>
<div class="btnrow" style="margin-top:8px"><button class="btn ghost" onclick="globalWallpaperEditor()">全局壁纸 / 背景来源</button></div></div>` + `<h2 class="sec setsec">游玩</h2>` + checkinCardHTML() + `
<div class="setcard"><h3>${icon("check",15)} 成就</h3>
<div class="kv">${typeof RP_ACHV!=="undefined" ? `已解锁 ${RP_ACHV.count()}/${RP_ACHV.DEFS.length}` : ""}</div>
<div class="btnrow" style="margin-top:8px"><button class="btn ghost" onclick="showAchv()">查看成就</button></div></div>` + `<h2 class="sec setsec">安全</h2>
<div class="setcard"><h3>${icon("check",15)} 应用锁</h3>
<div class="kv">纯前端 PIN 锁。忘记 PIN 只能清除全部数据, 没有找回途径。</div>
<div id="pinset" style="margin-top:8px"></div></div>` + `<h2 class="sec setsec">连接</h2>
<div class="setcard"><h3>大模型接口 · RP 聊天用 (OpenAI 兼容)</h3>
<div class="field"><label>API 地址</label>
<input id="c_base" placeholder="https://api.openai.com/v1" value="${esc(c.base||"")}"></div>
<div class="field"><label>API Key</label>
<input id="c_key" type="password" placeholder="${c.key?"已保存（留空 = 不修改）":"sk-…"}" value=""></div>
<div class="btnrow">
<button class="btn" onclick="fetchModels()">拉取模型列表</button>
<button class="btn ghost" onclick="testConn()">测试连接</button>
</div>
<div id="conn_result"></div>
<div class="field"><label>模型</label>
<div class="modelrow">
<select id="c_model_sel" onchange="document.getElementById('c_model').value=this.value;renderModelTags()"></select>
<input id="c_model" placeholder="或手动输入模型名" value="${esc(c.model||"")}" oninput="renderModelTags()">
</div></div>
<div class="field"><label>模型能力标签（对标 Janitor 模型目录：推理 / 视觉 / 长上下文）</label>
<div id="modeltags_row"></div>
<div class="modelrow" style="margin-top:6px">
<input id="modeltag_new" placeholder="自定义标签，如：联网搜索" style="flex:1">
<button class="btn ghost" onclick="modelTagAdd()">＋ 标签</button>
</div>
<div class="hint">给当前模型打标签，选模型时一眼看清能力；自定义标签会记住。</div></div>
<div class="field"><label>生图模型（可空，如 dall-e-3）</label>
<input id="c_img" placeholder="不填则不启用生图" value="${esc(c.imgModel||"")}"></div>
<div class="field"><label>TTS 模型（可空，如 tts-1）</label>
<input id="c_tts" placeholder="不填则不启用朗读" value="${esc(c.ttsModel||"")}"></div>
<div class="field"><label>TTS 音色</label>
<input id="c_voice" placeholder="alloy" value="${esc(c.ttsVoice||"")}"></div>
<div class="btnrow"><button class="btn" onclick="saveCfgUI()">保存</button></div>
</div>`+ (typeof RP_SOUL_CFG!=="undefined" ? RP_SOUL_CFG.profilesCardHTML() : "") +`<h2 class="sec setsec">RP 引擎</h2>
<div class="setcard"><h3>基础</h3>
<div class="field"><label>${icon("user",15)} 我的人设（全局）</label>
<div class="btnrow"><button class="btn ghost" onclick="personaEditor(null,'settings')">编辑全局人设</button></div>
<div class="hint" id="persona_sum"></div></div>
<div class="field"><label>Prompt 预设（人设分段组装顺序）</label>
<select id="r_preset">${Object.keys(RP_PROMPT.PRESETS).map(k=>
`<option value="${k}" ${getRpCfg().preset===k?"selected":""}>${RP_PROMPT.PRESETS[k].name} - ${RP_PROMPT.PRESETS[k].desc}</option>`).join("")}</select></div>
<div class="field"><label>${icon("books",15)} 酒馆预设（ST 预设导入，控制整套 prompt 的组装顺序与指令）</label>
<select id="r_stpreset"></select>
<div class="hint">导入 SillyTavern 导出的预设 JSON（如 MoM 类预设）。启用后，聊天 prompt 按预设的条目顺序组装；留空则用上面的经典组装。</div>
<div class="btnrow"><button class="btn ghost" onclick="document.getElementById('stpreset_file').click()">导入完整 ST 预设</button>
<button class="btn ghost" onclick="stPresetEntries()">管理条目</button>
<button class="btn ghost" onclick="exportStPreset()">导出所选预设</button>
<button class="btn ghost" onclick="delStPromptPreset()">删除所选预设</button>
<input type="file" id="stpreset_file" accept=".json,application/json" style="display:none" onchange="importStPromptPreset(this)"></div></div>
<div class="field"><label>上下文窗口（tokens，按模型填，如 8192/32768）</label>
<input id="r_ctx" type="number" min="2048" max="200000" step="1024" value=""></div>
<div class="field"><label>预留回复长度（tokens）</label>
<input id="r_resp" type="number" min="128" max="4096" step="128" value=""></div>
<div class="field"><label>摘要子模型（可空，为空则用主模型）</label>
<input id="r_summ" placeholder="如 gpt-4o-mini / deepseek-chat" value=""></div>
<div class="field"><label>温度（0-1.5，越高越放飞）</label>
<input id="r_temp" type="number" min="0" max="1.5" step="0.1" value=""></div>
<div class="field"><label>Top P（0-1，越小越保守）</label>
<input id="r_topp" type="number" min="0" max="1" step="0.05" value=""></div>
<div class="field"><label><input id="r_optcards" type="checkbox" style="width:auto"> ${icon("dice",14)} 剧情选项卡（AI 在回复末尾输出行动选项，点选项直接继续）</label></div>
<div class="field"><label>剧情选项数量（2-6 个）</label>
<input id="r_optcount" type="number" min="2" max="6" step="1" value=""></div>
<div class="field"><label>剧情选项氛围</label>
<select id="r_optmood">
<option value="none">无（默认）</option>
<option value="tense">紧张刺激</option>
<option value="warm">温情治愈</option>
<option value="mystery">悬疑烧脑</option>
<option value="casual">轻松日常</option>
<option value="flirty">暧昧拉扯</option>
</select></div>
<div class="field"><label><input id="r_ooc" type="checkbox" style="width:auto"> OOC 自动纠正（跳出角色时重试一次）</label></div>
<div class="field"><label><input id="r_ttsauto" type="checkbox" style="width:auto"> ${icon("volume",14)} 自动朗读 AI 回复（TTS 语音气泡播放）</label></div>
<div class="field"><label><input id="r_typewriter" type="checkbox" style="width:auto"> 打字机效果（AI 回复逐字呈现，点气泡/发消息可打断）</label></div>
<div class="field"><label>聊天壁纸</label>
<select id="r_wallpaper"></select></div>
<div class="field"><label>界面字体</label>
<select id="r_font"></select></div>
<div class="field"><label>记忆整理周期（每 N 条消息跑一次三层记忆分析）</label>
<input id="r_memcycle" type="number" min="5" value=""></div>
<div class="field"><label>记忆三池预算比例（近期 / 长远 / 重要，如 50/30/20）</label>
<input id="r_mempool" placeholder="50/30/20" value=""></div>
<div class="field"><label>新聊天记忆窗口（单次 prompt 注入记忆条数；条数越低越不易出错，对标 Janitor "Set New Chat Memory window. Lower if you get errors."）</label>
<input id="r_memwin" type="number" min="10" max="500" step="10" value=""></div>
<div class="field"><label><input id="r_leanmem_on" type="checkbox" style="width:auto"> 启用三库记忆（LeanMem：画像 / 事件 / 记录分流，检索按问题类型自适应）</label></div>
<div class="field"><label><input id="r_apex_on" type="checkbox" style="width:auto"> 启用记忆版本链（APEX-MEM：只追加不覆盖，旧版本可查；检索时消解矛盾记忆）</label></div>
<div class="field"><label>二遍对齐 PPA（第一遍自由生成，第二遍对照铁律/弧光改写，只修人设与穿帮）</label>
<select id="r_ppa_mode"><option value="off">关闭</option><option value="key">关键轮触发（默认）</option><option value="always">每轮都跑</option></select></div>
<div class="field"><label>二遍对齐模型（留空=用摘要模型，再空=用主模型，建议填便宜小模型）</label>
<input id="r_ppa_model" placeholder="留空跟随" value=""></div>
<div class="btnrow"><button class="btn" onclick="saveRpCfgUI()">保存 RP 设置</button><button class="btn ghost" onclick="importStPreset()">${icon("download")} 仅导入采样参数</button></div>
<div class="hint">每 N 条消息，引擎自动整理一次记忆：LeanMem 三库分流（画像库 / 事件库 / 记录库）+ 当前心境（1 次模型调用），存在本机；关闭三库记忆则回退为三池旧行为。</div>
<div class="hint">Key 只保存在本机, 聊天时由手机直接请求你填的接口, 不经过任何中转。
免费/便宜的兼容接口 (如硅基流动、DeepSeek) 都可以直接填。</div>
<div class="setcard"><h3>🧠 记忆说明</h3>
<div class="hint">旧消息会逐渐从记忆中褪色，但你置顶 / 存入事件簿的记忆会一直保留。</div>
<div class="hint">为什么TA会忘记东西？因为 AI 记忆有最大对话容量的限制，最近没提到的内容会出现失忆。为此你可以：置顶重要消息（长按消息）、填写本聊摘要、把关键事件设为永久记忆——这样即便近期未在对话中提到，TA 也会记住它们啦。</div>
</div>
<div class="setcard"><h3>${icon("clock",15)} 世界模拟 · 时间 / 天气 / 地理</h3>
<div class="field"><label><input id="r_ws_on" type="checkbox" style="width:auto"> 启用世界模拟（每会话独立时钟，随聊天自动流逝）</label></div>
<div class="field"><label>时间推进：每 N 轮用户消息</label>
<input id="r_ws_permsg" type="number" min="1" max="20" step="1" value=""></div>
<div class="field"><label>每次推进分钟数（古代世界显示为时辰）</label>
<input id="r_ws_stepmin" type="number" min="0" max="1440" step="5" value=""></div>
<div class="field"><label><input id="r_ws_wxauto" type="checkbox" style="width:auto"> 天气自动流转（按季节随机变化）</label></div>
<div class="field"><label>每 N 轮掷一次天气变化</label>
<input id="r_ws_wxevery" type="number" min="1" max="50" step="1" value=""></div>
<div class="field"><label><input id="r_temporal_on" type="checkbox" style="width:auto"> 启用时序感知（角色只知故事进度之前的事件，防"提前知道剧本"式穿帮）</label></div>
<div class="hint">时间/天气/地点会注入 prompt，AI 叙述会自动呼应；AI 也可用 ⟦+30分钟⟧ / ⟦天气=雨⟧ / ⟦地点=宁国府⟧ 标记调整。地点切换消耗移动时间。</div>
<div class="btnrow"><button class="btn" onclick="saveRpCfgUI()">保存 RP 设置</button></div>
</div>

<div class="setcard"><h3>${icon("clapperboard",15)} 导演系统 · 剧情节奏</h3>
<div class="field"><label><input id="r_dir_on" type="checkbox" style="width:auto"> 启用导演系统（幕后规划剧情节奏、抛事件，AI 扮演不受影响）</label></div>
<div class="field"><label>介入档位</label>
<select id="r_dir_tier"><option value="sentinel">节奏哨兵（默认）</option><option value="full">全导演（每轮介入）</option></select></div>
<div class="field"><label>导演风格</label>
<select id="r_dir_style">${(typeof RP_DIRECTOR!=="undefined"?Object.keys(RP_DIRECTOR.STYLES):["slowburn"]).map(k=>`<option value="${k}" ${(getRpCfg().directorStyle||"slowburn")===k?"selected":""}>${(typeof RP_DIRECTOR!=="undefined"?RP_DIRECTOR.STYLES[k].name:k)}</option>`).join("")}</select></div>
<div class="field"><label>节奏哨兵：每 N 轮用户消息介入一次</label>
<input id="r_dir_every" type="number" min="2" max="20" step="1" value=""></div>
<div class="field"><label>停滞强制升级：连续 N 轮无波澜则强制抛事件打破循环</label>
<input id="r_dir_stale" type="number" min="3" max="30" step="1" value=""></div>
<div class="field"><label>导演用模型（留空则与主模型一致；建议填便宜小模型省 token）</label>
<input id="r_dir_model" type="text" placeholder="留空 = 与主模型一致" value=""></div>
<div class="hint">导演只规划剧情（节奏/事件/转场），永远不写正文、不替你做决定；指令注入 prompt 后从正文剥离，你看不到导演的存在。节奏哨兵约增加 1/5 token 消耗。</div>
<div class="hint">${noBlueprintNote((typeof CHAT!=="undefined" && CHAT) ? CHAT.runId : null)}</div>
<div class="btnrow"><button class="btn" onclick="saveRpCfgUI()">保存 RP 设置</button></div>
</div>

<h2 class="sec setsec">通知</h2>
<div class="setcard"><h3>${icon("bell",15)} 通知 · 角色召回</h3>
<div class="field"><label><input id="r_notify_on" type="checkbox" style="width:auto"> 角色召回通知（App 从后台回到前台、且距上次聊天超过 N 小时，发一条本地通知）</label></div>
<div class="field"><label>超过 N 小时未聊天则召回</label>
<input id="r_notify_hours" type="number" min="1" max="168" step="1" value=""></div>
<div class="field"><label>通知文案模板（可用 {{npc_name}} / {{username}}）</label>
<textarea id="r_notify_tpl" rows="2" placeholder="{{npc_name}}：你回来了，{{username}}！"></textarea></div>
<div class="hint">只做本地通知，不经过任何服务器，也没有推送通道；浏览器里预览时不会真发（需要 Android 原生端）。</div>
<div class="btnrow"><button class="btn" onclick="saveNotifyUI()">保存通知设置</button></div>
</div>

<div class="setcard"><h3>${icon("clock",15)} 主动消息 · 心跳检查（可编辑）</h3>
<div class="field"><label><input id="r_hb_on" type="checkbox" style="width:auto"> 启用心跳检查（仅前台生效，后台不执行）</label></div>
<div class="field"><label>检查频率</label>
<select id="r_hb_freq"></select></div>
<div class="field"><label>心跳用模型（留空=跟随摘要模型；建议填便宜小模型）</label>
<input id="r_hb_model" placeholder="留空跟随" value=""></div>
<div class="field"><label>检查事项（每行一条，可编辑）</label>
<textarea id="r_hb_items" rows="4"></textarea></div>
<div class="hint">仅前台生效，后台不执行。用户消息轮次到达间隔、或手动点"检查一次"时，用便宜模型做一次检查；即使判定"想主动说话"，也只记入日志、不自动发送。</div>
<div class="btnrow"><button class="btn" onclick="saveHbUI()">保存心跳设置</button><button class="btn ghost" onclick="hbCheckOnce()">检查一次</button></div>
<div id="hb_log"></div>
</div>

<h2 class="sec setsec">数据</h2>
<div class="hint">产物数据随 App 版本更新。新蒸馏任务跑完后, 我会打新版 APK, 覆盖安装即可。</div>
<div class="btnrow"><button class="btn ghost" onclick="showOnboard(1)">重新查看新手引导</button>
<button class="btn danger" onclick="wipeAll()">清空任务/聊天/配置</button></div>
</div>`;
(function(){
const rc = getRpCfg();
document.getElementById("r_ctx").value = rc.maxContext;
document.getElementById("r_resp").value = rc.respTokens;
document.getElementById("r_summ").value = rc.summaryModel||"";
document.getElementById("r_temp").value = rc.temperature;
document.getElementById("r_topp").value = rc.topP;
try{ renderStPresetSel(); }catch(e){}
document.getElementById("r_optcards").checked = !!rc.optCards;
document.getElementById("r_optcount").value = rc.optCount||4;
document.getElementById("r_optmood").value = rc.optMood||"none";
document.getElementById("r_ooc").checked = !!rc.ooc;
document.getElementById("r_ttsauto").checked = !!rc.ttsAuto;
document.getElementById("r_typewriter").checked = rc.typewriter!==false;
document.getElementById("r_ws_on").checked = rc.worldsim!==false;
document.getElementById("r_ws_permsg").value = rc.wsPerMsg||3;
document.getElementById("r_ws_stepmin").value = rc.wsStepMin||30;
document.getElementById("r_ws_wxauto").checked = rc.wsWxAuto!==false;
document.getElementById("r_ws_wxevery").value = rc.wsWxEvery||5;
document.getElementById("r_temporal_on").checked = rc.temporal!==false;
document.getElementById("r_dir_on").checked = rc.director!==false;
document.getElementById("r_dir_tier").value = rc.directorTier||"sentinel";
document.getElementById("r_dir_style").value = rc.directorStyle||"slowburn";
document.getElementById("r_dir_every").value = rc.directorEvery||5;
document.getElementById("r_dir_stale").value = rc.directorStale||8;
document.getElementById("r_dir_model").value = rc.directorModel||"";
(function(){ /* P2: 壁纸/字体选项 */
if(typeof RP_APPEAR==="undefined") return;
const ap = RP_APPEAR.getAppear();
const ws = document.getElementById("r_wallpaper"), fs = document.getElementById("r_font");
if(ws) ws.innerHTML = RP_APPEAR.WALLPAPERS.map(w=>`<option value="${w.id}"${ap.wallpaper===w.id?" selected":""}>${w.name}</option>`).join("");
if(fs) fs.innerHTML = RP_APPEAR.FONTS.map(f=>`<option value="${f.id}"${ap.font===f.id?" selected":""}>${f.name}</option>`).join("");
/* P2: IndexedDB 用量行 + 已备份计数 */
try{
  const line = document.getElementById("idbline");
  if(line && typeof RP_STORE!=="undefined"){
    const r = RP_STORE.idbBytes();
    if(r && r.then) r.then(b=>{ if(b!=null) line.children[1].textContent = fmtBytes(b); else line.children[1].textContent = "未启用"; }).catch(()=>{});
    else line.children[1].textContent = "未启用";
  }
  const cl = document.getElementById("idbcopied");
  if(cl && typeof RP_STORE!=="undefined" && RP_STORE.copiedCount){
    cl.children[1].textContent = RP_STORE.copiedCount() + " 个大文件";
  }
}catch(e){}
window.storeCleanup = async ()=>{
  if(typeof RP_STORE==="undefined" || !RP_STORE.cleanupCopied){ alert("当前环境不支持"); return; }
  if(!confirm("把已备份到大文件存储的聊天记录/角色卡从 localStorage 里删除，释放空间？聊天记录不受影响（仍可正常读取）。")) return;
  try{
    const r = await RP_STORE.cleanupCopied();
    alert(`已释放 ${fmtBytes(r.freed)}，清理 ${r.count} 个文件`);
  }catch(e){ alert("清理失败："+e.message); }
  showSettings();
};
})();
document.getElementById("r_memcycle").value = rc.memCycle||10;
document.getElementById("r_mempool").value = rc.memPoolRatio||"50/30/20";
document.getElementById("r_memwin").value = rc.memWindowN||60; /* Tier2 #12 */
document.getElementById("r_leanmem_on").checked = rc.leanmem!==false;
document.getElementById("r_apex_on").checked = rc.apex!==false;
document.getElementById("r_ppa_mode").value = rc.ppaMode||"key";
document.getElementById("r_ppa_model").value = rc.ppaModel||"";
(function(){ const gp = RP_PERSONA.getGlobal();
const el = document.getElementById("persona_sum");
if(el) el.textContent = gp ? ("当前：" + (gp.name||"") + " " + String(gp.desc||"").slice(0,40)) : "未设置（建议填一下，AI 聊天时会知道你是谁）"; })();
/* Tier3-24: 通知设置初始化 */
(function(){
const nc = getNotifyCfg();
document.getElementById("r_notify_on").checked = !!nc.on;
document.getElementById("r_notify_hours").value = nc.hours||6;
document.getElementById("r_notify_tpl").value = nc.template||"";
})();
/* Tier3-25: 心跳设置初始化 */
(function(){
if(typeof RP_HB==="undefined") return;
const hb = RP_HB.getCfg();
document.getElementById("r_hb_on").checked = !!hb.enabled;
document.getElementById("r_hb_freq").innerHTML = Object.keys(RP_HB.FREQS).map(k=>
`<option value="${k}"${hb.freq===k?" selected":""}>${RP_HB.FREQS[k].name}（每 ${RP_HB.FREQS[k].rounds} 轮）</option>`).join("");
document.getElementById("r_hb_model").value = hb.model||"";
document.getElementById("r_hb_items").value = (hb.items||[]).join("\n");
renderHbLog();
})();
renderPinSettings();
try{ if(typeof renderModelTags === "function") renderModelTags(); }catch(e){} /* Tier2 #18 */
const c = getCfg();
if(c.base && c.key){ fetchModels(true); }
else {
try{
const cached = JSON.parse(localStorage.getItem("nd_models")||"[]");
const sel = document.getElementById("c_model_sel");
if(sel && cached.length) sel.innerHTML = cached.map(id=>"<option>"+esc(id)+"</option>").join("");
}catch(e){}
}
})();
}
window.saveCfgUI = ()=>{
const base = $("#c_base").value.trim();
/* v37 安全: http:// 会明文传输 API Key，保存前必须让用户明确知晓 */
if(/^http:\/\//i.test(base) && !confirm("当前接口地址是 http://，API Key 将以明文在网络上传输，存在被窃听风险。\n建议改用 https://。仍要保存吗？")) return;
/* v37 安全(P2-S1): Key 不再回显到页面 DOM。输入框留空表示"沿用已保存的 Key"，
 * 避免任何同源脚本/开发者工具直接读到明文口令。 */
const typed = $("#c_key").value.trim();
const prev = getCfg();
const key = typed || (prev.key || "");
if(typed && typed !== prev.key && /^[a-z]+:\/\//i.test(base) && !/^https:\/\//i.test(base)){
  if(!confirm("接口地址不是 https://，Key 会以明文形式发送。仍要保存吗？")) return;
}
const m = $("#c_model").value.trim() || $("#c_model_sel").value;
saveCfg({base:base, key:key, model:m,
imgModel:$("#c_img").value.trim(), ttsModel:$("#c_tts").value.trim(), ttsVoice:$("#c_voice").value.trim()||"alloy"});
$("#c_key").value = "";
$("#c_key").placeholder = "已保存（留空 = 不修改）";
alert("已保存");
};
async function _api(path, cfg, method, body){
const base = (cfg.base||"").replace(/\/+$/,"");
const r = await fetch(`${base}${path}`, {
method: method||"GET",
headers:Object.assign({"Content-Type":"application/json"},
cfg.key?{"Authorization":`Bearer ${cfg.key}`}:{}),
body: body?JSON.stringify(body):undefined,
});
if(!r.ok) throw new Error(`HTTP ${r.status}`);
return r.json();
}
function _cfgFromUI(){
/* Key 输入框留空 = 沿用已保存的 Key（页面不再回显明文） */
const typed = $("#c_key").value.trim();
return {base:$("#c_base").value.trim(), key:typed || (getCfg().key || ""),
model:$("#c_model").value.trim()||$("#c_model_sel").value};
}
/* Tier2 #18: 模型能力标签 (对标 Janitor 模型目录过滤器：推理 / 视觉 / 长上下文)。
 * 用户自配模型时给模型打标签，不再盲选。 */
window.renderModelTags = ()=>{
const row = document.getElementById("modeltags_row");
const mv = document.getElementById("c_model");
if(!row || !mv || typeof RP_MODELTAGS === "undefined") return;
const id = mv.value;
const tags = RP_MODELTAGS.allTagsFor(id);
const cur = RP_MODELTAGS.get(id);
row.innerHTML = tags.map(t=>
`<label class="tagchip"><input type="checkbox" data-tag="${esc(t)}" ${cur.indexOf(t)>=0?"checked":""}> ${esc(t)}</label>`).join("")
|| `<span class="dim">暂无标签</span>`;
Array.prototype.forEach.call(row.querySelectorAll("input[data-tag]"), (cb)=>{
cb.onchange = ()=>{
const on = Array.prototype.filter.call(row.querySelectorAll("input[data-tag]"), x=>x.checked).map(x=>x.getAttribute("data-tag"));
RP_MODELTAGS.save(id, on);
renderModelTags();
};
});
};
window.modelTagAdd = ()=>{
const inp = document.getElementById("modeltag_new");
const mv = document.getElementById("c_model");
if(!inp || !mv || typeof RP_MODELTAGS === "undefined") return;
const t = inp.value.trim();
if(!t) return;
const id = mv.value;
const cur = RP_MODELTAGS.get(id);
if(cur.indexOf(t) < 0){ cur.push(t); RP_MODELTAGS.save(id, cur); }
inp.value = "";
renderModelTags();
};
window.fetchModels = async (silent)=>{const cfg = _cfgFromUI();
const box = $("#conn_result");
if(!cfg.base){ if(!silent) alert("先填 API 地址"); return []; }
try{
if(box && !silent) box.innerHTML = "正在拉取模型列表…";
const d = await _api("/models", cfg);
const ids = (d.data||[]).map(x=>x.id).filter(Boolean).sort();
const sel = $("#c_model_sel");
const cur = cfg.model;
sel.innerHTML = ids.map(id=>`<option value="${esc(id)}" ${id===cur?"selected":""}>${esc(id)}</option>`).join("")
|| `<option value="">(无可用模型)</option>`;
if(cur && ids.includes(cur)) sel.value = cur;
/* 模型列表只是缓存，写不进去不影响本次拉取结果 */
try{ localStorage.setItem("nd_models", JSON.stringify(ids)); }catch(e){}
if(box && !silent) box.innerHTML = `<span class="conn-ok">${icon("check",14)} 拉到 ${ids.length} 个模型</span>`;
return ids;
}catch(e){
if(box && !silent) box.innerHTML = `<span class="conn-bad">${icon("x",14)} 拉取失败：${esc(e.message)}</span>`;
return [];
}
};
window.testConn = async ()=>{
const cfg = _cfgFromUI();
const box = $("#conn_result");
const t0 = Date.now();
try{
box.innerHTML = "① 检查地址与 Key…";
await _api("/models", cfg);
box.innerHTML = "① <span class='conn-ok'>" + icon("check",14) + " 地址/Key 有效</span><br>② 测试模型对话…";
const d = await _api("/chat/completions", cfg, "POST", {
model: cfg.model, max_tokens: 8,
messages:[{role:"user", content:"回一个字：好"}],
});
const reply = d.choices && d.choices[0] && d.choices[0].message
? d.choices[0].message.content : "(空)";
box.innerHTML = `① <span class='conn-ok'>${icon("check",14)} 地址/Key 有效</span><br>`
+ `② <span class='conn-ok'>${icon("check",14)} 模型 ${esc(cfg.model)} 可用</span>（${((Date.now()-t0)/1000).toFixed(1)}s，回复：${esc(String(reply).slice(0,20))}）`;
}catch(e){
box.innerHTML = `<span class="conn-bad">${icon("x",14)} ${esc(e.message)}</span><br>`
+ `<span style="color:var(--ink-faint);font-size:calc(12px * var(--fs))">检查地址/Key/模型名，或手机网络/代理。</span>`;
}
};
window.saveRpCfgUI = ()=>{
const _stId = document.getElementById("r_stpreset") ? document.getElementById("r_stpreset").value || null : null;
/* v37: 绑定的 ST 预设自带采样参数则应用到温度/TopP */
let _stParams = null;
try{ const _p = (typeof RP_PRESET!=="undefined") ? RP_PRESET.get(_stId) : null; _stParams = _p ? _p.params : null; }catch(e){}
const _tempInput = Math.max(0,Math.min(1.5,parseFloat($("#r_temp").value)||0.9));
const _topPInput = Math.max(0,Math.min(1,parseFloat($("#r_topp").value)||1));
saveRpCfg({maxContext:Math.max(2048,parseInt($("#r_ctx").value)||8192),
respTokens:Math.max(128,parseInt($("#r_resp").value)||512),
summaryModel:$("#r_summ").value.trim(),
temperature:(_stParams&&_stParams.temperature!=null)?Math.max(0,Math.min(1.5,_stParams.temperature)):_tempInput,
topP:(_stParams&&_stParams.top_p!=null)?Math.max(0,Math.min(1,_stParams.top_p)):_topPInput,
optCards:$("#r_optcards").checked,
optCount:Math.min(6,Math.max(2,parseInt($("#r_optcount").value)||4)),
optMood:$("#r_optmood").value||"none",
ooc:$("#r_ooc").checked, preset:$("#r_preset").value,
stPreset:_stId,
ttsAuto:$("#r_ttsauto").checked, typewriter:$("#r_typewriter").checked,
memCycle:Math.max(5,parseInt($("#r_memcycle").value)||10),
memPoolRatio:(($("#r_mempool")&&$("#r_mempool").value)||"50/30/20").trim()||"50/30/20",
memWindowN:Math.min(500,Math.max(10,parseInt(($("#r_memwin")&&$("#r_memwin").value)||"60")||60)), /* Tier2 #12 */
leanmem:$("#r_leanmem_on")?$("#r_leanmem_on").checked:true,
apex:$("#r_apex_on")?$("#r_apex_on").checked:true,
ppaMode:$("#r_ppa_mode")?$("#r_ppa_mode").value:"key",
ppaModel:$("#r_ppa_model")?$("#r_ppa_model").value.trim():"",
/* 世界模拟三件套 */
worldsim:$("#r_ws_on")?$("#r_ws_on").checked:true,
wsPerMsg:Math.max(1,parseInt($("#r_ws_permsg")?$("#r_ws_permsg").value:"3")||3),
wsStepMin:Math.max(0,parseInt($("#r_ws_stepmin")?$("#r_ws_stepmin").value:"30")||0),
wsWxAuto:$("#r_ws_wxauto")?$("#r_ws_wxauto").checked:true,
wsWxEvery:Math.max(1,parseInt($("#r_ws_wxevery")?$("#r_ws_wxevery").value:"5")||5),
temporal:$("#r_temporal_on")?$("#r_temporal_on").checked:true,
/* 导演系统 */
director:$("#r_dir_on")?$("#r_dir_on").checked:true,
directorTier:$("#r_dir_tier")?$("#r_dir_tier").value:"sentinel",
directorStyle:$("#r_dir_style")?$("#r_dir_style").value:"slowburn",
directorEvery:Math.max(2,parseInt($("#r_dir_every")?$("#r_dir_every").value:"5")||5),
directorStale:Math.max(3,parseInt($("#r_dir_stale")?$("#r_dir_stale").value:"8")||8),
directorModel:(($("#r_dir_model")?$("#r_dir_model").value:"")||"").trim()});
/* P2: 壁纸/字体 */
try{
if(typeof RP_APPEAR!=="undefined"){
RP_APPEAR.setAppear({wallpaper:$("#r_wallpaper").value, font:$("#r_font").value});
applyAppearance();
}
}catch(e){}
try{ /* v37: 预设采样参数回填到输入框, 所见即所得 */
const _rc2 = getRpCfg();
if(document.getElementById("r_temp")) document.getElementById("r_temp").value = _rc2.temperature;
if(document.getElementById("r_topp")) document.getElementById("r_topp").value = _rc2.topP;
}catch(e){}
alert("RP 设置已保存");
};
/* P2: 应用壁纸 + 字体 */
window.applyAppearance = ()=>{
try{
if(typeof RP_APPEAR==="undefined") return;
const ap = RP_APPEAR.getAppear();
document.body.dataset.wallpaper = ap.wallpaper;
document.body.dataset.font = ap.font;
}catch(e){}
};
/* v37: ST 预设(prompt 组件)导入/管理/绑定。旧 importStPreset 只导采样参数，保留。 */
function renderStPresetSel(){
const sel = document.getElementById("r_stpreset");
if(!sel || typeof RP_PRESET === "undefined") return;
const cur = getRpCfg().stPreset || "";
let html = `<option value="">不使用（经典组装）</option>`;
RP_PRESET.list().forEach(p=>{
const n = (p.prompts||[]).length, on = (p.prompts||[]).filter(e=>e && e.enabled!==false).length;
html += `<option value="${p.id}" ${p.id===cur?"selected":""}>${esc(p.name)}（${on}/${n} 启用）</option>`;
});
sel.innerHTML = html;
}
window.importStPromptPreset = (input)=>{
const f = input.files && input.files[0];
input.value = "";
if(!f || typeof RP_PRESET === "undefined") return;
const rd = new FileReader();
rd.onload = ()=>{
const fname = (f.name || "").replace(/\.json$/i, "");
const r = RP_PRESET.parseFile(rd.result, fname);
if(!r.ok){
alert(r.err==="noprompts" ? "这不是 ST 预设文件（缺少 prompts 数组）。" :
      r.err==="empty" ? "预设里没有可用的条目。" : "JSON 解析失败。");
return;
}
RP_PRESET.save(r.preset);
const rc = getRpCfg(); rc.stPreset = r.preset.id; saveRpCfg(rc);
renderStPresetSel();
const all = r.preset.prompts, on = all.filter(p=>p.enabled!==false).length;
const mk = all.filter(p=>p.marker).length;
alert("已导入预设「" + r.preset.name + "」：" + all.length + " 条（" + on + " 启用），" +
  mk + " 个定位标记。" +
  (r.preset.params.temperature != null ? "采样温度 " + r.preset.params.temperature + " 将在保存设置时应用。" : "") +
  "可在「管理条目」里逐条开关。");
};
rd.readAsText(f);
};
window.delStPromptPreset = ()=>{
const sel = document.getElementById("r_stpreset");
const id = sel ? sel.value : "";
if(!id){ alert("当前没有选择已导入的预设。"); return; }
const p = RP_PRESET.get(id);
if(!confirm("删除预设「" + (p ? p.name : id) + "」？")) return;
RP_PRESET.remove(id);
const rc = getRpCfg();
if(rc.stPreset === id){ rc.stPreset = null; saveRpCfg(rc); }
renderStPresetSel();
};
/* ST 预设导出(JSON): RP_PRESETEXPORT.exportPreset, 与 RP_PRESET.parseFile 互逆, 可导回 ST */
window.exportStPreset = ()=>{
const sel = document.getElementById("r_stpreset");
const id = sel ? sel.value : "";
if(!id || typeof RP_PRESET === "undefined" || typeof RP_PRESETEXPORT === "undefined"){
  rpToast("请先在下拉框选择要导出的预设"); return; }
const p = RP_PRESET.get(id);
if(!p){ rpToast("预设不存在"); return; }
downloadJson("preset_st_" + p.name + ".json", RP_PRESETEXPORT.exportPreset(p));
rpToast(`已导出预设「${p.name}」(ST 格式)`);
};
/* v38: ST 预设逐条开关。条目列表页(分组标题+开关+点行进详情) */
window.stPresetEntries = ()=>{
if(typeof RP_PRESET === "undefined") return;
const sel = document.getElementById("r_stpreset");
const id = sel ? sel.value : "";
if(!id){ alert("请先在下拉框选择一个已导入的预设。"); return; }
renderStPresetEntries(id);
};
function stPresetEntryBadges(e){
let b = `<span class="badge">${e.marker ? "定位标记" : esc(e.role)}</span>`;
const id = String(e.identifier || "");
/* UUID 式 identifier 无信息量, 只在详情页展示 */
if(id && (e.marker || !/^[0-9a-f-]{8,}$/i.test(id))) b += `<span class="badge">${esc(id)}</span>`;
if(!e.marker && e.injection_position === "chat") b += `<span class="badge">聊天注入·深度${e.injection_depth || 0}</span>`;
if(e.enabled === false) b += `<span class="badge">停用</span>`;
return b;
}
/* v38b: ST 任意组合。条目列表页: 新增 + 上移/下移排序 + 逐条开关 */
function renderStPresetEntries(pid){
__backAction = ()=>{ setNav("settings"); };
const p = RP_PRESET.get(pid);
if(!p){ setNav("settings"); return; }
const total = p.prompts.length, on = p.prompts.filter(e=>e.enabled!==false).length;
let html = `<button class="back" onclick="setNav('settings')">${icon("back")} 返回设置</button>
<h2 style="margin:6px 0">${esc(p.name)}</h2>
<div class="hint">${total} 条目，${on} 启用 · 点行编辑，右侧开关逐条启用/停用（停用条目不参与 prompt 组装）；↑↓ 调整组装顺序</div>
<div class="btnrow"><button class="btn" onclick="stPresetAddEntry('${jq(pid)}')">${icon("plus")} 新增自定义条目</button></div>`;
let lastGroup = "\0";
p.prompts.forEach((e, i)=>{
const g = e.group || "";
if(g && g !== lastGroup){ html += `<div class="spgrp">${esc(g)}</div>`; }
lastGroup = g;
const en = e.enabled !== false;
const preview = String(e.content || "").replace(/\s+/g, " ").slice(0, 60);
html += `<div class="card card--tap" style="padding:12px 14px" onclick="stPresetEntryDetail('${jq(pid)}',${jq(i)})"><div class="row"><div style="flex:1;min-width:0">`
+ `<div class="spname">${esc(e.name)}${stPresetEntryBadges(e)}</div>`
+ (preview ? `<div class="meta">${esc(preview)}…</div>` : `<div class="meta">（空内容）</div>`)
+ `</div><div class="sbtncol">`
+ `<button class="sbtn" aria-label="上移" onclick="event.stopPropagation();stPresetMoveEntry('${jq(pid)}',${jq(i)},-1)">↑</button>`
+ `<button class="sbtn" aria-label="下移" onclick="event.stopPropagation();stPresetMoveEntry('${jq(pid)}',${jq(i)},1)">↓</button>`
+ `<button class="pswitch${en ? " on" : ""}" aria-label="启用开关" onclick="event.stopPropagation();stPresetToggleEntry('${jq(pid)}',${jq(i)})"></button>`
+ `</div></div></div>`;
});
view.innerHTML = html;
window.scrollTo(0, 0);
}
window.stPresetToggleEntry = (pid, i)=>{
const p = RP_PRESET.get(pid);
if(!p || !p.prompts[i]) return;
p.prompts[i].enabled = p.prompts[i].enabled === false ? true : false;
RP_PRESET.save(p);
renderStPresetSel();
renderStPresetEntries(pid);
};
window.stPresetMoveEntry = (pid, i, delta)=>{
if(typeof RP_PRESET.moveEntry !== "function") return;
RP_PRESET.moveEntry(pid, i, delta);
renderStPresetEntries(pid);
};
/* 新增自定义条目: 先建空条目, 直接进编辑页 */
window.stPresetAddEntry = (pid)=>{
const p = RP_PRESET.addEntry(pid, {name: "自定义条目", role: "system", content: "", group: "自定义"});
if(!p) return;
renderStPresetSel();
stPresetEntryDetail(pid, p.prompts.length - 1);
};
/* 条目详情页: 定位标记只读 + 开关; 普通条目可编辑全部字段 */
window.stPresetEntryDetail = (pid, i)=>{
const p = RP_PRESET.get(pid), e = p && p.prompts[i];
if(!e) return;
__backAction = ()=>renderStPresetEntries(pid);
const en = e.enabled !== false;
if(e.marker){
view.innerHTML = `<button class="back" onclick="renderStPresetEntries('${jq(pid)}')">${icon("back")} 返回条目</button>
<div class="card"><div class="row"><div style="flex:1;min-width:0">
<div class="spname">${esc(e.name)}</div>
<div class="meta">定位标记 · ${e.identifier ? esc(e.identifier) + " · " : ""}${e.group ? "分组:" + esc(e.group) + " · " : ""}顺序 #${(e.pos == null ? i : e.pos) + 1}</div>
<div class="hint">定位标记是预设的占位符，组装时替换为 App 侧对应内容（人设/角色/场景/示例/世界书/历史），不可编辑内容，只能开关。</div>
</div><button class="pswitch${en ? " on" : ""}" aria-label="启用开关" onclick="stPresetToggleEntryDetail('${jq(pid)}',${jq(i)})"></button></div></div>`;
window.scrollTo(0, 0);
return;
}
const isChat = e.injection_position === "chat";
view.innerHTML = `<button class="back" onclick="renderStPresetEntries('${jq(pid)}')">${icon("back")} 返回条目</button>
<div class="card">
<div class="row"><div style="flex:1;min-width:0"><div class="spname">编辑条目</div>
<div class="meta">顺序 #${(e.pos == null ? i : e.pos) + 1}${e.group ? " · 分组:" + esc(e.group) : ""}</div></div>
<button class="pswitch${en ? " on" : ""}" aria-label="启用开关" onclick="stPresetToggleEntryDetail('${jq(pid)}',${jq(i)})"></button></div>
<div class="field"><label>名称</label><input id="pe_name" value="${esc(e.name)}" maxlength="60"></div>
<div class="field"><label>角色</label><select id="pe_role">
<option value="system"${e.role==="system"?" selected":""}>system（系统指令）</option>
<option value="user"${e.role==="user"?" selected":""}>user（用户消息）</option>
<option value="assistant"${e.role==="assistant"?" selected":""}>assistant（助手消息）</option>
</select></div>
<div class="field"><label>注入位置</label><select id="pe_pos" onchange="document.getElementById('pe_depthrow').style.display=this.value==='chat'?'':'none'">
<option value=""${isChat?"":" selected"}>主提示（按顺序组装）</option>
<option value="chat"${isChat?" selected":""}>聊天中注入（插进历史消息）</option>
</select></div>
<div class="field" id="pe_depthrow" style="display:${isChat?"":"none"}"><label>注入深度（插在历史末尾 N 条消息之前，0=紧贴末尾）</label>
<input id="pe_depth" type="number" min="0" max="99" value="${e.injection_depth || 0}"></div>
<div class="field"><label>内容（支持 {{char}}/{{user}}/{{time}} 等变量宏）</label>
<textarea id="pe_content" rows="8">${esc(e.content)}</textarea></div>
<div class="btnrow"><button class="btn" onclick="stPresetSaveEntry('${jq(pid)}',${jq(i)})">保存</button>
<button class="btn danger" onclick="stPresetDelEntry('${jq(pid)}',${jq(i)})">删除条目</button></div>
</div>`;
window.scrollTo(0, 0);
};
window.stPresetToggleEntryDetail = (pid, i)=>{
const p = RP_PRESET.get(pid);
if(!p || !p.prompts[i]) return;
p.prompts[i].enabled = p.prompts[i].enabled === false ? true : false;
RP_PRESET.save(p);
renderStPresetSel();
stPresetEntryDetail(pid, i);
};
window.stPresetSaveEntry = (pid, i)=>{
const name = document.getElementById("pe_name").value.trim();
const role = document.getElementById("pe_role").value;
const pos = document.getElementById("pe_pos").value;
const depth = Math.max(0, Math.min(99, parseInt(document.getElementById("pe_depth").value) || 0));
const content = document.getElementById("pe_content").value;
RP_PRESET.updateEntry(pid, i, {name: name || undefined, role, content, injection_position: pos, injection_depth: depth});
renderStPresetSel();
renderStPresetEntries(pid);
rpToast("已保存");
};
window.stPresetDelEntry = (pid, i)=>{
const p = RP_PRESET.get(pid), e = p && p.prompts[i];
if(!e || !confirm(`删除条目「${e.name}」？`)) return;
RP_PRESET.deleteEntry(pid, i);
renderStPresetSel();
renderStPresetEntries(pid);
};
function stPresetToCfg(d, rc){
if(!d || typeof d.temperature === "undefined") return null;
rc = rc || {};
if(d.temperature != null) rc.temperature = Math.max(0, Math.min(1.5, +d.temperature || 0.9));
if(d.top_p != null) rc.topP = Math.max(0, Math.min(1, +d.top_p || 1));
if(d.openai_max_tokens != null) rc.respTokens = Math.max(128, parseInt(d.openai_max_tokens) || 512);
if(d.openai_max_context != null) rc.maxContext = Math.max(2048, parseInt(d.openai_max_context) || 8192);
return rc;
}
window.importStPreset = ()=>{
const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
inp.onchange = ()=>{
const f = inp.files[0]; if(!f) return;
const rd = new FileReader();
rd.onload = ()=>{
try{
const d = JSON.parse(rd.result);
const rc = stPresetToCfg(d, getRpCfg());
if(!rc){ alert("解析失败: 不是 ST 文本预设"); return; }
saveRpCfg(rc);
document.getElementById("r_temp").value = rc.temperature;
document.getElementById("r_topp").value = rc.topP;
document.getElementById("r_resp").value = rc.respTokens;
document.getElementById("r_ctx").value = rc.maxContext;
alert("已导入采样参数: 温度 " + rc.temperature + " / Top P " + rc.topP);
}catch(e){ alert("解析失败: " + e.message); }
};
rd.readAsText(f);
};
inp.click();
};
/* v36: 统一的"清空数据"执行器——所有清空入口（设置页 wipeAll / PIN 锁屏 wipe）
 * 必须走这里，否则 IDB 整库与原生 ndblob 文件会残留，与"不可恢复"的承诺不符。
 * 顺序不能反：先清存储层（IDB 整库 + 原生文件 + 内存镜像 + 标记），再删 localStorage
 * 业务键。RP_STORE.wipeAll 内部不再依赖标记，但旧版本桥接的逐个删除回退路径需要标记；
 * 先删标记会导致原生文件变孤儿删不掉。 */
window.__wipeAllData = function(opts){
  opts = opts || {};
  const finish = ()=>{
    try{
      if(opts.clearAll){
        localStorage.clear();
      }else{
        Object.keys(localStorage).filter(k=>k.startsWith("nd_")).forEach(k=>localStorage.removeItem(k));
      }
    }catch(e){}
    if(opts.reload){ location.reload(); return; }
    if(typeof opts.after === "function"){ try{ opts.after(); }catch(e){} }
  };
  try{
    if(typeof RP_STORE!=="undefined" && RP_STORE && RP_STORE.wipeAll){
      RP_STORE.wipeAll().then(finish, finish);
    } else finish();
  }catch(e){ finish(); }
};
window.wipeAll = ()=>{
if(!confirm("清空所有任务、聊天记录和 API 配置? 产物数据不受影响。")) return;
window.__wipeAllData({clearAll:false, after:()=>{ alert("已清空"); showSettings(); }});
};


/* ================= 分析任务 (通用周期分析引擎 UI) ================= */
window.showATasks = (name)=>{
__backAction = ()=>showChat();
const nm = name || (CHAT.mode==="group" ? null : CHAT.name);
if(!nm){
const ms = CHAT.members||[]; if(!ms.length) return;
const pick = prompt("管理谁的分析任务?\n"+ms.map((n,i)=>(i+1)+". "+n).join("\n"), "1");
const idx = parseInt(pick)-1;
if(ms[idx]) showATasks(ms[idx]);
return;
}
const defs = RP_TASKS.getDefs(CHAT.runId, nm);
titleEl.textContent = "分析任务 · " + nm;
subEl.textContent = "";
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
view.innerHTML = `
<div class="hint">周期分析任务: 按消息条数或关键词自动触发, 把分析结果注入对话 (常驻/按需) 或仅存档。内置三层记忆不在此列, 每次触发约 1 次模型调用。</div>
${defs.map(d=>{const t=RP_TASKS.normDef(d); const st=RP_TASKS.getState(CHAT.runId,nm,t.id);
return `<div class="card"><div class="row"><div><div class="name">${esc(t.name)}</div>
<div class="kv">${esc(RP_TASKS.describe(t))}</div>
<div class="kv">${st?("上次运行: "+new Date(st.updatedAt).toLocaleString()+(st.reason?" · "+st.reason:"")):"尚未运行"}</div></div></div>
<div class="btnrow"><button class="btn ghost" onclick="viewAOut('${jq(nm)}','${jq(t.id)}')">查看输出</button>
<button class="btn ghost" onclick="runATaskNow('${jq(nm)}','${jq(t.id)}')">立即运行</button>
<button class="btn ghost" onclick="editATask('${jq(nm)}','${jq(t.id)}')">编辑</button>
<button class="btn danger ghost" onclick="delATask('${jq(nm)}','${jq(t.id)}')">删除</button></div></div>`;}).join("") || `<div class="empty">还没有分析任务, 点下面新建一个。</div>`}
<div class="btnrow"><button class="btn" onclick="editATask('${jq(nm)}','')">${icon("plus")} 新建任务</button>
<button class="btn ghost" onclick="showChat()">返回聊天</button></div>`;
};
window.editATask = (name, id)=>{
__backAction = ()=>showATasks(name);
const defs = RP_TASKS.getDefs(CHAT.runId, name);
const t = RP_TASKS.normDef(id ? (defs.find(d=>d.id===id)||{}) : {id: RP_TASKS.nextId(defs)});
titleEl.textContent = (id?"编辑任务 · ":"新建任务 · ") + name;
subEl.textContent = "";
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
view.innerHTML = `
<div class="setcard">
<div class="field"><label>任务名</label><input id="at_name" value="${esc(t.name)}"></div>
<div class="field"><label>分析提示词 (可用变量 {{CHAR_NAME}} {{CARD_HINT}} {{PREV_OUTPUT}} {{NEW_DIALOG}})</label>
<textarea id="at_prompt" rows="8" placeholder="从下方新对话里提取值得记住的事件, 用角色口吻写成条目">${esc(t.prompt)}</textarea></div>
<div class="field"><label>触发周期 (每 N 条新消息跑一次, 0=关闭周期触发)</label>
<input id="at_cycle" type="number" min="0" value="${t.cycle}"></div>
<div class="field"><label>关键词触发 (逗号分隔, 新消息命中任一即触发, 可空)</label>
<input id="at_kw" value="${esc(t.keywords.join(","))}" placeholder="如: 宝钗,史湘云"></div>
<div class="field"><label>输出方式</label><select id="at_mode">
<option value="constant" ${t.mode==="constant"?"selected":""}>常驻注入 (每次对话都记住)</option>
<option value="selective" ${t.mode==="selective"?"selected":""}>按需注入 (聊到关键词才想起)</option>
<option value="off" ${t.mode==="off"?"selected":""}>仅存档 (不注入对话)</option></select></div>
<div class="field"><label><input id="at_enabled" type="checkbox" style="width:auto" ${t.enabled?"checked":""}> 启用</label></div>
<div class="btnrow"><button class="btn" onclick="saveATask('${jq(name)}','${jq(t.id)}')">保存</button>
<button class="btn ghost" onclick="showATasks('${jq(name)}')">返回</button></div>
<div class="hint">{{NEW_DIALOG}} 是上次运行以来的新对话; {{PREV_OUTPUT}} 是任务上次的输出, 适合做增量更新。</div>
</div>`;
};
window.saveATask = (name, id)=>{
const defs = RP_TASKS.getDefs(CHAT.runId, name).map(RP_TASKS.normDef);
const t = RP_TASKS.normDef({id: id, name: $("#at_name").value, prompt: $("#at_prompt").value,
cycle: $("#at_cycle").value, keywords: $("#at_kw").value, mode: $("#at_mode").value,
enabled: $("#at_enabled").checked});
if(!t.prompt.trim()){ alert("提示词不能为空"); return; }
const i = defs.findIndex(d=>d.id===id);
if(i>=0) defs[i]=t; else defs.push(t);
RP_TASKS.saveDefs(CHAT.runId, name, defs);
showATasks(name);
};
window.delATask = (name, id)=>{
if(!confirm("删除这个分析任务? 已存的输出也会清除。")) return;
RP_TASKS.saveDefs(CHAT.runId, name, RP_TASKS.getDefs(CHAT.runId, name).filter(d=>d.id!==id));
RP_TASKS.clearState(CHAT.runId, name, id);
showATasks(name);
};
window.viewAOut = (name, id)=>{
__backAction = ()=>showATasks(name);
const defs = RP_TASKS.getDefs(CHAT.runId, name);
const t = defs.find(d=>d.id===id)||{};
const st = RP_TASKS.getState(CHAT.runId, name, id);
titleEl.textContent = "任务输出 · " + (t.name||"");
subEl.textContent = "";
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
view.innerHTML = `<div class="setcard">
<div class="kv">${st?("更新于 "+new Date(st.updatedAt).toLocaleString()+(st.reason?" · 触发: "+st.reason:"")):"尚未运行"}</div>
<pre style="white-space:pre-wrap;font-size:calc(13px * var(--fs))">${esc((st&&st.output)||"(空)")}</pre>
<div class="btnrow"><button class="btn ghost" onclick="showATasks('${jq(name)}')">返回</button></div></div>`;
};
window.runATaskNow = async (name, id)=>{
const cfg = getCfg();
if(!cfg.key){ alert("先去设置里配 API"); return; }
if(!confirm("用最近的聊天记录跑一次这个任务? (约 1 次模型调用)")) return;
const h = getHistSafe(chatHistKey());
const card = (RP.findCard(CHAT.runId, name)||{});
const hint = ((card.fields||{}).core_traits||"");
const ran = await RP_TASKS.maybeRun(CHAT.runId, name, h, cfg,
function(c,ms,t){ return RP_NET.complete(c,ms,t); }, hint, id);
alert(ran.length ? "已运行: "+ran.join("、") : "未能运行 (检查提示词/聊天记录/网络)");
showATasks(name);
};


/* ================= 写卡助手 ================= */
window.showWriter = ()=>{
__backAction = null;
titleEl.textContent = "写卡助手";
subEl.textContent = "分步采访, 写出能直接开聊的角色卡";
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
const ss = RP_WRITER.listSessions();
const cs = RP_WRITER.getCustomChars();
view.innerHTML = `
<div class="card"><div class="secttl">✨ AI 生成角色</div>
<div class="kv">一句话描述你想要的角色, AI 一次生成整张卡: 名字、性格、开场白、示例对话、背景。不满意可换一批, 也可转手动微调。</div>
<div class="field"><label>Describe your character...（一句话描述）</label><textarea id="vibe_desc" rows="2" maxlength="200" placeholder="比如: 嘴硬心软的落魄书生, 表面清高实则渴望被需要" oninput="taCount('vibe_desc','vibe_desc_cnt',200)"></textarea><div class="kv" id="vibe_desc_cnt" style="text-align:right">0/200</div></div>
<div class="btnrow"><button class="btn" id="vibe_btn" onclick="vibeGen()">✨ 生成角色卡</button>
<button class="btn ghost" onclick="vibeToManual()">手动创建</button></div>
<div id="vibe_status" class="hint"></div>
<div id="vibe_preview"></div></div>
<div class="card"><div class="secttl">${icon("dice")} 一键生成角色卡</div>
<div class="kv">只填名字和一句话设定, 一次调用生成完整卡。可重试、可中断, 失败不影响现有流程。</div>
<div class="field"><label>名字</label><input id="qg_name" placeholder="如: 沈清辞"></div>
<div class="field"><label>一句话设定</label><textarea id="qg_premise" rows="2" maxlength="200" placeholder="如: 落魄书生, 表面清高, 说话刻薄但心软" oninput="taCount('qg_premise','qg_premise_cnt',200)"></textarea><div class="kv" id="qg_premise_cnt" style="text-align:right">0/200</div></div>
<div class="btnrow"><button class="btn" id="qg_btn" onclick="quickGenCard()">${icon("play")} 生成</button>
<button id="qg_cancel" style="display:none" onclick="quickGenAbort()">中断</button></div>
<div id="qg_status" class="hint"></div></div>
${ss.length?`<h2 class="sec">未完成的写卡 (${ss.length})</h2>`+ss.map(x=>`
<div class="card"><div class="row"><div><div class="name">${esc(RP_WRITER.STEPS[x.step].name)} · 进行中</div>
<div class="kv">${new Date(x.updatedAt).toLocaleString()} · ${x.history.length} 轮对话</div></div></div>
<div class="btnrow"><button class="btn" onclick="writerChat('${jq(x.id)}')">继续</button>
<button class="btn danger ghost" onclick="if(confirm('放弃这次写卡?')){RP_WRITER.delSession('${jq(x.id)}');showWriter();}">放弃</button></div></div>`).join(""):""}
<h2 class="sec">我的角色卡 (${cs.length})</h2>
${cs.length?`<div class="chargrid">`+cs.map(c=>charCardHTML({
name:c.name, tag:c.novel, sum:String((c.fields&&c.fields.core_identity)||"").slice(0,46)||"自创角色 · 点我直接开聊",
oncard:`chatWith('custom','${jq(c.name)}')`,
ops:`<button class="go" onclick="event.stopPropagation();chatWith('custom','${jq(c.name)}')">开聊</button>`
+`<button onclick="event.stopPropagation();editCard('custom','${jq(c.id)}')">编辑</button>`
+`<button onclick="event.stopPropagation();exportCard('${jq(c.id)}')">导出</button>`
+`<button class="danger" onclick="event.stopPropagation();if(confirm('删除这张角色卡?')){RP_WRITER.delCustom('${jq(c.id)}');showWriter();}">删</button>`
})).join("")+`</div>`:`<div class="empty"><span class="big">${icon("masks",44)}</span>还没有自创角色<br><span style="font-size:calc(12px * var(--fs))">点下面「新建写卡」，和 Ruby 一起创作</span></div>`}
<div class="btnrow"><button class="btn" onclick="newWriter()">${icon("plus")} 新建写卡</button></div>
<div class="hint">写卡全程走你在设置里配的大模型接口, 每步约 1-3 次调用。写完的角色可直接开聊, 也能配分析任务。</div>`;
};

/* ============ P1-3: 一键生成角色卡 ============ */
let QG_ABORT = null;
window.quickGenAbort = ()=>{ if(QG_ABORT){ QG_ABORT.aborted = true; } };
window.quickGenCard = async ()=>{
const cfg = getCfg();
if(!cfg.key || !cfg.base){ alert("先去「我的 · 设置」填 API 地址和 Key"); return; }
const get = (i)=>document.getElementById(i);
const name = get("qg_name").value.trim(), premise = get("qg_premise").value.trim();
if(!name){ alert("填个名字"); return; }
if(!premise){ alert("填一句话设定"); return; }
const btn = get("qg_btn"), cancel = get("qg_cancel"), status = get("qg_status");
const signal = {aborted:false}; QG_ABORT = signal;
btn.disabled = true; cancel.style.display = ""; status.textContent = "生成中…(可中断)";
try{
const parsed = await RP_WRITER.quickGen(name, premise, cfg,
function(c, ms, t){ return RP_NET.complete(c, ms, t); }, signal);
RP_WRITER.quickFinish(name, parsed);
achvUnlock("card_1");
QG_ABORT = null;
showWriter();
return;
}catch(e){
status.textContent = signal.aborted ? "已中断" : "生成失败: " + e.message + " (可重试)";
}
btn.disabled = false; cancel.style.display = "none"; QG_ABORT = null;
};

/* ============ VibeCreate 式"一句话生成角色" (对标 C.AI VibeCreate) ============ */
let VIBE_STATE = {desc: "", attempt: 0, card: null, busy: false};
const VIBE_PHASES = ["正在生成角色…", "正在构思性格…", "正在写开场白…", "正在润色卡片…"];
function vibePreviewHTML(card){
return `<div class="card" style="background:#fffdf7"><div class="name" style="font-size:calc(16px * var(--fs))">🎭 ${esc(card.name || "未命名")}</div>
<div class="kv">性格</div><div style="font-size:calc(13px * var(--fs));margin-bottom:6px">${esc(card.personality || "—")}</div>
<div class="kv">背景</div><div style="font-size:calc(13px * var(--fs));margin-bottom:6px">${esc(card.background || "—")}</div>
<div class="kv">开场白</div><div class="bub" style="font-size:calc(13px * var(--fs));margin-bottom:6px">${esc(card.greeting || "—")}</div>
<div class="kv">示例对话</div><div style="font-size:calc(12px * var(--fs));white-space:pre-wrap;color:#555">${esc(card.exampleDialogue || "—")}</div>
<div class="btnrow" style="margin-top:10px">
<button class="btn ghost" onclick="vibeGen(true)">🎲 换一批</button>
<button class="btn ghost" onclick="vibeToManual()">✏️ 手动微调</button>
<button class="btn" onclick="vibeSave()">${icon("save")} 保存角色卡</button>
</div></div>`;
}
window.vibeGen = async (shuffle)=>{
if(typeof RP_VIBE === "undefined"){ rpToast("模块未加载"); return; }
if(VIBE_STATE.busy) return;
const cfg = getCfg();
if(!cfg.key || !cfg.base){ alert("先去「我的 · 设置」填 API 地址和 Key"); return; }
const descEl = document.getElementById("vibe_desc");
const desc = shuffle ? VIBE_STATE.desc : (descEl ? descEl.value.trim() : "");
if(!desc){ rpToast("先用一句话描述你想要的角色"); return; }
if(shuffle) VIBE_STATE.attempt++;
else { VIBE_STATE.desc = desc; VIBE_STATE.attempt = 0; }
VIBE_STATE.busy = true;
const btn = document.getElementById("vibe_btn"), status = document.getElementById("vibe_status"),
  preview = document.getElementById("vibe_preview");
if(btn) btn.disabled = true;
let pi = 0;
if(status) status.textContent = VIBE_PHASES[0];
const timer = setInterval(()=>{ pi = Math.min(pi + 1, VIBE_PHASES.length - 1); if(status) status.textContent = VIBE_PHASES[pi]; }, 2500);
try{
const card = await RP_VIBE.generate(VIBE_STATE.desc, cfg,
  function(c, ms, t){ return RP_NET.complete(c, ms, t); }, VIBE_STATE.attempt);
clearInterval(timer);
VIBE_STATE.card = card;
if(status) status.textContent = "生成完成 ✅";
if(preview) preview.innerHTML = vibePreviewHTML(card);
}catch(e){
clearInterval(timer);
if(status) status.textContent = "";
/* 失败/解析失败: toast 提示, 不中断 (对标 "Failed to generate character (vibe-create)" + "Tap to retry") */
rpToast("生成失败, 点「生成角色卡」重试");
}
VIBE_STATE.busy = false;
if(btn) btn.disabled = false;
};
/* 手动微调: 存为草稿后转入现有写卡表单 (角色卡编辑器) */
window.vibeToManual = ()=>{
const card = VIBE_STATE.card;
if(!card){ rpToast("先生成一张卡, 或点「新建写卡」分步创作"); return; }
const id = vibeSave(true);
if(id) editCard("custom", id);
};
window.vibeSave = (silent)=>{
const card = VIBE_STATE.card;
if(!card){ rpToast("没有可保存的卡片"); return null; }
const fields = RP_VIBE.toCardFields(card);
const list = RP_WRITER.getCustomChars() || [];
const id = "c" + Date.now().toString(36);
list.unshift({id: id, name: card.name || "未命名", novel: "自定义", worldRunId: "",
  fields: fields,
  altGreetings: card.greeting ? [card.greeting] : [],
  exampleDialogue: card.exampleDialogue || "",
  createdAt: Date.now()});
RP_WRITER.saveCustomChars(list);
try{ achvUnlock("card_1"); }catch(e){}
VIBE_STATE.card = null;
if(!silent){ rpToast("已保存"); showWriter(); }
return id;
};

/* ============ P1-2: 角色卡编辑器(自创卡/导入卡通用) ============ */
window.editCard = (src, id)=>{
const card = src==="custom"
? (RP_WRITER.getCustomChars()||[]).find(c=>c.id===id)
: RP_CARDIMPORT.findById(id);
if(!card){ alert("卡片不存在"); return; }
__backAction = ()=>{ src==="custom" ? showWriter() : showTraverse(); };
titleEl.textContent = "编辑角色卡";
subEl.textContent = esc(card.name) + (src==="custom"?" · 自创卡":" · 导入卡");
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
const f = card.fields || {};
const aiFilled = (card.aiFilled && typeof card.aiFilled === "object") ? card.aiFilled : {};
const rows = Object.keys(RP_PROMPT.LABELS).map(k=>{
const v = f[k]==null?"":String(f[k]);
/* 功能一: AI 补完的字段打来源标注 */
const aiBadge = aiFilled[k] ? ` <span class="badge">AI 补完</span>` : "";
return `<div class="field"><label>${esc(RP_PROMPT.LABELS[k])}${aiBadge} <span class="dim">${esc(k)}</span></label>`
+ `<textarea id="cef_${k}" rows="2" oninput="tokCount('cef_${k}','ce_tok')">${esc(v)}</textarea></div>`;
}).join("");
const alt = (card.altGreetings||[]).join("\n");
const exd = card.exampleDialogue||"";
/* P0 卡兼容: 导入卡的 ST 一等字段可视可改 (system_prompt/post_history_instructions/creator_notes/scenario) */
const sysp = card.systemPrompt||"";
const phi = card.postHistoryInstructions||"";
const cnote = card.creatorNotes||"";
const scen = card.scenario||"";
/* S-5/S-6/S-9: 文风档/温度/行为标签 */
const flairOpts = `<option value="">默认（跟全局）</option>` + Object.keys(RP_PROMPT.FLAIR).map(k=>
`<option value="${k}"${card.flair===k?" selected":""}>${esc(RP_PROMPT.FLAIR[k].name)} · ${esc(RP_PROMPT.FLAIR[k].desc)}</option>`).join("");
const temp = (card.temperature != null && isFinite(+card.temperature)) ? +card.temperature : "";
const tagsIn = (card.tags||[]).join(",");
view.innerHTML = `
<div class="hint">修改后点「保存」写回, prompt 注入、开场白、导出都用新内容。<span id="ce_tok" class="dim"></span></div>
<div class="setcard"><div class="secttl">角色模板 · 一键填充</div>
<div class="btnrow">${RP_WRITER.CARD_TEMPLATES.map(t=>`<button class="btn ghost" onclick="fillCardTemplate('${jq(t.id)}')">${esc(t.name)}<span class="dim"> · ${esc(t.desc)}</span></button>`).join("")}</div>
<div class="hint">填充会覆盖当前表单内容（清空重写），请先确认。</div></div>
<div class="setcard">
<div class="field"><label>名字</label><input id="ce_name" value="${esc(card.name)}"></div>
<div class="field"><label>多开场白 <span class="dim">alternate_greetings · 每行一条, 开聊固定用首条(first_mes)</span></label>
<textarea id="ce_alt" rows="3" oninput="tokCount('ce_alt','ce_tok')">${esc(alt)}</textarea></div>
<div class="field"><label>示例对话 <span class="dim">extensions.example_dialogue · 进 prompt 的 few-shot</span></label>
<textarea id="ce_exd" rows="4" oninput="tokCount('ce_exd','ce_tok')">${esc(exd)}</textarea></div>
<div class="field"><label>系统提示词 <span class="dim">system_prompt · 进 system 开头</span></label>
<textarea id="ce_sysp" rows="4" oninput="tokCount('ce_sysp','ce_tok')">${esc(sysp)}</textarea></div>
<div class="field"><label>历史后指令 <span class="dim">post_history_instructions · 历史之后、生成之前</span></label>
<textarea id="ce_phi" rows="3" oninput="tokCount('ce_phi','ce_tok')">${esc(phi)}</textarea></div>
<div class="field"><label>作者注 <span class="dim">creator_notes · 进 system</span></label>
<textarea id="ce_cnote" rows="2" oninput="tokCount('ce_cnote','ce_tok')">${esc(cnote)}</textarea></div>
<div class="field"><label>场景设定 <span class="dim">scenario · 进【背景】段</span></label>
<textarea id="ce_scen" rows="3" oninput="tokCount('ce_scen','ce_tok')">${esc(scen)}</textarea></div>
<div class="field"><label>文风档 <span class="dim">flair · 角色级文风，覆盖全局预设</span></label>
<select id="ce_flair">${flairOpts}</select></div>
<div class="field"><label>温度 <span class="dim">temperature · 0.6~1.8，空=用全局</span></label>
<input id="ce_temp" type="number" min="0.6" max="1.8" step="0.05" value="${esc(temp)}" placeholder="如 0.95"></div>
${typeof RP_SOUL_CFG!=="undefined" ? RP_SOUL_CFG.bindSelectHTML(card) : ""}
<div class="field"><label>行为标签 <span class="dim">tags · 逗号分隔，如 傲娇,毒舌 · 进 system</span></label>
<input id="ce_tags" value="${esc(tagsIn)}"></div>
</div>
<div class="setcard"><div class="secttl">角色字段</div>${rows}</div>
<div class="btnrow"><button class="btn" onclick="saveCardEdit('${jq(src)}','${jq(id)}')">${icon("save")} 保存</button>
<button onclick="__backAction()">取消</button></div>`;
};
/* Tier2 #17: 角色卡模板一键填充 (对标 C.AI CreateCharacter definition-template)。
 * 数组字段按行展开；覆盖前 confirm。 */
window.fillCardTemplate = (tid)=>{
const t = (RP_WRITER.CARD_TEMPLATES||[]).find(x=>x.id===tid);
if(!t) return;
if(!confirm(`用「${t.name}」模板填充？\n当前表单内容会被覆盖。`)) return;
Object.keys(RP_PROMPT.LABELS).forEach(k=>{
const ta = document.getElementById("cef_"+k);
if(!ta) return;
let v = (t.fields && t.fields[k] != null) ? t.fields[k] : "";
if(Array.isArray(v)) v = v.join("\n");
ta.value = String(v);
});
tokCount("ce_name","ce_tok");
};
window.saveCardEdit = (src, id)=>{
const get = (i)=>document.getElementById(i);
const name = get("ce_name").value.trim() || "未命名";
const f = {};
Object.keys(RP_PROMPT.LABELS).forEach(k=>{
const v = get("cef_"+k).value.trim();
if(v) f[k] = v;
});
const alt = get("ce_alt").value.split("\n").map(s=>s.trim()).filter(Boolean).slice(0,8);
const exd = get("ce_exd").value.trim();
const sysp = get("ce_sysp").value.trim();
const phi = get("ce_phi").value.trim();
const cnote = get("ce_cnote").value.trim();
const scen = get("ce_scen").value.trim();
const flair = get("ce_flair").value.trim();
const tempRaw = get("ce_temp").value.trim();
const temp = tempRaw === "" ? null : Math.max(0.6, Math.min(1.8, +tempRaw || 0.9));
const tags = get("ce_tags").value.split(/[,，、]/).map(s=>s.trim()).filter(Boolean).slice(0,12);
if(src==="custom"){
const list = RP_WRITER.getCustomChars()||[];
const i = list.findIndex(c=>c.id===id);
if(i<0){ alert("卡片不存在"); return; }
list[i] = Object.assign({}, list[i], {name, fields:f, altGreetings:alt, exampleDialogue:exd,
systemPrompt:sysp, postHistoryInstructions:phi, creatorNotes:cnote, scenario:scen,
flair:flair||"", temperature:temp, tags:tags});
/* Soul 模型绑定 */
try{
  if(typeof RP_SOUL!=="undefined" && typeof RP_SOUL_CFG!=="undefined"){
    RP_SOUL.bindProfile(list[i], RP_SOUL_CFG.readBindSelect());
  }
}catch(e){}
RP_WRITER.saveCustomChars(list);
}else{
const c = RP_CARDIMPORT.findById(id);
if(!c){ alert("卡片不存在"); return; }
/* 功能一: 保留 AI 补完来源标注(字段被清空则去掉标注) */
const keepAi = {};
Object.keys((c.aiFilled||{})).forEach(k=>{ if(f[k] && String(f[k]).trim()) keepAi[k] = true; });
RP_CARDIMPORT.update(Object.assign({}, c, {name, fields:f, altGreetings:alt, exampleDialogue:exd,
systemPrompt:sysp, postHistoryInstructions:phi, creatorNotes:cnote, scenario:scen,
flair:flair||"", temperature:temp, tags:tags, aiFilled:keepAi}));
/* Soul 模型绑定 (导入卡) */
try{
  if(typeof RP_SOUL!=="undefined" && typeof RP_SOUL_CFG!=="undefined"){
    var _uc = RP_CARDIMPORT.findById(id);
    if(_uc){ RP_SOUL.bindProfile(_uc, RP_SOUL_CFG.readBindSelect()); RP_CARDIMPORT.update(_uc); }
  }
}catch(e){}
}
alert("已保存");
if(src==="custom") showWriter(); else showTraverse();
};
window.newWriter = ()=>{
__backAction = ()=>showWriter();
const runs = (window.__DATA__.index||[]).map(r=>`<option value="${r.run_id}">${esc(r.novel)}</option>`).join("");
titleEl.textContent = "新建写卡";
subEl.textContent = "";
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
view.innerHTML = `<div class="setcard">
<div class="field"><label>世界观 (可选, 绑定后聊天时可调用该小说的世界书)</label>
<select id="w_world"><option value="">不绑定</option>${runs}</select></div>
<div class="btnrow"><button class="btn" onclick="startWriter()">开始采访</button>
<button class="btn ghost" onclick="showWriter()">返回</button></div></div>`;
};
window.startWriter = ()=>{
const s = RP_WRITER.newSession($("#w_world").value);
writerChat(s.id);
};
window.writerChat = (id)=>{
__backAction = ()=>showWriter();
const s = RP_WRITER.getSession(id);
if(!s){ showWriter(); return; }
const st = RP_WRITER.STEPS[s.step];
titleEl.textContent = "写卡 · " + st.name;
subEl.textContent = st.desc;
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
const log = s.history.map(m=>`<div class="msg ${m.role==="user"?"me":"ai"}"><div class="bub">${esc(m.content).replace(/\n/g,"<br>")}</div></div>`).join("");
view.innerHTML = `
<div class="hint">第 ${s.step+1}/5 步 · ${esc(st.name)}: ${esc(st.desc)}</div>
<div id="wlog">${log || `<div class="empty">Ruby 正在组织语言…</div>`}</div>
<div class="chatbar"><input id="w_in" placeholder="和 Ruby 聊聊…" onkeydown="if(event.key==='Enter')sendWriterMsg('${jq(id)}')" oninput="tokCount('w_in','w_tok')">
<button onclick="sendWriterMsg('${jq(id)}')">发送</button></div>
<div class="tokline" id="w_tok" style="padding:0 14px"></div>
<div class="btnrow" style="margin-top:8px">
${s.step<3?`<button class="btn" onclick="finalizeStep('${jq(id)}')">✅ 定稿, 进入下一步</button>`:""}
${s.step===3?`<button class="btn" onclick="genCardUI('${jq(id)}')">🎴 生成人设卡</button>`:""}
${s.step===4?`<button class="btn" onclick="finishWriterUI('${jq(id)}')">${icon("save")} 保存角色卡</button>`:""}
<button class="btn ghost" onclick="showWriter()">稍后继续</button></div>
<div id="wsum"></div>`;
if(!s.history.length){
const cfg = getCfg();
if(!cfg.key){ document.getElementById("wlog").innerHTML = `<div class="empty">先去「我的 · 设置」配好 API 才能采访。</div>`; return; }
RP_NET.complete(cfg, [{role:"system", content: RP_WRITER.interviewPrompt(s.step, s)},
{role:"user", content:"开始吧, 先跟我打个招呼, 然后开始这一步的采访。"}], 0.8)
.then(t=>{ const s2 = RP_WRITER.getSession(id); if(!s2||s2.history.length) return;
s2.history.push({role:"assistant", content:t}); RP_WRITER.saveSession(s2); writerChat(id); })
.catch(e=>{ document.getElementById("wlog").innerHTML = `<div class="empty">请求失败: ${esc(e.message)}</div>`; });
}
};
window.sendWriterMsg = async (id)=>{
const inp = $("#w_in"); const text = inp.value.trim(); if(!text) return;
const cfg = getCfg(); if(!cfg.key){ alert("先去设置里配 API"); return; }
const s = RP_WRITER.getSession(id); if(!s) return;
s.history.push({role:"user", content:text}); RP_WRITER.saveSession(s); writerChat(id);
try{
const t = await RP_NET.complete(cfg,
[{role:"system", content: RP_WRITER.interviewPrompt(s.step, s)}]
.concat(s.history.map(m=>({role:m.role, content:m.content}))), 0.8);
const s2 = RP_WRITER.getSession(id); s2.history.push({role:"assistant", content:t}); RP_WRITER.saveSession(s2);
writerChat(id);
}catch(e){ alert("请求失败: "+e.message); }
};
window.finalizeStep = async (id)=>{
const cfg = getCfg(); if(!cfg.key){ alert("先去设置里配 API"); return; }
const s = RP_WRITER.getSession(id); if(!s||!s.history.length){ alert("先聊几句再定稿"); return; }
if(!confirm("把本步采访定稿, 进入下一步?")) return;
try{
const sum = await RP_WRITER.summarize(RP_WRITER.STEPS[s.step].id, s.history, cfg,
function(c,ms,t){ return RP_NET.complete(c,ms,t); });
s.summaries[RP_WRITER.STEPS[s.step].id] = sum;
s.step = Math.min(s.step+1, 4); s.history = [];
RP_WRITER.saveSession(s);
alert("定稿已保存 ✅\n\n"+sum.slice(0,300));
writerChat(id);
}catch(e){ alert("定稿失败: "+e.message); }
};
window.genCardUI = async (id)=>{
const cfg = getCfg(); if(!cfg.key){ alert("先去设置里配 API"); return; }
if(!confirm("根据前三步定稿生成完整人设卡? (约 1 次调用)")) return;
try{
const s = RP_WRITER.getSession(id);
const fields = await RP_WRITER.genCard(s, cfg, function(c,ms,t){ return RP_NET.complete(c,ms,t); });
s.card = fields; s.step = 4; s.history = [];
RP_WRITER.saveSession(s);
writerChat(id);
alert("人设卡已生成, 进自检前先看一眼, 下一步可清洗。");
}catch(e){ alert("生成失败: "+e.message); }
};
window.finishWriterUI = async (id)=>{
const s = RP_WRITER.getSession(id); if(!s||!s.card){ alert("卡片还没生成"); return; }
const cfg = getCfg();
const keys = Object.keys(s.card);
const preview = keys.map(k=>"- "+k+": "+String(s.card[k]).slice(0,80)).join("\n");
if(!confirm("先自检清洗一遍? (推荐, 约 1 次调用)\n\n"+preview.slice(0,400))){
return saveWriterChar(id);
}
try{
s.card = await RP_WRITER.selfCheck(s.card, cfg, function(c,ms,t){ return RP_NET.complete(c,ms,t); });
RP_WRITER.saveSession(s);
alert("自检完成 ✅");
}catch(e){ alert("自检失败, 用原卡继续: "+e.message); }
saveWriterChar(id);
};
function saveWriterChar(id){
const s = RP_WRITER.getSession(id); if(!s) return;
const name = prompt("给这个角色起个名字:", "");
if(!name||!name.trim()) return;
const novel = prompt("故事/世界名 (显示用):", "自定义");
try{
RP_WRITER.finish(id, name.trim(), (novel||"自定义").trim());
chatWith("custom", name.trim());
}catch(e){ alert("保存失败: "+e.message); }
}

/* ============ P0-4 新手引导 (localStorage.nd_onboarded) ============ */
window.showOnboard = (step)=>{
step = Math.min(Math.max(step||1, 1), 3);
let ob = document.getElementById("onboard");
if(!ob){
ob = document.createElement("div");
ob.id = "onboard"; ob.className = "onboard";
document.body.appendChild(ob);
}
const S = [
{ t:"第 1 步 · 配置 API Key",
d:"去「我的 · 设置」填入你的 LLM Key<br>(OpenAI 兼容接口均可, 如硅基流动 / DeepSeek)。",
btns:[["去设置配 Key","onboardDone();setNav('settings')"],["下一步 →","showOnboard(2)"]] },
{ t:"第 2 步 · 选一个角色",
d:"从蒸馏人物里选一位开聊,<br>或自己写一张原创角色卡。",
btns:[["去选角色","onboardDone();setNav('chat')"],["自己写卡","onboardDone();setNav('writer')"],["下一步 →","showOnboard(3)"]] },
{ t:"第 3 步 · 开始聊天",
d:"一切就绪 —— 点开一位角色,<br>开始你的第一场对话吧！",
btns:[["开始聊天","onboardDone();setNav('chat')"]] },
];
const s = S[step-1];
ob.innerHTML = `<div class="obcard">
<div class="obdots">${[1,2,3].map(i=>`<span class="${i===step?"on":""}"></span>`).join("")}</div>
<h2>${s.t}</h2><p>${s.d}</p>
<div class="btnrow">${s.btns.map(b=>`<button class="btn" onclick="${b[1]}">${b[0]}</button>`).join("")}</div>
<button class="obskip" onclick="onboardDone()">跳过引导</button>
</div>`;
ob.classList.add("on");
};
window.onboardDone = ()=>{
try{ localStorage.setItem("nd_onboarded", "1"); }catch(e){}
const ob = document.getElementById("onboard");
if(ob) ob.classList.remove("on");
};

/* ---------- 启动 ---------- */
window.setNav = setNav; window.showTasks = showTasks; window.showChat = showChat;
window.setTab = setTab; window.openRun = openRun;
(async function startApp(){
if(typeof RP_PIN!=="undefined" && RP_PIN.has()){
await pinUnlockScreen(); /* P1-7: PIN 未验证通过前不进主界面 */
}
await boot();
/* P2: 应用壁纸/字体；后台把大文件复制到 IndexedDB（复制模式：localStorage 副本保留，同步读取不受影响；失败自动回退 localStorage） */
try{ applyAppearance(); }catch(e){}
try{ if(typeof RP_STORE!=="undefined"){ RP_STORE.warmCache().catch(()=>{}); RP_STORE.migrate().catch(()=>{}); } }catch(e){}
/* 存储配额：向系统申请持久化存储，避免大文件被自动清理；超大文件走原生文件层（2GB，App 私有目录） */
try{ if(typeof navigator!=="undefined" && navigator.storage && typeof navigator.storage.persist==="function"){ navigator.storage.persist().catch(()=>{}); } }catch(e){}
/* Tier3-24: 冷启动也算一次"回到前台"，检查是否需要角色召回本地通知 */
try{ maybeRecallNotify(); }catch(e){}
if(!localStorage.getItem("nd_onboarded")) showOnboard(1);
})();

/* ================= 穿越 P0: 魂穿 / 肉身穿越 ================= */
function travPlayerName(){
  if(CHAT.mode === "traverse"){
    const trav = RP_TRAVERSE.get(CHAT.travId);
    if(trav){
      if(trav.mode === "plotline") return "旅人";
      if(trav.mode === "soul" || trav.mode === "isekai" || trav.mode === "party") return trav.charName || "我";
      const idt = RP_TRAVERSE.getIdentity(trav.identityId);
      return (idt && idt.name) || "我";
    }
  }
  return "我";
}
function travWorlds(){
  const out = [];
  (INDEX || []).forEach(r=>out.push({kind:"book", id:r.run_id,
    name:"《"+r.novel+"》", sub:"蒸馏世界 · "+r.run_id}));
  try{ RP_CARDIMPORT.list().forEach(c=>out.push({kind:"card", id:c.id,
    name:"《"+c.name+"》的世界", sub:"导入角色卡"})); }catch(e){}
  return out;
}
function showTraverse(){
/* 穿越家族（魂穿/走原著线/黄金路径/组团）都会读 runs：进穿越页先拉全量 */
if(guardAllRuns(function(){ showTraverse(); })) return;
__backAction = null;
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("book-open")+" 穿越"; subEl.textContent = "进入书里活";
  const hintTimeline = `<div class="hint" style="margin:0 0 10px">🕰️ 穿越是独立的时间线：这里发生的事，不会影响「聊天」里的对话和记忆。</div>`;
  const modes = [
    {id:"plotline", ic:"clapperboard", name:"走原著线", desc:"沿导演因果蓝图推进剧情，在决策点做选择", ok:true, seal:"迹"},
    {id:"soul", ic:"user", name:"魂穿", desc:"成为TA：扮演原著角色，走进TA的人生", ok:true, seal:"魂"},
    {id:"body", ic:"users", name:"肉身穿越", desc:"成为自己：现代人直穿，或捏一个古代身份", ok:true, seal:"身"},
    {id:"isekai", ic:"repeat", name:"异世界穿越", desc:"把角色送进另一部作品（林黛玉去水浒）", ok:true, seal:"异"},
    {id:"party", ic:"chat", name:"组团穿越", desc:"和多名角色组队一起穿", ok:true, seal:"众"},
  ];
  const recents = RP_TRAVERSE.recent();
  view.innerHTML = `
  <div class="golden-hero" onclick="goldenPickBook()">
    <div><div class="gh-title">✨ 一键魂穿开局</div>
    <div class="gh-desc">选书 → 选人 → 选开场，3 步直入原著因果线</div></div>
    <div class="tm-go">›</div>
  </div>
  ${hintTimeline}
  <div class="travmodes">${modes.map(m=>`
    <div class="travmode${m.ok?"":" locked"}" ${m.ok?`onclick="travMode('${jq(m.id)}')"`:""}>
      ${m.seal?`<div class="tm-seal" aria-hidden="true">${m.seal}</div>`:""}
      <div class="tm-icon">${icon(m.ic,26)}</div>
      <div class="tm-body"><div class="tm-name">${m.name}</div>
      <div class="tm-desc">${m.desc}</div></div>
      ${m.ok?`<div class="tm-go">›</div>`:`<div class="tm-desc">即将到来</div>`}
    </div>`).join("")}</div>
  <h2 class="sec">酒馆角色卡</h2>
  <div class="card"><div class="kv">把 SillyTavern 角色卡（PNG/JSON）导进来，也能穿进 TA 的世界</div>
  <div class="btnrow" style="margin-top:8px"><button class="btn" onclick="travImport()">${icon("upload")} 导入角色卡</button>
  <button class="btn ghost" onclick="travVisionPick()">🖼️ 看图写卡</button></div>
  <div class="hint">看图写卡：选一张没有内嵌卡片数据的图片，AI 识别图中人物并写成角色卡（一图多人会自动拆成多张）。需要 vision 模型。</div>
  <div id="impList" style="margin-top:8px">${importedListHTML()}</div></div>
  <h2 class="sec">最近穿越</h2>
  <div>${recents.length ? recents.map(travRecentHTML).join("") : `<div class="empty-illust"><img src="bg/empty_state.jpg" alt=""><div>还没有穿越过，从上面选一种模式开始吧</div></div>`}</div>
  <input type="file" id="travFile" accept=".png,.json" style="display:none" onchange="travImportFile(this)">
  <input type="file" id="travVisionFile" accept="image/*" style="display:none" onchange="travVisionFile(this)">`;
  window.scrollTo(0,0);
}
function importedListHTML(){
  let list = [];
  try{ list = RP_CARDIMPORT.list(); }catch(e){}
  if(!list.length) return `<div class="meta">还没有导入过角色卡</div>`;
  return list.map(c=>`<div class="kvline" style="display:flex;align-items:center;gap:8px"><span>${esc(c.name)}</span>
  <span class="meta"> ${esc(c.novel)}</span><span style="flex:1"></span>
  <button class="btn ghost sm" onclick="event.stopPropagation();editCard('imported','${jq(c.id)}')">编辑</button>
  <button class="btn ghost sm" onclick="event.stopPropagation();travDelImport('${jq(c.id)}')">删除</button></div>`).join("");
}
function travRecentHTML(t){
  const who = t.mode==="plotline" ? "旅人" : t.mode==="soul" ? t.charName : ((RP_TRAVERSE.getIdentity(t.identityId)||{}).name || "无名氏");
  const d = new Date(t.updatedAt).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
  return `<div class="card card--tap" onclick="travResume('${jq(t.id)}')">
  <div class="row"><div class="avatar">${esc(who[0]||"穿")}</div>
  <div><div class="name">${esc(who)} <span class="badge">${RP_TRAVERSE.MODES[t.mode]||""}</span></div>
  <div class="meta">${esc(t.worldName)} · ${esc(t.anchorTitle||"")} · ${d}</div></div></div></div>`;
}
window.travMode = (m)=>{
  if(m==="soul") soulPickTarget();
  else if(m==="body") bodyPickWorld();
  else if(m==="isekai") isekaiPickSrc();
  else if(m==="party") partySetup();
  else if(m==="plotline") plotlinePickBook();
};
/* 走原著线：选书 → 选幕（断点续玩）→ 开局 */
/* 导入卡也走原著线：导入卡没有蒸馏世界卡(worldcard)，所以选书页补一节 RP_CARDIMPORT。
   有世界补完(AI)的卡才列得出幕 —— 点进选幕；没补完的卡点进去先补完，不假装它有原著线。 */
/* 从选书页进的补完页，返回键/返回按钮要回选书页，不是穿越首页 */
let PLOTLINE_WB_BACK = false;
function plotlineCardBible(id){ try{ return JSON.parse(localStorage.getItem("nd_wb2_card_"+id) || "null"); }catch(e){ return null; } }
/* 剧情锚点 → 幕。补完时锚点不足会留"（待补完）"占位，那是占位不是内容，不当幕渲染 */
function plotlineCardAnchors(bible){
  const raw = (bible && Array.isArray(bible.anchors)) ? bible.anchors : [];
  return raw.map(s=>String(s==null?"":s).trim()).filter(s=>s && s!=="（待补完）");
}
/* v41: 锚点「标题：概要」→ {title, synopsis}；分隔符前的标题限 24 字，避免把正文里的冒号误当分隔 */
function plotlineSplitAnchor(a){
  const str = String(a==null?"":a).trim();
  const m = str.match(/^(.{1,24}?)\s*(?:[：:]|——|—|--|\s-\s)\s*(.+)$/);
  if(m && m[2].trim() && !(/\d$/.test(m[1]) && /^\d/.test(m[2]))) return {title:m[1].trim(), synopsis:m[2].trim()};
  return {title:str, synopsis:""};
}
function plotlinePickBook(){
  const idx = (window.__DATA__ && window.__DATA__.index) || [];
  const runs = idx.filter(r => r.has_worldcard);
  PLOTLINE_WB_BACK = false;
  const cards = (typeof RP_CARDIMPORT!=="undefined") ? RP_CARDIMPORT.list() : [];
  const cardSec = cards.length ? `<h2 class="sec">导入卡</h2>` + cards.map(c=>{
    const done = !!plotlineCardBible(c.id);
    const inner = `<div class="row"><div><div class="name">${esc(c.name||c.id)}</div>
      <div class="meta">角色卡 · <span class="badge">${done?"导入卡·已补完":"导入卡·待补完"}</span></div></div><div class="tm-go">›</div></div></div>`;
    /* onclick 整段分支写死：动态值只在 jq() 里, 不把整条 handler 插进属性 */
    return done ? `<div class="card card--tap" onclick="plotlinePickCardStage('${jq(c.id)}')">${inner}</div>`
                : `<div class="card card--tap" onclick="PLOTLINE_WB_BACK=true;travWorldComplete('card','${jq(c.id)}')">${inner}</div>`;
  }).join("") : "";
  titleEl.innerHTML = icon("clapperboard")+" 走原著线"; subEl.textContent = "选一本书，沿原著因果线推进";
  view.innerHTML = `<button class="back" onclick="showTraverse()">‹ 返回穿越</button>`
    + (runs.length ? runs.map(r=>`<div class="card card--tap" onclick="plotlinePickStage('${jq(r.run_id)}')">
      <div class="name">${esc(r.novel)}</div><div class="meta">${esc(r.run_id)} · <span class="badge">有世界卡</span></div></div>`).join("")
      : `<div class="empty">暂无带世界卡的书<br><span style="font-size:calc(12px * var(--fs))">管线执行 worldcard 阶段后自动出现</span></div>`)
    + cardSec;
  window.scrollTo(0,0);
}
function plotlinePickStage(runId){
  titleEl.innerHTML = icon("clapperboard")+" 走原著线"; subEl.textContent = "选一幕";
  view.innerHTML = skeletonHTML(4);
  loadWorldcard(runId).then(()=>{
    const stages = (typeof RP_PLOTRUN!=="undefined") ? RP_PLOTRUN.listStages(runId) : [];
    view.innerHTML = `<button class="back" onclick="plotlinePickBook()">‹ 返回选书</button>`
      + `<h2 class="sec">选一幕 · ${stages.length} 幕</h2>`
      + (stages.length ? stages.map(s=>`<div class="card card--tap" onclick="plotlineStart('${jq(runId)}','${jq(s.id)}','${jq(s.plotrunId||"")}')">
        <div class="row"><div><div class="name">${esc(s.title)}</div>
        <div class="meta">${s.done}/${s.total} 节点（${s.pct}%）${s.finished?' · <span class="badge">已走完</span>':(s.resumable?' · <span class="badge">继续</span>':"")}</div>
        ${s.description?`<div class="st">${esc(s.description)}</div>`:""}</div><div class="tm-go">›</div></div></div>`).join("")
        : `<div class="empty">该书暂无导演分幕数据</div>`);
    window.scrollTo(0,0);
  });
}
function plotlineStart(runId, stageId, plotrunId){
  let st = plotrunId ? RP_PLOTRUN.load(plotrunId) : null;
  if(!st) st = RP_PLOTRUN.start(runId, stageId);
  const idx = (window.__DATA__ && window.__DATA__.index) || [];
  const r = idx.find(x=>x.run_id===runId) || {};
  const sess = RP_TRAVERSE.newSession({mode:"plotline", worldKind:"book", worldId:runId,
    worldName:r.novel||runId, charName:"", anchorTitle:"走原著线", plotrunId:st.id});
  CHAT = {mode:"traverse", travId:sess.id};
  setNav("chat");
}
/* 导入卡·选幕：AI 补完出来的剧情锚点就是幕。锚点为空/全是占位时说实话 —— 不编造幕 */
function plotlinePickCardStage(cardId){
  const card = (typeof RP_CARDIMPORT!=="undefined") ? RP_CARDIMPORT.findById(cardId) : null;
  const nm = (card && card.name) || cardId;
  const bible = plotlineCardBible(cardId);
  const anchors = plotlineCardAnchors(bible);
  /* v41: 以前每张幕卡都贴同一段世界背景 bible.bg，看起来像复制粘贴。
     现在：背景只在列表顶上出现一次；每幕只显示它自己的概要 ——
     锚点写成「标题：概要」（中英文冒号/破折号）时拆出概要，纯标题就不硬凑。 */
  const desc = String((bible&&bible.bg)||"").trim();
  const descShort = desc.length > 90 ? desc.slice(0,90) + "…" : desc;
  titleEl.innerHTML = icon("clapperboard")+" 走原著线"; subEl.textContent = nm;
  view.innerHTML = `<button class="back" onclick="plotlinePickBook()">‹ 返回选书</button>`
    + (anchors.length ? `<h2 class="sec">选一幕 · ${anchors.length} 幕</h2>`
      + (descShort ? `<div class="hint" style="margin:0 2px 10px">《${esc(nm)}》的世界：${esc(descShort)}</div>` : "")
      + anchors.map((a,i)=>{ const sp = plotlineSplitAnchor(a);
        return `<div class="card card--tap" onclick="plotlineStartCard('${jq(cardId)}',${i})">
        <div class="row"><div><div class="name">${esc(sp.title)}</div>
        <div class="meta">第 ${i+1} 幕 · <span class="badge">AI 补完</span></div>
        ${sp.synopsis?`<div class="st">${esc(sp.synopsis)}</div>`:""}</div><div class="tm-go">›</div></div></div>`; }).join("")
      : `<div class="empty">这张卡还没有可走的幕<br><span style="font-size:calc(12px * var(--fs))">导入卡没有原著章节线，先「AI 补完世界」拿到剧情锚点才能走原著线</span>
        <div class="btnrow" style="margin-top:12px"><button class="btn" style="flex:1" onclick="PLOTLINE_WB_BACK=true;travWorldComplete('card','${jq(cardId)}')">${icon("scroll")} 去 AI 补完世界</button></div></div>`);
  window.scrollTo(0,0);
}
/* 导入卡·开局：与 plotlineStart 同尾，但没有 RP_PLOTRUN 剧情运行时（导入卡无原著节点） */
function plotlineStartCard(cardId, anchorIdx){
  const card = (typeof RP_CARDIMPORT!=="undefined") ? RP_CARDIMPORT.findById(cardId) : null;
  const anchors = plotlineCardAnchors(plotlineCardBible(cardId));
  const a = anchors[anchorIdx];
  if(!a) return;
  const sess = RP_TRAVERSE.newSession({mode:"plotline", worldKind:"card", worldId:cardId,
    worldName:"《"+((card&&card.name)||cardId)+"》的世界", charName:"", anchorTitle:a});
  CHAT = {mode:"traverse", travId:sess.id};
  setNav("chat");
}
/* ============ 方向三：黄金路径 · 一键魂穿开局 ============
 * 3 屏：选书 → 选人+导演风格 → 选开场（沉浸式），直入 plotrun 剧情运行时。 */
function goldenPickBook(){
  const idx = (window.__DATA__ && window.__DATA__.index) || [];
  const runs = idx.filter(r => r.has_worldcard);
  let resumable = {};
  try{ (RP_PLOTRUN.allStates()||[]).forEach(s=>{ resumable[s.runId] = true; }); }catch(e){}
  titleEl.innerHTML = "✨ 一键魂穿开局"; subEl.textContent = "3 步进入原著因果线";
  view.innerHTML = `<button class="back" onclick="showTraverse()">‹ 返回穿越</button>
  <div class="hint" style="margin:8px 2px">选一本书 → 选魂穿人物与导演风格 → 选开场，直入原著剧情线</div>`
    + (runs.length ? runs.map((r,i)=>{
      const cover = (window.BOOKCOVER||{})[r.novel];
      return `<div class="card card--tap" onclick="goldenPickChar(${jq(i)})">
      <div class="row">${cover?`<img class="bookcover gbk" src="${esc(cover)}" alt="${esc(r.novel)}封面" loading="lazy" onerror="this.remove()">`:""}<div><div class="name">《${esc(r.novel)}》</div>
      <div class="meta">${esc(r.run_id)}${resumable[r.run_id]?' · <span class="badge">可继续</span>':""}</div>
      </div><div class="tm-go" style="margin-left:auto">›</div></div></div>`;}).join("")
      : `<div class="empty">暂无带世界卡的书<br><span style="font-size:calc(12px * var(--fs))">管线执行 worldcard 阶段后自动出现</span></div>`);
  window._goldenRuns = runs;
  window.scrollTo(0,0);
}
window.goldenPickChar = (i)=>{
  const r = (window._goldenRuns||[])[i]; if(!r) return;
  const run = ((window.__DATA__||{}).runs||{})[r.run_id] || {};
  const chars = (run.characters && run.characters.length ? run.characters : (r.characters||[])).slice(0, 24);
  window._golden = {bookIdx:i, runId:r.run_id, novel:r.novel, chars:chars, charIdx:-1, style:"slowburn", openingIdx:0};
  const styles = (typeof RP_DIRECTOR!=="undefined" && RP_DIRECTOR.STYLES) ? RP_DIRECTOR.STYLES : {slowburn:{name:"慢热",desc:""}};
  window._goldenStyles = Object.keys(styles);
  titleEl.innerHTML = "✨ 一键魂穿开局"; subEl.textContent = "第 2 步 · 选人与风格";
  view.innerHTML = `<button class="back" onclick="goldenPickBook()">‹ 返回选书</button>
  <h2 class="sec">魂穿成谁？《${esc(r.novel)}》</h2>
  <div class="gchars">
    <div class="gchip sel" data-ci="-1" onclick="goldenSetChar(-1)">路人</div>
    ${chars.map((c,ci)=>`<div class="gchip" data-ci="${ci}" onclick="goldenSetChar(${jq(ci)})">${esc(c)}</div>`).join("")}
  </div>
  <h2 class="sec">导演风格</h2>
  <div class="gstyles">${Object.keys(styles).map((k,si)=>`
    <div class="gstyle${k==="slowburn"?" sel":""}" data-si="${si}" onclick="goldenSetStyle(${jq(si)})">
      <div class="name">${esc(styles[k].name)}</div><div class="st">${esc(styles[k].desc||"")}</div>
    </div>`).join("")}</div>
  <div class="btnrow" style="margin-top:14px"><button class="btn primary" onclick="goldenOpening()">下一步 · 选开场 ›</button></div>`;
  window.scrollTo(0,0);
};
window.goldenSetChar = (ci)=>{
  const g = window._golden; if(!g) return; g.charIdx = ci;
  document.querySelectorAll(".gchip").forEach(el=>el.classList.toggle("sel", +el.dataset.ci===ci));
};
window.goldenSetStyle = (si)=>{
  const g = window._golden; if(!g) return;
  g.style = (window._goldenStyles||[])[si] || g.style;
  document.querySelectorAll(".gstyle").forEach(el=>el.classList.toggle("sel", +el.dataset.si===si));
};
window.goldenOpening = ()=>{
  const g = window._golden; if(!g) return;
  titleEl.innerHTML = "✨ 一键魂穿开局"; subEl.textContent = "第 3 步 · 选开场";
  view.innerHTML = skeletonHTML(3);
  window.scrollTo(0,0);
  loadWorldcard(g.runId).then(()=>{
    const charName = g.charIdx >= 0 ? g.chars[g.charIdx] : "";
    let ops = [];
    try{ ops = cardOpenings(g.runId, charName) || []; }catch(e){}
    if(!ops.length && g.chars.length){ try{ ops = cardOpenings(g.runId, g.chars[0]) || []; }catch(e){} }
    g.ops = ops.slice(0, 6);
    let anchors = [], stageTitle = "", stageTotal = 0;
    try{
      const wc = getWorldcard(g.runId);
      const dd = wc && wc.directorDefinitions && wc.directorDefinitions[0];
      anchors = (dd && dd.anchors || []).slice(0, 6);
      const stages = RP_PLOTRUN.listStages(g.runId);
      if(stages.length){ stageTitle = stages[0].title; stageTotal = stages[0].total; }
    }catch(e){}
    const styleName = ((typeof RP_DIRECTOR!=="undefined" && RP_DIRECTOR.STYLES && RP_DIRECTOR.STYLES[g.style]) || {}).name || g.style;
    view.innerHTML = `<div class="gopening">
      <button class="back" onclick="goldenPickChar(${jq(g.bookIdx)})">‹ 返回</button>
      <div class="go-kicker">《${esc(g.novel)}》 · ${charName ? "魂穿"+esc(charName) : "路人开局"} · ${esc(styleName)}</div>
      ${anchors.length ? `<div class="go-anchors">${anchors.map(a=>`<span class="badge">${esc(String(a).slice(0,18))}</span>`).join("")}</div>` : ""}
      <h2 class="sec" style="color:var(--ink);border:none">选一个开场</h2>
      <div class="go-ops">${g.ops.length ? g.ops.map((o,oi)=>`
        <div class="go-op${oi===0?" sel":""}" data-oi="${oi}" onclick="goldenSetOpening(${jq(oi)})">
          ${o.label?`<span class="badge">${esc(o.label)}</span>`:""}
          <div class="go-text">${esc(String(o.text||"").slice(0,160))}${String(o.text||"").length>160?"…":""}</div>
        </div>`).join("") : `<div class="empty">暂无管线开场白，将由 AI 现场生成</div>`}</div>
      ${stageTitle?`<div class="go-stage">📜 第一幕 · ${esc(stageTitle)}（${stageTotal} 节点）</div>`:""}
      <button class="go-enter" onclick="goldenStart()">进入原著线 →</button>
    </div>`;
    window.scrollTo(0,0);
  });
};
window.goldenSetOpening = (oi)=>{
  const g = window._golden; if(!g) return; g.openingIdx = oi;
  document.querySelectorAll(".go-op").forEach(el=>el.classList.toggle("sel", +el.dataset.oi===oi));
};
window.goldenStart = ()=>{
  const g = window._golden; if(!g || !g.runId) return;
  loadWorldcard(g.runId).then(()=>{
    try{ const c = getRpCfg(); c.directorStyle = g.style || c.directorStyle; saveRpCfg(c); }catch(e){}
    let st = null;
    try{
      const stages = RP_PLOTRUN.listStages(g.runId);
      for(const s of stages){ if(s.resumable){ st = RP_PLOTRUN.load(s.plotrunId); break; } }
      if(!st && stages.length) st = RP_PLOTRUN.start(g.runId, stages[0].id);
    }catch(e){}
    const idx = (window.__DATA__ && window.__DATA__.index) || [];
    const r = idx.find(x=>x.run_id===g.runId) || {};
    const charName = g.charIdx >= 0 ? g.chars[g.charIdx] : "";
    const sess = RP_TRAVERSE.newSession({mode:"soul", worldKind:"book", worldId:g.runId,
      worldName:r.novel||g.runId, charName:charName, anchorTitle:"一键魂穿", plotrunId: st?st.id:null});
    try{
      const op = (g.ops||[])[g.openingIdx||0];
      if(op && op.text) saveHist("nd_travchat_"+sess.id, [{role:"assistant", content:op.text, ts:Date.now()}]);
    }catch(e){}
    CHAT = {mode:"traverse", travId:sess.id};
    setNav("chat");
  });
};
window.travResume = (id)=>{
  const t = RP_TRAVERSE.get(id); if(!t){ alert("会话已删除"); showTraverse(); return; }
  CHAT = {mode:"traverse", travId:id};
  setNav("chat");
};
window.travImport = ()=>{ const f=$("#travFile"); if(f){ f.value=""; f.click(); } };
window.travImportFile = async (inp)=>{
  const file = inp.files && inp.files[0]; if(!file) return;
  try{
    const card = await RP_CARDIMPORT.fromFile(file);
    if(!confirm(`导入角色卡「${card.name}」？\n${(card.scenario||card.fields.core_identity||"").slice(0,80)}`)) return;
    RP_CARDIMPORT.add(card);
    achvUnlock("card_1");
    /* 功能一: AI 补完缺失层。关键层缺 2 个以上才提示, 用户确认才调模型 */
    const miss = (typeof RP_CARDIMPORT.missingGapfillKeys === "function")
      ? RP_CARDIMPORT.missingGapfillKeys(card) : [];
    if(miss.length >= 2){ cardGapfillPrompt(card.id, miss, []); return; }
    alert(`已导入「${card.name}」：魂穿目标和卡片世界里都能选到`);
    showTraverse();
  }catch(e){ alert("导入失败："+e.message); }
};
/* ---- 功能一: 角色卡 AI 补完缺失层 ---- */
const GAPFILL_LABEL = {ooc_redline: "绝不做的事", soul_goal: "自觉目标", hidden_desire: "隐秘欲望", inner_need: "深层需求",
  /* B17: 弧光四键的中文名, 与 RP_PROMPT.LABELS / RP_CARDIMPORT.GAPFILL_KEYS 一一对应。
     缺了会退回显示裸 key 名(app.js 用的是 GAPFILL_LABEL[k]||k), 不影响功能但界面难看。 */
  arc_type: "弧光类型", arc_start: "弧光·起", arc_mid: "弧光·转", arc_end: "弧光·合"};
/* 导入成功页: 提示缺失层, 用户确认才调模型。queue: 看图写卡批量导入时的待补完队列 */
window.cardGapfillPrompt = (cardId, keys, queue)=>{
  const card = RP_CARDIMPORT.findById(cardId);
  if(!card){ cardGapfillNext(queue); return; }
  window._gapfillQueue = queue || [];
  __backAction = ()=>{ showTraverse(); };
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = "✨ AI 补完"; subEl.textContent = card.name;
  const names = keys.map(k=>GAPFILL_LABEL[k]||k).join("、");
  view.innerHTML = `<button class="back" onclick="showTraverse()">${icon("back")} 返回</button>
  <div class="card"><div class="kv">已导入「${esc(card.name)}」</div>
  <div class="hint">检测到 ${keys.length} 个关键层缺失：${esc(names)}。可让 AI 基于卡片原文推断补全，只填缺失项，原卡一字不动，补完内容会标注「AI 补完」。</div></div>
  <div class="btnrow"><button class="btn" onclick="cardGapfillGen('${jq(cardId)}')">✨ AI 补完缺失层</button>
  <button class="btn ghost" onclick="cardGapfillNext([${(queue||[]).map(x=>"'"+jq(x)+"'").join(",")}])">跳过</button></div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.cardGapfillNext = (queue)=>{
  queue = queue || [];
  if(queue.length){
    const nxt = queue.shift();
    const c = RP_CARDIMPORT.findById(nxt);
    const miss = c ? RP_CARDIMPORT.missingGapfillKeys(c) : [];
    if(miss.length >= 2){ cardGapfillPrompt(nxt, miss, queue); return; }
    cardGapfillNext(queue); return;
  }
  showTraverse();
};
window.cardGapfillGen = async (cardId)=>{
  const cfg = getCfg();
  if(!cfg.key||!cfg.base||!cfg.model){ alert("先去「我的 · 设置」配好 API 地址/Key/模型"); return; }
  const card = RP_CARDIMPORT.findById(cardId); if(!card) return;
  const keys = RP_CARDIMPORT.missingGapfillKeys(card);
  if(!keys.length){ alert("没有缺失层了"); return; }
  view.innerHTML = `<div class="card"><div class="kv">AI 正在补完…</div><div class="hint">基于卡片原文推断 ${esc(keys.map(k=>GAPFILL_LABEL[k]||k).join("、"))}</div></div>`;
  try{
    const raw = await RP_NET.complete({base:cfg.base,key:cfg.key,model:cfg.model},
      [{role:"user", content: RP_CARDIMPORT.gapfillPrompt(card, keys)}], 0.7);
    const out = RP_CARDIMPORT.parseGapfillJson(raw, keys);
    if(!out || !Object.keys(out).length){ alert("AI 没有返回可用补完，可稍后在编辑页手动填写"); cardGapfillPrompt(cardId, keys, window._gapfillQueue||[]); return; }
    window._gapfillDraft = {cardId, fields: out};
    cardGapfillView();
  }catch(e){ alert("补完失败："+e.message); cardGapfillPrompt(cardId, keys, window._gapfillQueue||[]); }
};
function cardGapfillView(){
  const d = window._gapfillDraft; if(!d) return;
  const card = RP_CARDIMPORT.findById(d.cardId); if(!card) return;
  __backAction = ()=>cardGapfillPrompt(d.cardId, Object.keys(d.fields), []);
  titleEl.innerHTML = "✨ AI 补完"; subEl.textContent = card.name;
  const rows = Object.keys(d.fields).map(k=>
    `<div class="field"><label>${esc(GAPFILL_LABEL[k]||k)} <span class="badge">AI 补完</span></label>`+
    `<textarea id="gf_${k}" rows="3">${esc(d.fields[k])}</textarea></div>`).join("");
  view.innerHTML = `<button class="back" onclick="cardGapfillPrompt('${jq(d.cardId)}',Object.keys(window._gapfillDraft.fields),[])">${icon("back")} 返回</button>
  <div class="card"><div class="kv">补完结果（可编辑，确认后写入卡片）</div>${rows}
  <div class="btnrow" style="margin-top:8px"><button class="btn" style="flex:1" onclick="cardGapfillSave()">确认写入</button></div></div>
  <div class="hint">来源标注：卡片原文保持原样；上方字段为 AI 推断补完，编辑页会打「AI 补完」标记，可随时修改。</div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
}
window.cardGapfillSave = ()=>{
  const d = window._gapfillDraft; if(!d) return;
  const card = RP_CARDIMPORT.findById(d.cardId); if(!card) return;
  card.fields = card.fields || {}; card.aiFilled = card.aiFilled || {};
  Object.keys(d.fields).forEach(k=>{
    const el = document.getElementById("gf_"+k);
    const v = el ? el.value.trim() : d.fields[k];
    if(v){ card.fields[k] = v; card.aiFilled[k] = true; }
  });
  RP_CARDIMPORT.update(card);
  window._gapfillDraft = null;
  rpToast("已写入卡片");
  cardGapfillNext(window._gapfillQueue || []);
};
window.travDelImport = (id)=>{
  if(!confirm("删除这张导入的角色卡？")) return;
  RP_CARDIMPORT.del(id); showTraverse();
};

/* ---- 功能二-1/2: 看图写卡（一图多人自动拆卡） ----
 * 纯图片(无内嵌 chara 数据) -> vision 模型识别 -> 一人一张卡 -> 勾选导入。
 * 模型是否支持 vision 按 RP_MODELTAGS 能力标签判断, 不硬编码模型名。 */
window.travVisionPick = ()=>{ const f=$("#travVisionFile"); if(f){ f.value=""; f.click(); } };
window.travVisionFile = async (inp)=>{
  const file = inp.files && inp.files[0]; if(!file) return;
  try{
    const dataUrl = await new Promise((res, rej)=>{
      const rd = new FileReader(); rd.onload = ()=>res(rd.result); rd.onerror = rej;
      rd.readAsDataURL(file);
    });
    /* PNG 先试内嵌卡片数据: 有则走普通导入, 没有才走 vision */
    if((file.type||"").indexOf("png") >= 0 || /\.png$/i.test(file.name||"")){
      try{
        const buf = await (await fetch(dataUrl)).arrayBuffer();
        const jsonText = RP_CARDIMPORT.extractChara(buf);
        const card = RP_CARDIMPORT.normalizeTavern(RP_CARDIMPORT.parseCardJson(jsonText));
        if(!confirm(`导入角色卡「${card.name}」？\n${(card.scenario||card.fields.core_identity||"").slice(0,80)}`)) return;
        RP_CARDIMPORT.add(card); achvUnlock("card_1");
        const miss = RP_CARDIMPORT.missingGapfillKeys(card);
        if(miss.length >= 2){ cardGapfillPrompt(card.id, miss, []); return; }
        alert(`已导入「${card.name}」`); showTraverse(); return;
      }catch(e){ /* 无内嵌数据, 继续 vision 流程 */ }
    }
    travVisionSetup(dataUrl);
  }catch(e){ alert("读取图片失败："+e.message); }
};
window.travVisionSetup = (dataUrl)=>{
  const cfg = getCfg();
  if(!cfg.key||!cfg.base){ alert("先去「我的 · 设置」配好 API 地址/Key"); return; }
  window._visionDataUrl = dataUrl;
  __backAction = ()=>{ showTraverse(); };
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.textContent = "看图写卡"; subEl.textContent = "AI 识别图中人物";
  const tags = (typeof RP_MODELTAGS !== "undefined" && RP_MODELTAGS.get) ? RP_MODELTAGS.get(cfg.model||"") : [];
  const hasVision = tags.indexOf("视觉") >= 0;
  view.innerHTML = `<button class="back" onclick="showTraverse()">${icon("back")} 返回</button>
  <div class="card"><div class="kv">待识别图片</div>
  <img src="${dataUrl}" style="max-width:100%;max-height:220px;border-radius:8px;display:block;margin:8px auto"></div>
  <div class="card"><div class="kv">识别模型</div>
  <div class="field"><label>当前模型：${esc(cfg.model||"（未设置）")} ${tags.map(t=>`<span class="badge">${esc(t)}</span>`).join("")}</label>
  ${hasVision ? `<div class="hint">当前模型已标记视觉能力，可直接识别。</div>`
    : `<div class="hint" style="color:var(--gold)">当前模型未标记「视觉」能力，看图写卡需要 vision 模型。请在下方指定（不硬编码，以你的网关实际支持为准）：</div>
      <input id="vv_model" placeholder="输入 vision 模型名，如 gpt-4o" value="${esc(cfg.model||"")}">`}
  </div></div>
  <div class="btnrow"><button class="btn" onclick="travVisionGen()">🔍 开始识别</button></div>
  <div class="hint">识别后一人一张卡，可勾选要导入的；图片不会上传到别处，只发给你的模型网关。</div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.travVisionGen = async ()=>{
  const cfg = getCfg();
  const dataUrl = window._visionDataUrl; if(!dataUrl) return;
  const vModelEl = document.getElementById("vv_model");
  const vModel = vModelEl ? vModelEl.value.trim() : "";
  const model = vModel || cfg.model;
  if(!model){ alert("请指定 vision 模型"); return; }
  view.innerHTML = `<div class="card"><div class="kv">AI 正在看图…</div><div class="hint">识别图中人物并写卡，稍候</div></div>`;
  try{
    const raw = await RP_NET.visionComplete({base:cfg.base,key:cfg.key,model:model},
      dataUrl, RP_CARDIMPORT.visionCardPrompt(), null, {maxTokens: 4000});
    const chars = RP_CARDIMPORT.parseVisionCards(raw);
    if(!chars || !chars.length){ alert("AI 没有识别出人物，换张图或换个 vision 模型试试"); travVisionSetup(dataUrl); return; }
    window._visionChars = chars;
    travVisionSelect();
  }catch(e){ alert("识别失败："+e.message); travVisionSetup(dataUrl); }
};
function travVisionSelect(){
  const chars = window._visionChars || [];
  __backAction = ()=>travVisionSetup(window._visionDataUrl);
  titleEl.textContent = "看图写卡"; subEl.textContent = `识别出 ${chars.length} 个人物`;
  view.innerHTML = `<button class="back" onclick="travVisionSetup(window._visionDataUrl)">${icon("back")} 重新识别</button>
  <div class="hint">勾选要导入的角色卡（默认全选），一人一张</div>
  ${chars.map((c,i)=>`<div class="card"><label class="row" style="align-items:flex-start;cursor:pointer">
    <input type="checkbox" id="vc_${i}" checked style="width:22px;height:22px;margin-top:4px;flex:none">
    <div style="flex:1;min-width:0;margin-left:8px"><div class="name">${esc(c.name||("人物"+(i+1)))}</div>
    <div class="meta">${esc(String(c.appearance||"").slice(0,60))}</div>
    <div class="meta">${esc(String(c.personality||"").slice(0,80))}</div></div></label></div>`).join("")}
  <div class="btnrow"><button class="btn" onclick="travVisionImport()">导入选中</button></div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
}
window.travVisionImport = ()=>{
  const chars = window._visionChars || [];
  const queue = [];
  let n = 0;
  chars.forEach((c,i)=>{
    const el = document.getElementById("vc_"+i);
    if(!el || !el.checked) return;
    const card = RP_CARDIMPORT.fromVisionChar(c);
    RP_CARDIMPORT.add(card); n++;
    if(RP_CARDIMPORT.missingGapfillKeys(card).length >= 2) queue.push(card.id);
  });
  window._visionChars = null; window._visionDataUrl = null;
  achvUnlock("card_1");
  if(!n){ alert("没有选中任何人物"); return; }
  /* 批量导入后: 有缺失层的卡走 AI 补完队列 */
  if(queue.length){
    const first = queue.shift();
    const c = RP_CARDIMPORT.findById(first);
    cardGapfillPrompt(first, RP_CARDIMPORT.missingGapfillKeys(c), queue);
    return;
  }
  alert(`已导入 ${n} 张角色卡`);
  showTraverse();
};

/* ---- 魂穿：选目标 -> 选锚点 -> 开局 ---- */
function soulPickTarget(){
  __backAction = ()=>showTraverse();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("user")+" 魂穿"; subEl.textContent = "选择你要成为的角色";
  const cs = allChars();
  view.innerHTML = `<button class="back" onclick="showTraverse()">${icon("back")} 返回</button>
  <div class="chargrid">${cs.map(c=>`
    <button type="button" class="charcard" onclick="soulAnchors('${jq(c.runId)}','${jq(c.name)}')">
      ${avatarHTML(c.runId, c.name, charCoverCls(c.name))}
      <div class="ccname">${esc(c.name)}</div><div class="ccnovel">${esc(c.novel)}</div>
    </button>`).join("")}</div><div style="height:40px"></div>`;
  window.scrollTo(0,0);
}
function soulOutlineFor(runId, name){
  try{
    const p = JSON.parse(localStorage.getItem(`nd_plot_${runId}_${name}`));
    if(p && p.updatedAt && p.outline) return p.outline;
  }catch(e){}
  return bundledPlotFor(runId, name);
}
/* 锚点选项区 (B15): 导入卡没有剧情大纲, RP_TRAVERSE.anchorsFor 只会兜底给出 traverse.js 自带的
   那一条"从头开始"(id="start") —— 等于没有预设锚点, 页面不该只剩这一条无意义选项。
   空列表 / 只剩这条内置兜底项时, 渲染一个默认选中的"自由开局"选项(走 soulStart 的 custom 分支:
   下面那句自定为空时用"故事开端")。有真锚点时按原样列出、第一条默认选中, 行为不变
   (value 仍是 anchors 的原下标, soulStart 按下标回查不受影响)。 */
function anchorOptionsHTML(anchors){
  const list = anchors || [];
  const real = list.filter(a=>a && a.id !== "start");
  if(real.length)
    return list.map((a,i)=>`
    <label class="kvline" style="display:block"><input type="radio" name="anchor" value="${i}"${i===0?" checked":""}> ${esc(a.title)}</label>`).join("");
  return `<label class="kvline" style="display:block"><input type="radio" name="anchor" value="custom" checked>
    无预设剧情锚点：从当前剧情自由开局（可在下面补一句切入点）</label>`;
}
 window.soulAnchors = (runId, name)=>{
  __backAction = ()=>soulPickTarget();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("user")+" 魂穿 · "+esc(name); subEl.textContent = "选择进入的剧情锚点";
  const anchors = RP_TRAVERSE.anchorsFor(soulOutlineFor(runId, name));
  const _anchNovel = ((((window.__DATA__||{}).runs||{})[runId]||{}).novel)||"";
  const run = (((window.__DATA__||{}).runs||{})[runId]||{});
  const secs = run.sections || [];
  /* 地点列表：从 worldbook geography + 事件地点聚合 */
  let places = [];
  try{
    const wb = run.worldbook || [];
    const geoTitles = wb.filter(e=>e.category==="geography").map(e=>e.title);
    /* 从标题提取具体地名（取前2-4字核心词） */
    const placeSet = new Set();
    /* v37: 原先 23 个候选地名各做一次全量 JSON.stringify(wb)，worldbook 大时很贵 */
    const __wbStr = JSON.stringify(wb);
    ["大观园","潇湘馆","怡红院","蘅芜苑","荣国府","宁国府","太虚幻境","铁槛寺",
     "梁山泊","忠义堂","东京","郓城","阳谷","景阳冈","二龙山","桃花山",
     "梨香院","栊翠庵","藕香榭","滴翠亭","金陵","神京","姑苏"].forEach(p=>{
      if(__wbStr.includes(p)) placeSet.add(p);
    });
    geoTitles.forEach(t=>{
      const m = t.match(/^(.{2,6}?)(整体|方位|格局|布局|与|之|的)/);
      if(m && m[1].length>=2) placeSet.add(m[1]);
    });
    places = [...placeSet].slice(0, 24);
  }catch(e){}
  view.innerHTML = `<button class="back" onclick="soulPickTarget()">${icon("back")} 返回</button>
  <h2 class="sec">你想从哪里开始成为${esc(name)}？</h2>
  <div class="card">${anchorOptionsHTML(anchors)}
    <label class="kvline" style="display:block"><input type="radio" name="anchor" value="custom"> 自定：<input id="anchorCustom" style="width:55%;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:6px" placeholder="比如：黛玉初进贾府那天">${RP_AIFILL.btn("anchorCustom","魂穿锚点","一句话描述想切入的剧情时间点，如：黛玉初进贾府那天","魂穿进"+(_anchNovel?("小说《"+_anchNovel+"》"):"异世界")+"成为"+name)}</label>
  </div>
  ${secs.length?`<h2 class="sec">📖 时间线（可选）</h2>
  <div class="card"><div class="field" style="margin:0"><label>从哪一章切入？角色只知道该章及之前的事</label>
  <select id="travChapter" style="width:100%">
    <option value="-1">不指定（用锚点）</option>
    ${secs.map((s,i)=>`<option value="${i}">第${i+1}章 · ${esc(s.title||"")}</option>`).join("")}
  </select></div></div>`:""}
  ${places.length?`<h2 class="sec">📍 地点（可选）</h2>
  <div class="card"><div class="field" style="margin:0"><label>故事从哪里开始？</label>
  <select id="travPlace" style="width:100%">
    <option value="">不指定</option>
    ${places.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join("")}
  </select></div></div>`:""}
  <h2 class="sec">⚡ 事件（可选）</h2>
  <div class="card"><div class="field" style="margin:0"><label>从哪个关键事件切入？（输入关键词搜索）</label>
  <input id="travEventKey" style="width:100%;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:8px" placeholder="比如：葬花、拳打镇关西" oninput="travEventSearch('${jq(runId)}')">
  <div id="travEventList" style="margin-top:8px;max-height:200px;overflow-y:auto"></div>
  <input type="hidden" id="travEventSel" value="">
  </div></div>
  <div class="card"><label class="kvline" style="display:block"><input type="checkbox" id="oocRemind" checked> OOC 提醒：我说的话不符合身份/时代时，世界轻轻点我一下</label></div>
  <div class="btnrow"><button class="btn" style="flex:1" onclick="soulStart('${jq(runId)}','${jq(name)}')">开始穿越</button></div>
  <div style="height:40px"></div>`;
  /* 预加载事件日历，供事件搜索用 */
  try{ loadEventCal(runId); }catch(e){}
  window.scrollTo(0,0);
};
/* 事件搜索：从 event_calendar / event_dag 找匹配事件 */
window.travEventSearch = (runId)=>{
  const key = ($("#travEventKey").value||"").trim();
  const listEl = $("#travEventList");
  if(!listEl) return;
  if(key.length < 1){ listEl.innerHTML = ""; return; }
  const doSearch = ()=>{
    let events = [];
    try{
      let cal = _calCache[runId] || window["__EVENTCAL_" + runId];
      if(cal && cal.events){
        events = cal.events.filter(e=>(e.summary||"").includes(key)).slice(0, 20)
          .map(e=>({text: e.summary, chapter: e.chapter, location: (e.location||[]).join("、")}));
      }else{
        let dag = window["__DAG_" + runId];
        if(dag && dag.nodes){
          events = dag.nodes.filter(n=>(n.text||"").includes(key)).slice(0, 20)
            .map(n=>({text: n.text, chapter: "", location: (n.location||[]).join("、")}));
        }
      }
    }catch(e){}
    if(!events.length){ listEl.innerHTML = `<div class="hint">没找到相关事件，换个关键词试试</div>`; return; }
    listEl.innerHTML = events.map((e,i)=>`
      <div class="kvline" style="display:block;cursor:pointer;padding:8px;border:1px solid var(--line-soft);border-radius:8px;margin-bottom:6px"
        onclick="travEventPick(${jq(i)})" data-idx="${i}">
        <div style="font-size:calc(13px * var(--fs))">${esc(e.text.slice(0,80))}${e.text.length>80?"…":""}</div>
        <div style="font-size:calc(11px * var(--fs));color:var(--ink-faint)">${e.chapter?("第"+e.chapter+"回 · "):""}${esc(e.location||"")}</div>
      </div>`).join("");
    window.__travEvents = events;
  };
  /* 确保数据已加载 */
  if(!_calCache[runId] && !window["__EVENTCAL_" + runId]){
    listEl.innerHTML = `<div class="hint">加载事件数据…</div>`;
    loadEventCal(runId).then(()=>{
      /* P2-5: 加载失败区分于"没找到"，给重试入口 */
      if(_calFailed[runId] && !_calCache[runId] && !window["__EVENTCAL_" + runId]){
        listEl.innerHTML = `<div class="hint">事件数据加载失败 <button class="btn ghost sm" onclick="travEventSearch('${jq(runId)}')">重试</button></div>`;
        return;
      }
      doSearch();
    });
  }else doSearch();
};
window.travEventPick = (i)=>{
  const ev = (window.__travEvents||[])[i];
  if(!ev) return;
  $("#travEventSel").value = ev.text.slice(0, 200);
  /* 高亮选中 */
  document.querySelectorAll("#travEventList .kvline").forEach((el,idx)=>{
    el.style.borderColor = idx===i ? "var(--gold-deep)" : "var(--line-soft)";
    el.style.background = idx===i ? "rgba(212,162,78,.08)" : "";
  });
  rpToast("已选事件");
};
window.soulStart = async (runId, name)=>{
  const rs = document.querySelectorAll('input[name="anchor"]');
  let idx = 0; rs.forEach(r=>{ if(r.checked) idx = r.value; });
  let anchorTitle;
  if(idx === "custom"){
    anchorTitle = ($("#anchorCustom").value||"").trim() || "故事开端";
  } else {
    anchorTitle = RP_TRAVERSE.anchorsFor(soulOutlineFor(runId, name))[parseInt(idx,10)].title;
  }
  const oocRemind = $("#oocRemind").checked;
  /* 新增：时间线/地点/事件三选 */
  let entryChapter = -1, entryPlace = "", entryEvent = "";
  try{
    const chSel = $("#travChapter");
    if(chSel) entryChapter = parseInt(chSel.value, 10);
    const plSel = $("#travPlace");
    if(plSel) entryPlace = plSel.value || "";
    const evSel = $("#travEventSel");
    if(evSel) entryEvent = evSel.value || "";
  }catch(e){}
  let worldKind = "book", worldId = runId;
  if(runId === "imported"){
    const c = RP_CARDIMPORT.find(name);
    worldKind = "card"; worldId = c ? c.id : "";
  } else if(runId === "custom"){
    try{
      const cc = RP_WRITER.findCustom(name);
      if(cc && cc.worldRunId) worldId = cc.worldRunId;
    }catch(e){}
  }
  const sess = RP_TRAVERSE.newSession({
    mode:"soul", worldKind, worldId,
    worldName: RP_TRAVERSE.worldDisplayName(worldKind, worldId),
    charName:name, anchorTitle, oocRemind,
    entryChapter, entryPlace, entryEvent,
  });
  travBegin(sess);
};
/* ---- 肉身穿越：选世界 -> 捏身份 -> 开局 ---- */
function bodyPickWorld(){
  __backAction = ()=>showTraverse();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("users")+" 肉身穿越"; subEl.textContent = "选择你要进入的世界";
  const ws = travWorlds();
  view.innerHTML = `<button class="back" onclick="showTraverse()">${icon("back")} 返回</button>
  ${ws.length ? ws.map(w=>`
    <div class="card card--tap" onclick="bodyIdentity('${jq(w.kind)}','${jq(w.id)}')">
      <div class="name">${esc(w.name)}</div><div class="meta">${esc(w.sub)}</div>
      ${w.kind==="card"?`<button class="linkbtn" style="margin-top:4px" onclick="event.stopPropagation();travWorldComplete('${jq(w.kind)}','${jq(w.id)}')">${icon("scroll",12)} AI 补完这个世界</button>`:""}
    </div>`).join("") : `<div class="empty">还没有可用世界：先导入角色卡，或等蒸馏任务产出</div>`}
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
}
/* ---- P1: 完整身份捏造（十项字段，逐项重随） ---- */
const IDT_INPUTS = {name:"idName",gender:"idGender",age:"idAge",looks:"idLooks",origin:"idOrigin",
  traits:"idTraits",talent:"idTalent",situation:"idSituation"};
function idtInp(fid, tag){ tag = tag||"input";
  const style = "width:100%;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px";
  return tag==="textarea"
    ? `<textarea id="${fid}" style="${style};min-height:52px"></textarea>`
    : `<input id="${fid}" style="${style}">`;
}
function idtRow(kind, id, key, label, inputHtml){
  return `<div class="field"><label>${label} <button class="linkbtn" onclick="bodyReroll('${jq(kind)}','${jq(id)}','${jq(key)}')">重随</button></label>${inputHtml}</div>`;
}
window.bodyIdentity = (kind, id)=>{
  __backAction = ()=>bodyPickWorld();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  const wname = RP_TRAVERSE.worldDisplayName(kind, id);
  window._idtDraft = null;
  titleEl.innerHTML = icon("users")+" 肉身穿越"; subEl.textContent = wname+" · 捏造你的身份";
  const F = RP_TRAVERSE2.IDENT_FIELDS;
  const lbl = k=>{ const f = F.find(x=>x.key===k); return f?f.label:k; };
  view.innerHTML = `<button class="back" onclick="bodyPickWorld()">${icon("back")} 返回</button>
  <div class="card"><div class="kv">一句话愿望，AI 帮你捏身份（十项完整字段）</div>
  <div class="row" style="margin-top:8px"><input id="idWish" style="flex:1;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px" placeholder="比如：我想当个落魄书生混进贾府">
  <button class="btn" style="white-space:nowrap" onclick="bodyAiGen('${jq(kind)}','${jq(id)}')">AI 生成</button></div></div>
  <div class="card"><label class="kvline" style="display:block"><input type="checkbox" id="idModern"> 现代人直穿：不捏古代身份，以现在的自己进去（携带手机/打火机/纸巾）</label></div>
  <h2 class="sec">身份卡 <span class="badge">P1</span></h2>
  <div class="card">
  ${idtRow(kind,id,"name",lbl("name"),`<select id="idNameCand" style="width:100%;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px;margin-bottom:6px" onchange="idNamePick()"></select>`+idtInp("idName"))}
  ${idtRow(kind,id,"gender",lbl("gender"),idtInp("idGender"))}
  ${idtRow(kind,id,"age",lbl("age"),idtInp("idAge"))}
  ${idtRow(kind,id,"looks",lbl("looks"),idtInp("idLooks"))}
  ${idtRow(kind,id,"origin",lbl("origin"),idtInp("idOrigin"))}
  ${idtRow(kind,id,"traits",lbl("traits"),idtInp("idTraits"))}
  ${idtRow(kind,id,"talent",lbl("talent"),idtInp("idTalent"))}
  ${idtRow(kind,id,"items",lbl("items"),idtInp("idItems","textarea"))}
  ${idtRow(kind,id,"situation",lbl("situation"),idtInp("idSituation","textarea"))}
  ${idtRow(kind,id,"hooks",lbl("hooks"),idtInp("idHooks","textarea"))}
  </div>
  <div class="btnrow"><button class="btn" style="flex:1" onclick="bodyStart('${jq(kind)}','${jq(id)}')">开始穿越</button></div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
/* 备选名选择 */
window.idNamePick = ()=>{ const s=$("#idNameCand"); if(s&&s.value) $("#idName").value = s.value; };
function fillIdtForm(d){
  d = d||{};
  Object.keys(IDT_INPUTS).forEach(k=>{ const el=$("#"+IDT_INPUTS[k]); if(el) el.value = d[k]||""; });
  const sel = $("#idNameCand");
  if(sel){ const cands = (d.nameCandidates&&d.nameCandidates.length)?d.nameCandidates:[d.name||""];
    sel.innerHTML = cands.filter(Boolean).map(c=>`<option ${c===d.name?"selected":""}>${esc(c)}</option>`).join(""); }
  const items = $("#idItems");
  if(items) items.value = (d.items||[]).map(i=>typeof i==="string"?i:(i.name||"")).filter(Boolean).join("\n");
  const hooks = $("#idHooks");
  if(hooks) hooks.value = (d.hooks||[]).join("\n");
}
function readIdtForm(){
  const d = window._idtDraft||{};
  Object.keys(IDT_INPUTS).forEach(k=>{ const el=$("#"+IDT_INPUTS[k]); if(el) d[k]=el.value.trim(); });
  const oldItems = d.items||[];
  d.items = ($("#idItems").value||"").split("\n").map(s=>s.trim()).filter(Boolean).map(nm=>{
    const old = oldItems.find(o=>(o.name||o)===nm);
    return old? old : {name:nm, durability:"", uses:1};
  });
  d.hooks = ($("#idHooks").value||"").split("\n").map(s=>s.trim()).filter(Boolean).slice(0,3);
  d.modern = !!$("#idModern").checked;
  return d;
}
window.bodyAiGen = async (kind, id)=>{
  const wish = ($("#idWish").value||"").trim();
  if(!wish){ alert("先写一句愿望，比如：我想当个落魄书生"); return; }
  const cfg = getCfg();
  if(!cfg.key||!cfg.base||!cfg.model){ alert("先去「我的 · 设置」配好 API 地址/Key/模型"); return; }
  const btn = window.event && window.event.target;
  try{
    if(btn) btn.textContent = "生成中…";
    const draft = await RP_TRAVERSE2.genIdentityFull(wish, RP_TRAVERSE.worldDisplayName(kind,id),
      cfg, (c,m,t)=>RP_NET.complete(c,m,t));
    draft._wish = wish;
    window._idtDraft = draft;
    fillIdtForm(draft);
  }catch(e){ alert("生成失败："+e.message); }
  finally{ if(btn) btn.textContent = "AI 生成"; }
};
window.bodyReroll = async (kind, id, fieldKey)=>{
  readIdtForm();
  const d = window._idtDraft||{};
  const wish = ($("#idWish").value||"").trim() || d._wish || "";
  if(!wish){ alert("先写一句愿望"); return; }
  const cfg = getCfg();
  if(!cfg.key||!cfg.base||!cfg.model){ alert("先去「我的 · 设置」配好 API 地址/Key/模型"); return; }
  try{
    const v = await RP_TRAVERSE2.rerollField(fieldKey, d, wish,
      RP_TRAVERSE.worldDisplayName(kind,id), cfg, (c,m,t)=>RP_NET.complete(c,m,t));
    d[fieldKey] = v;
    window._idtDraft = d;
    fillIdtForm(d);
  }catch(e){ alert("重随失败："+e.message); }
};
window.bodyStart = (kind, id)=>{
  const d = readIdtForm();
  const modern = d.modern;
  const name = (d.name||"").trim();
  if(!modern && !name){ alert("给身份起个名字，或勾选现代人直穿"); return; }
  let finalName = name;
  if(modern && !finalName){
    try{ finalName = (RP_PERSONA.resolve("trav").name)||"我"; }catch(e){ finalName = "我"; }
  }
  const items = modern
    ? RP_TRAVERSE2.cloneItems(RP_TRAVERSE2.MODERN_ITEMS)
    : RP_TRAVERSE2.cloneItems(d.items);
  const idt = RP_TRAVERSE.saveIdentity({
    name: finalName||"无名氏", gender:d.gender, age:d.age, looks:d.looks,
    origin: modern ? "现代" : d.origin,
    traits:d.traits, talent:d.talent, items:items,
    situation:d.situation, hooks:d.hooks, modern,
    worldName: RP_TRAVERSE.worldDisplayName(kind, id),
  });
  const sess = RP_TRAVERSE.newSession({
    mode:"body", worldKind:kind, worldId:id,
    worldName: RP_TRAVERSE.worldDisplayName(kind, id),
    identityId: idt.id, anchorTitle: idt.situation||"初入此界", oocRemind:true,
  });
  travBegin(sess);
};
/* ---- 进入穿越聊天 ---- */
function travBegin(sess){
  CHAT = {mode:"traverse", travId: sess.id};
  LAST_STATS = null;
  achvUnlock("traverse_1");
  /* P1: 肉身携带物同步到世界状态（仅新会话、状态尚无物品时，避免覆盖 AI 已更新的状态） */
  try{
    if(sess.mode === "body" && sess.identityId && typeof RP_TRAVERSE2 !== "undefined"){
      const idt = RP_TRAVERSE.getIdentity(sess.identityId);
      const st = RP_TRAVERSE.getState(sess.id);
      if(idt && idt.items && idt.items.length && (!st.items || !st.items.length)){
        st.items = idt.items.slice();
        RP_TRAVERSE.saveState(sess.id, st);
      }
    }
  }catch(e){}
  setNav("chat");
}
async function showTraverseChat(cfg){
  __backAction = ()=>exitChat();
  document.body.classList.add("chatmode");
  const trav = RP_TRAVERSE.get(CHAT.travId);
  if(!trav){ setNav("traverse"); return; }
  const _comps0 = (typeof RP_TRAVERSE2!=="undefined")? RP_TRAVERSE2.getCompanions(trav.id):[];
  const modeName = _comps0.length? "组团穿越" : trav.mode==="isekai"? "异世界" : (RP_TRAVERSE.MODES[trav.mode]||"穿越");
  const _plotHud = (trav.plotrunId && typeof RP_PLOTRUN!=="undefined") ? RP_PLOTRUN.hudHTML(RP_PLOTRUN.load(trav.plotrunId)) : "";
  const title = travPlayerName();
  await warmWallpaper(); await warmGlobalWall(); /* 先读用户壁纸，避免先闪默认图 */
  view.innerHTML = `
  ${chatBgHTML()}
  <div class="chathead" id="chathead">
  <button class="backbtn" onclick="exitChat()">‹</button>
  <div class="avatar">${esc((title||"穿")[0])}</div>
  <div class="chead-main"><div class="cname">${esc(title)} <span class="badge">${modeName}</span>${_plotHud}<span class="aimark">AI</span></div>
  <div class="cstat"><span>${esc(trav.worldName)}</span></div></div>
  <button class="menubtn" onclick="toggleChatSearch()" title="搜索聊天记录">${icon("search")}</button>
<button class="menubtn" onclick="toggleDrawer(true)" title="菜单">${icon("menu")}</button>
  </div>
  <div class="chatwrap">
  <div id="ctxbar"></div>
  <div id="chatsearch"></div>
  <div id="wsbar" class="wsbar" onclick="travWsEditor()"></div>
  <div id="chatlog"></div>
  <div class="chatbar">${chatbarInner(STREAMING)}</div>
  </div>
  <div class="scrim" id="scrim" onclick="toggleDrawer(false)"></div>
  <div class="drawer" id="drawer">
  <div class="dgrid"><button class="dtile" onclick="toggleDrawer(false);travWsEditor()"><span class="dtile-ic" aria-hidden="true">${icon("scroll",22)}</span><span class="dtile-lb">世界状态</span></button><button class="dtile" onclick="toggleDrawer(false);travIdentityView()"><span class="dtile-ic" aria-hidden="true">${icon("user",22)}</span><span class="dtile-lb">我的身份</span></button><button class="dtile" onclick="toggleDrawer(false);travPartyView()"><span class="dtile-ic" aria-hidden="true">${icon("users",22)}</span><span class="dtile-lb">队伍</span></button><button class="dtile" onclick="toggleDrawer(false);wallpaperEditor()"><span class="dtile-ic" aria-hidden="true">${icon("image",22)}</span><span class="dtile-lb">聊天壁纸</span></button></div>
  <h3>穿越</h3>
  <button class="ditem" onclick="toggleDrawer(false);travRegexEditor()">${icon("type")} 正则替换</button>
  <button class="ditem" onclick="toggleDrawer(false);openAssistant()">${icon("lightbulb")} 浮生小助手</button>
  <button class="ditem" onclick="toggleDrawer(false);showSystem()">${icon("settings")} prompt 预览</button>
  <button class="ditem" onclick="toggleDrawer(false);exportChat()">${icon("download")} 复制聊天记录</button>
  <button class="ditem danger" onclick="toggleDrawer(false);travEnd()">${icon("x")} 结束穿越</button>
  </div>`;
  renderChat(); renderWsBar(); paintChatBg(); attachHeadHide();
  const k = chatHistKey();
  /* P0-2/P1-4: 读失败≠空历史；await 开场白生成后必须再确认（用户可能已发消息） */
  let __th0 = null;
  try{ __th0 = getHist(k); }catch(e){
    const _tlog = document.getElementById("chatlog");
    if(_tlog) _tlog.innerHTML = `<div class="msg"><div class="msgcol"><div class="bubble">⚠️ 聊天记录读取失败（存储异常），未做任何写入。请稍后重进，历史数据仍在。</div></div></div>`;
    return;
  }
  if(!__th0.length){
    try{
      const opening = await RP_TRAVERSE.genOpening(trav, cfg, (c,m,t)=>RP_NET.complete(c,m,t));
      const parsed = RP_TRAVERSE.parseWsBlock(opening);
      if(parsed.patch) RP_TRAVERSE.saveState(trav.id,
        RP_TRAVERSE.mergeState(RP_TRAVERSE.getState(trav.id), parsed.patch));
      let __th2 = null;
      try{ __th2 = getHist(k); }catch(e){ return; } /* 读失败：放弃写入 */
      if(__th2.length) return; /* 用户已发消息：不开场白覆盖 */
      saveHist(k, [{role:"assistant", content: parsed.clean || opening, ts:Date.now()}]);
    }catch(e){
      let __th3 = null;
      try{ __th3 = getHist(k); }catch(e2){ return; }
      if(__th3.length) return;
      saveHist(k, [{role:"assistant", content: RP_TRAVERSE.offlineOpening(trav), ts:Date.now()}]);
    }
    renderChat(); renderWsBar();
  }
}
function renderWsBar(){
  const bar = $("#wsbar"); if(!bar || CHAT.mode!=="traverse") return;
  const st = RP_TRAVERSE.getState(CHAT.travId);
  /* 单行世界状态：时间 · 地点天气 · 导演模式 · 物品/出戏值（2026-10-09 合并三重叠加） */
  let parts = [];
  /* 时间地点：优先用 traverse state，worldsim 只补天气 */
  let dateStr = st.date || "", locStr = st.loc || "", weatherStr = "";
  try{
    if(typeof RP_WORLDSIM!=="undefined" && RP_WORLDSIM.enabled()){
      const ws = RP_WORLDSIM.get("nd_travchat_"+CHAT.travId) || {};
      if(ws.weather) weatherStr = ws.weather;
      /* traverse state 为空时才用 worldsim 的 */
      if(!dateStr && ws.date) dateStr = ws.date;
      if(!locStr && ws.loc) locStr = ws.loc;
    }
  }catch(e){}
  if(dateStr) parts.push(esc(dateStr));
  if(locStr) parts.push("📍"+esc(locStr));
  if(weatherStr) parts.push(esc(weatherStr));
  try{
    if(typeof RP_DIRECTOR!=="undefined"){
      const dh = RP_DIRECTOR.briefHTML("nd_travchat_"+CHAT.travId);
      /* briefHTML 返回 html，提取纯文本 */
      const tmp = document.createElement("div"); tmp.innerHTML = dh;
      const dtxt = (tmp.textContent||"").trim();
      if(dtxt) parts.push("🎬"+esc(dtxt));
    }
  }catch(e){}
  if(st.items && st.items.length) parts.push("🎒"+st.items.length);
  if(st.flags && st.flags.ooc>0) parts.push(`<span class="ooc">出戏${st.flags.ooc}</span>`);
  bar.innerHTML = `${icon("scroll",13)} <span class="wsline">${parts.join(" · ")||"世界状态"}</span>`
    + `<span style="float:right;opacity:.6">查看 ›</span>`;
}
window.travWsEditor = ()=>{
  const trav = RP_TRAVERSE.get(CHAT.travId); if(!trav) return;
  __backAction = ()=>showChat();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  const st = RP_TRAVERSE.getState(trav.id);
  titleEl.innerHTML = icon("scroll")+" 世界状态"; subEl.textContent = trav.worldName;
  const _wsCtx = "穿越世界「"+trav.worldName+"」的世界状态；最近剧情：\n"+RP_AIFILL._recentChatCtx(8,"nd_travchat_"+trav.id);
  const favRows = Object.keys(st.favor||{}).map(k=>
    `<div class="kvline">${esc(k)}：好感 ${st.favor[k]}</div>`).join("") || `<div class="meta">暂无</div>`;
  view.innerHTML = `<button class="back" onclick="showChat()">${icon("back")} 返回</button>
  <div class="card">
  <div class="field"><label>日期${RP_AIFILL.btn("wsDate","世界日期","如：某年八月十五；结合剧情进度推断",_wsCtx)}</label><input id="wsDate" style="width:100%;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px" value="${esc(st.date||"")}"></div>
  <div class="field"><label>地点${RP_AIFILL.btn("wsLoc","当前地点","故事当前所在的地点名",_wsCtx)}</label><input id="wsLoc" style="width:100%;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px" value="${esc(st.loc||"")}"></div>
  <div class="field"><label>剧情进度${RP_AIFILL.btn("wsProg","剧情进度","一句话概括当前剧情进展到哪了",_wsCtx)}</label><input id="wsProg" style="width:100%;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px" value="${esc(st.progress||"")}"></div>
  <div class="btnrow" style="margin-top:8px"><button class="btn" onclick="travWsSave()">保存</button></div>
  </div>
  <div class="card"><h3>${icon("clock",15)} 世界模拟</h3>
  <div class="btnrow"><button class="btn ghost" onclick="simEditor()">调整时间 / 天气 / 地点</button></div>
  <div class="hint">每会话独立时钟，随聊天自动流逝；天气按季节流转；地点切换消耗移动时间。三者会注入 prompt，AI 叙述自动呼应。</div>
  </div>
  <h2 class="sec">随身物品</h2>
  <div class="card">${st.items.length? st.items.map(i=>`<div class="kvline">${esc(i)}</div>`).join("") : `<div class="meta">空</div>`}</div>
  <h2 class="sec">人物好感</h2>
  <div class="card">${favRows}</div>
  <div class="hint">世界状态由 AI 在剧情推进时自动更新，你也可以手动修正时间地点。</div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.travWsSave = ()=>{
  const st = RP_TRAVERSE.getState(CHAT.travId);
  st.date = $("#wsDate").value.trim(); st.loc = $("#wsLoc").value.trim();
  st.progress = $("#wsProg").value.trim();
  RP_TRAVERSE.saveState(CHAT.travId, st);
  showChat();
};
window.travIdentityView = ()=>{
  const trav = RP_TRAVERSE.get(CHAT.travId); if(!trav) return;
  __backAction = ()=>showChat();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("user")+" 我的身份"; subEl.textContent = RP_TRAVERSE.MODES[trav.mode]||"";
  const body = trav.mode==="soul"
    ? `<div class="card"><div class="name" style="font-size:calc(16px * var(--fs))">${esc(trav.charName)}</div>
       <div class="meta">${esc(trav.worldName)} · ${esc(trav.anchorTitle||"")}</div>
       <div class="kv" style="margin-top:8px">你是玩家本人，正在扮演 TA。能做的只有 TA 能做的，知道的只有 TA 知道的。</div></div>`
    : trav.mode==="isekai"
    ? `<div class="card"><div class="name" style="font-size:calc(16px * var(--fs))">${esc(trav.charName)}</div>
       <div class="meta">${esc(trav.srcName||"")} → ${esc(trav.worldName)}</div>
       <div class="kv" style="margin-top:8px">${esc(trav.fusion==="reborn"?"转生：AI 安排目标世界新身份，保留性格与记忆":"异乡人：完整保留原身份记忆，目标世界视你为异人")}</div></div>`
    : (()=>{
        const idt = RP_TRAVERSE.getIdentity(trav.identityId)||{};
        const rows = [["姓名",idt.name],["性别",idt.gender],["年龄",idt.age],["相貌",idt.looks],
          ["出身",idt.origin],["性格",idt.traits],["特长",idt.talent],["当前处境",idt.situation]];
        const items = (idt.items||[]).map((it,ix)=>{
          const nm = typeof it==="string"?it:(it.name||"");
          const det = typeof it==="string"?"":[(it.durability?"耐久"+it.durability:""),
            (it.uses!=null?("可用"+it.uses+"次"):"")].filter(Boolean).join(" ");
          return `<div class="kvline"><span class="kv">${esc(nm)}</span> <span class="dim">${esc(det)}</span>
            ${typeof it==="string"?"":`<button class="linkbtn" onclick="travUseItem(${jq(ix)})">使用</button>`}</div>`;
        }).join("") || `<div class="meta">空</div>`;
        const hooks = (idt.hooks||[]).map(h=>`<div class="kvline">🔗 ${esc(h)}</div>`).join("");
        return `<div class="card">${rows.filter(r=>r[1]).map(r=>
          `<div class="kvline"><span class="kv">${r[0]}</span> ${esc(r[1])}</div>`).join("")}
          ${idt.modern?`<div class="kvline"><span class="badge">现代人直穿</span></div>`:""}
          </div>
          <h2 class="sec">携带物（P1）</h2><div class="card">${items}</div>
          ${hooks?`<h2 class="sec">关系钩子（P1）</h2><div class="card">${hooks}</div>`:""}`;
      })();
  view.innerHTML = `<button class="back" onclick="showChat()">${icon("back")} 返回</button>${body}
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.travEnd = ()=>{
  if(!confirm("结束这次穿越？聊天记录和世界状态会保留在「最近穿越」里。")) return;
  CHAT = {mode:"single", runId:null, name:null, members:[], forcedSpeaker:null};
  setNav("traverse");
};

/* ================= 穿越 P1/P2/P3 UI（2026-09-30） ================= */

/* ---- P1: 携带物使用 ---- */
window.travUseItem = (ix)=>{
  const trav = RP_TRAVERSE.get(CHAT.travId); if(!trav || trav.mode!=="body") return;
  const idt = RP_TRAVERSE.getIdentity(trav.identityId); if(!idt || !idt.items) return;
  const res = RP_TRAVERSE2.useItem(idt.items, ix);
  if(!res.used){ alert("没有这件物品"); return; }
  idt.items = res.items;
  RP_TRAVERSE.saveIdentity(idt);
  /* P1: 同步世界状态里的物品 */
  try{
    const st = RP_TRAVERSE.getState(trav.id);
    st.items = res.items.slice();
    RP_TRAVERSE.saveState(trav.id, st);
  }catch(e){}
  travIdentityView();
};

/* ---- P1: 出戏值 ---- */
function travOocCheck(travId, text){
  if(!text || typeof RP_TRAVERSE2==="undefined") return;
  try{
    const hits = RP_TRAVERSE2.detectOoc(text);
    if(!hits.length) return;
    const st = RP_TRAVERSE.getState(travId);
    RP_TRAVERSE2.addOoc(st, text);
    RP_TRAVERSE.saveState(travId, st);
  }catch(e){}
}
/* ---- P1/P2/P3: 拼穿越 prompt 增补段（ooc + 异世界 + 组团） ---- */
function travExtraPrompt(travId, userText){
  if(typeof RP_TRAVERSE2==="undefined") return "";
  const trav = RP_TRAVERSE.get(travId); if(!trav) return "";
  const parts = [];
  try{
    const st = RP_TRAVERSE.getState(travId);
    const ooc = (st.flags && st.flags.ooc) || 0;
    if(ooc > 0){
      parts.push("「出戏值」当前 " + ooc + "/100：玩家言行中的现代元素让 NPC 感到困惑、起疑或好奇。"
        + "出戏值越高，NPC 越可能把玩家当成异类对待；出戏值达到整百时，安排一个趣味特殊事件"
        + "（如被当成妖怪围观、被奉为贵人），趣味为主、不要惩罚玩家。");
    }
    if(trav.mode === "isekai"){
      parts.push(RP_TRAVERSE2.isekaiPrompt(trav, RP_TRAVERSE2.getWorld(trav.dstId) || {}));
    }
    const comps = RP_TRAVERSE2.getCompanions(travId);
    if(comps.length){
      const speakers = RP_TRAVERSE2.planParty(userText, comps, window._travLastSpeaker || null, {});
      window._travLastSpeaker = speakers[speakers.length - 1] || window._travLastSpeaker || null;
      parts.push(RP_TRAVERSE2.partyPrompt(trav)
        + "\n本轮应发言队友：" + (speakers.join("、") || "无")
        + "（按各自人设自由发言、行动或互相拌嘴；正文里用「名字：」区分说话人）");
    }
  }catch(e){}
  /* 走原著线：注入当前剧情节点调度素材（只读状态机，不推进） */
  try{
    if(trav.plotrunId && typeof RP_PLOTRUN!=="undefined"){
      const _pst = RP_PLOTRUN.load(trav.plotrunId);
      if(_pst){ const _blk = RP_PLOTRUN.directorBlock(_pst); if(_blk) parts.push(_blk); }
    }
  }catch(e){}
  return parts.join("\n\n");
}

/* ---- P1: 角色卡世界 AI 补完 ---- */
window.travWorldComplete = (kind, id)=>{
  /* 走原著线选书页进来的补完页(PLOTLINE_WB_BACK): 返回回选书页, 不是穿越首页 */
  const backPlot = PLOTLINE_WB_BACK && kind === "card";
  __backAction = backPlot ? ()=>plotlinePickBook() : ()=>showTraverse();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  const wname = RP_TRAVERSE.worldDisplayName(kind, id);
  titleEl.innerHTML = icon("scroll")+" 世界补完"; subEl.textContent = wname;
  const card = (kind === "card" && typeof RP_CARDIMPORT !== "undefined") ? RP_CARDIMPORT.findById(id) : null;
  const seed = RP_TRAVERSE2.extractSeed(card);
  let done = null;
  try{ done = JSON.parse(localStorage.getItem("nd_wb2_"+kind+"_"+id) || "null"); }catch(e){}
  const backBtn = backPlot
    ? `<button class="back" onclick="plotlinePickBook()">${icon("back")} 返回</button>`
    : `<button class="back" onclick="showTraverse()">${icon("back")} 返回</button>`;
  view.innerHTML = backBtn + `
  <div class="card"><div class="kv">角色卡原文设定</div>
  <div class="hint">名称：${esc((card&&card.name)||"")} · 种子文本 ${seed.length} 字</div>
  <div class="meta" style="white-space:pre-wrap;max-height:120px;overflow:hidden">${esc(seed.slice(0,300))}${seed.length>300?"…":""}</div></div>
  ${done?`<div class="card"><div class="kv">已补完 <span class="badge">AI 补完</span></div>
  <div class="hint">${esc((done.bg||"").slice(0,140))}…</div></div>`:""}
  <div class="btnrow"><button class="btn" style="flex:1" onclick="travWorldCompleteGen('${jq(kind)}','${jq(id)}')">${done?"重新补完":"AI 补完世界"}</button></div>
  <div class="hint">AI 只补：时代背景、势力/门派、关键地点、当前局势、3–5 个剧情锚点。补完内容会标注「AI 补完」来源，你确认后才生效。</div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.travWorldCompleteGen = async (kind, id)=>{
  const cfg = getCfg();
  if(!cfg.key||!cfg.base||!cfg.model){ alert("先去「我的 · 设置」配好 API 地址/Key/模型"); return; }
  try{
    const card = (kind === "card" && typeof RP_CARDIMPORT !== "undefined") ? RP_CARDIMPORT.findById(id) : null;
    const bible = await RP_TRAVERSE2.genWorldBible(card, cfg, (c,m,t)=>RP_NET.complete(c,m,t));
    window._wbDraft = {kind, id, bg: bible.bg, anchors: bible.anchors};
    travWorldCompleteView();
  }catch(e){ alert("补完失败："+e.message); }
};
function travWorldCompleteView(){
  const d = window._wbDraft; if(!d) return;
  __backAction = ()=>travWorldComplete(d.kind, d.id);
  titleEl.innerHTML = icon("scroll")+" 世界补完"; subEl.textContent = RP_TRAVERSE.worldDisplayName(d.kind, d.id);
  view.innerHTML = `<button class="back" onclick="travWorldComplete('${jq(d.kind)}','${jq(d.id)}')">${icon("back")} 返回</button>
  <div class="card"><div class="kv">补完结果（可编辑，确认后生效）</div>
  <div class="field"><label>世界设定 <span class="badge">AI 补完</span></label>
  <textarea id="wbBg" style="width:100%;min-height:180px;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px">${esc(d.bg)}</textarea></div>
  <div class="field"><label>剧情锚点（每行一条） <span class="badge">AI 补完</span></label>
  <textarea id="wbAnchors" style="width:100%;min-height:80px;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px">${esc(d.anchors.join("\n"))}</textarea></div>
  <div class="btnrow" style="margin-top:8px"><button class="btn" style="flex:1" onclick="travWorldCompleteSave()">确认生效</button></div></div>
  <div class="hint">来源标注：卡片原文保持原样；上方内容均为 AI 补完，注入 prompt 时自动标注。</div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
}
window.travWorldCompleteSave = ()=>{
  const d = window._wbDraft; if(!d) return;
  d.bg = $("#wbBg").value.trim();
  d.anchors = $("#wbAnchors").value.split("\n").map(s=>s.trim()).filter(Boolean).slice(0,5);
  d.updatedAt = Date.now();
  /* P2-14: 世界设定是用户手输内容，写失败必须明确提示，不能静默丢 */
  try{ localStorage.setItem("nd_wb2_"+d.kind+"_"+d.id, JSON.stringify(d)); }
  catch(e){ rpToastOnce(isQuotaErr(e) ? "存储空间已满，世界设定未保存" : "世界设定保存失败"); return; }
  travWorldComplete(d.kind, d.id);
};

/* ---- P2: 异世界穿越 ---- */
window.isekaiPickSrc = ()=>{
  __backAction = ()=>showTraverse();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("repeat")+" 异世界穿越"; subEl.textContent = "第一步：选择穿越的角色";
  const cs = allChars();
  view.innerHTML = `<button class="back" onclick="showTraverse()">${icon("back")} 返回</button>
  <div class="hint">把这个角色送进另一部作品的世界。</div>
  <div class="chargrid">${cs.map(c=>`
    <button type="button" class="charcard" onclick="isekaiPickDst('${jq(c.runId)}','${jq(c.name)}')">
      ${avatarHTML(c.runId, c.name, charCoverCls(c.name))}
      <div class="ccname">${esc(c.name)}</div><div class="ccnovel">${esc(c.novel)}</div>
    </button>`).join("")}</div><div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.isekaiPickDst = (srcRunId, srcName)=>{
  __backAction = ()=>isekaiPickSrc();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("repeat")+" 异世界穿越"; subEl.textContent = "第二步：选择目标世界";
  const worlds = RP_TRAVERSE2.listWorlds();
  view.innerHTML = `<button class="back" onclick="isekaiPickSrc()">${icon("back")} 返回</button>
  <div class="hint">穿越者：${esc(srcName)}</div>
  ${worlds.map(w=>`
  <div class="card card--tap" onclick="isekaiFusion('${jq(srcRunId)}','${jq(srcName)}','${jq(w.key)}')">
    <div class="name">《${esc(w.title)}》 ${w.status==="pending"?'<span class="badge">数据待接入</span>':'<span class="badge">已接入</span>'}</div>
    <div class="meta">${esc(w.note||"")}</div>
  </div>`).join("")}
  <div class="hint">「数据待接入」的世界（如水浒）也可以进：AI 不会编造该世界的具体人物剧情，用开放式异世界推进。</div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.isekaiFusion = (srcRunId, srcName, dstKey)=>{
  const w = RP_TRAVERSE2.getWorld(dstKey);
  __backAction = ()=>isekaiPickDst(srcRunId, srcName);
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("repeat")+" 异世界穿越"; subEl.textContent = "第三步：选择融合方式";
  view.innerHTML = `<button class="back" onclick="isekaiPickDst('${jq(srcRunId)}','${jq(srcName)}')">${icon("back")} 返回</button>
  <div class="card"><div class="name">${esc(srcName)} → 《${esc(w.title)}》</div>
  <div class="row" style="margin-top:8px">
  <label class="kvline" style="display:block"><input type="radio" name="fusion" value="outsider" checked> 异乡人：完整保留原身份与记忆，目标世界视你为异人</label>
  <label class="kvline" style="display:block;margin-top:6px"><input type="radio" name="fusion" value="reborn"> 转生：AI 安排目标世界新身份，保留性格与记忆</label></div></div>
  <div class="btnrow"><button class="btn" style="flex:1" onclick="isekaiStart('${jq(srcRunId)}','${jq(srcName)}','${jq(dstKey)}')">开始穿越</button></div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.isekaiStart = (srcRunId, srcName, dstKey)=>{
  const w = RP_TRAVERSE2.getWorld(dstKey); if(!w) return;
  const fusion = (document.querySelector('input[name="fusion"]:checked')||{}).value || "outsider";
  const sess = RP_TRAVERSE2.isekaiSession({
    srcKind:"char", srcId:srcRunId, srcName:srcName,
    dstKey:dstKey, dstKind:w.kind, dstId:w.key, fusion, charName:srcName,
  });
  /* 补齐 buildMessages 需要的世界字段：ready 世界尽量映射到真实 runId */
  let runId = w.key;
  if(w.status === "ready" && w.kind === "book"){
    const idx = (window.__DATA__ && window.__DATA__.index) || [];
    const hit = idx.find(r=>(r.novel||"").indexOf(w.title) >= 0);
    if(hit) runId = hit.run_id;
  }
  sess.worldKind = "book"; sess.worldId = runId;
  sess.worldName = RP_TRAVERSE.worldDisplayName("book", runId);
  sess.anchorTitle = "初入异世界";
  RP_TRAVERSE.save(sess);
  travBegin(sess);
};

/* ---- P3: 组团穿越 ---- */
window.partySetup = ()=>{
  __backAction = ()=>showTraverse();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("chat")+" 组团穿越"; subEl.textContent = "第一步：选择世界";
  const ws = travWorlds();
  view.innerHTML = `<button class="back" onclick="showTraverse()">${icon("back")} 返回</button>
  <div class="hint">2–4 人小队：你 + 最多 3 名队友。AI 按 talkativeness 调度发言，被你点名的队友一定发言。</div>
  ${ws.map(w=>`
    <div class="card card--tap" onclick="partyPickMain('${jq(w.kind)}','${jq(w.id)}')">
      <div class="name">${esc(w.name)}</div><div class="meta">${esc(w.sub)}</div>
    </div>`).join("")}<div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.partyPickMain = (kind, id)=>{
  __backAction = ()=>partySetup();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("chat")+" 组团穿越"; subEl.textContent = "第二步：你的身份";
  const wname = RP_TRAVERSE.worldDisplayName(kind, id);
  view.innerHTML = `<button class="back" onclick="partySetup()">${icon("back")} 返回</button>
  <div class="card"><div class="kv">${esc(wname)}</div>
  <div class="btnrow" style="margin-top:8px">
  <button class="btn" style="flex:1" onclick="partyPickMainSoul('${jq(kind)}','${jq(id)}')">魂穿：选一个角色</button>
  <button class="btn ghost" style="flex:1" onclick="partyPickMainBody('${jq(kind)}','${jq(id)}')">肉身：快速捏身份</button></div></div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.partyPickMainSoul = (kind, id)=>{
  __backAction = ()=>partyPickMain(kind, id);
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("chat")+" 组团穿越"; subEl.textContent = "选择你要扮演的角色";
  const cs = allChars();
  window._partyCands = cs;
  view.innerHTML = `<button class="back" onclick="partyPickMain('${jq(kind)}','${jq(id)}')">${icon("back")} 返回</button>
  <div class="chargrid">${cs.map((c,ix)=>`
    <button type="button" class="charcard" onclick="partyPickMainSoulGo('${jq(kind)}','${jq(id)}',${jq(ix)})">
      ${avatarHTML(c.runId, c.name, charCoverCls(c.name))}
      <div class="ccname">${esc(c.name)}</div><div class="ccnovel">${esc(c.novel)}</div>
    </button>`).join("")}</div><div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.partyPickMainSoulGo = (kind, id, ix)=>{
  const c = (window._partyCands||[])[ix]; if(!c) return;
  partyPickComps(kind, id, {mode:"soul", runId:c.runId, name:c.name});
};
window.partyPickMainBody = (kind, id)=>{
  __backAction = ()=>partyPickMain(kind, id);
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("chat")+" 组团穿越"; subEl.textContent = "肉身：快速捏身份";
  view.innerHTML = `<button class="back" onclick="partyPickMain('${jq(kind)}','${jq(id)}')">${icon("back")} 返回</button>
  <div class="card"><div class="field"><label>一句话设定你的身份/开场</label>
  <input id="pbWish" style="width:100%;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px" placeholder="比如：现代大学生，带着手机穿进大观园"></div>
  <label class="kvline"><input type="checkbox" id="pbModern" checked> 现代人直穿（携带手机/打火机/纸巾）</label>
  <div class="btnrow" style="margin-top:8px"><button class="btn" style="flex:1" onclick="partyBodyNext('${jq(kind)}','${jq(id)}')">下一步：选队友</button></div></div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.partyBodyNext = (kind, id)=>{
  partyPickComps(kind, id, {mode:"body",
    wish:($("#pbWish").value||"").trim(), modern:$("#pbModern").checked});
};
window.partyPickComps = (kind, id, main)=>{
  __backAction = ()=>partyPickMain(kind, id);
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("chat")+" 组团穿越"; subEl.textContent = "第三步：选择队友（最多3人）";
  const cs = allChars().filter(c=>!(main.mode==="soul" && c.name===main.name));
  window._partyCands = cs; window._partySel = []; window._partyMain = main;
  view.innerHTML = `<button class="back" onclick="partyPickMain('${jq(kind)}','${jq(id)}')">${icon("back")} 返回</button>
  <div class="hint">主身份：${esc(main.mode==="soul"?main.name:((main.wish||"")+"（肉身）")||"肉身")}</div>
  <div class="chargrid">${cs.map((c,ix)=>`
    <button type="button" class="charcard" id="pc_${ix}" onclick="partyToggleComp(${jq(ix)})">
      ${avatarHTML(c.runId, c.name, charCoverCls(c.name))}
      <div class="ccname">${esc(c.name)}</div><div class="ccnovel">${esc(c.novel)}</div>
    </button>`).join("")}</div>
  <div class="btnrow" style="position:sticky;bottom:70px"><button class="btn" style="flex:1" onclick="partyStart('${jq(kind)}','${jq(id)}')">出发！</button></div>
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.partyToggleComp = (ix)=>{
  const s = window._partySel || [];
  const el = $("#pc_"+ix);
  const at = s.indexOf(ix);
  if(at >= 0){ s.splice(at,1); if(el) el.classList.remove("sel"); }
  else{ if(s.length >= 3){ alert("最多 3 名队友"); return; } s.push(ix); if(el) el.classList.add("sel"); }
  window._partySel = s;
};
window.partyStart = (kind, id, main)=>{
  const sel = window._partySel || [];
  main = main || window._partyMain;
  if(!main) return;
  if(!sel.length){ alert("至少选 1 名队友"); return; }
  const wname = RP_TRAVERSE.worldDisplayName(kind, id);
  let sess;
  if(main.mode === "soul"){
    sess = RP_TRAVERSE.newSession({mode:"soul", worldKind:kind, worldId:id,
      worldName:wname, charName:main.name, runId:main.runId,
      anchorTitle:"组团穿越", oocRemind:true});
  }else{
    const idt = RP_TRAVERSE.saveIdentity({name:"我", modern:!!main.modern,
      origin:"现代", situation:main.wish || "初入此界",
      items:RP_TRAVERSE2.cloneItems(RP_TRAVERSE2.MODERN_ITEMS), worldName:wname});
    sess = RP_TRAVERSE.newSession({mode:"body", worldKind:kind, worldId:id,
      worldName:wname, identityId:idt.id, anchorTitle:main.wish || "初入此界", oocRemind:true});
  }
  sel.forEach(ix=>{
    const c = (window._partyCands||[])[ix]; if(!c) return;
    RP_TRAVERSE2.addCompanion(sess.id, {name:c.name, runId:c.runId, talk:50});
  });
  travBegin(sess);
};
window.travPartyView = ()=>{
  const trav = RP_TRAVERSE.get(CHAT.travId); if(!trav) return;
  __backAction = ()=>showChat();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("chat")+" 队伍"; subEl.textContent = trav.worldName || "";
  const comps = RP_TRAVERSE2.getCompanions(trav.id);
  view.innerHTML = `<button class="back" onclick="showChat()">${icon("back")} 返回</button>
  <div class="hint">AI 按 talkativeness（0–100，默认 50）调度队友发言；被你点名的队友一定发言。聊天记录独立保存在这次穿越里。</div>
  ${comps.map((c,ix)=>`
  <div class="card"><div class="row"><div style="flex:1"><div class="name">${esc(c.name)}</div>
  <div class="meta">talkativeness ${c.talk==null?50:c.talk}</div></div>
  <button class="linkbtn" onclick="travPartyTalk(${jq(ix)},-10)">−</button>
  <button class="linkbtn" onclick="travPartyTalk(${jq(ix)},10)">＋</button>
  <button class="linkbtn danger" onclick="travPartyRemove(${jq(ix)})">移除</button></div></div>`).join("")
  || `<div class="empty">暂无队友</div>`}
  <div style="height:40px"></div>`;
  window.scrollTo(0,0);
};
window.travPartyTalk = (ix, d)=>{
  const trav = RP_TRAVERSE.get(CHAT.travId); if(!trav) return;
  const comps = RP_TRAVERSE2.getCompanions(trav.id);
  const c = comps[ix]; if(!c) return;
  c.talk = Math.max(0, Math.min(100, (c.talk==null?50:c.talk) + d));
  RP_TRAVERSE2.removeCompanion(trav.id, c.name);
  RP_TRAVERSE2.addCompanion(trav.id, c);
  travPartyView();
};
window.travPartyRemove = (ix)=>{
  const trav = RP_TRAVERSE.get(CHAT.travId); if(!trav) return;
  const comps = RP_TRAVERSE2.getCompanions(trav.id);
  if(comps[ix] && confirm("移除队友 "+comps[ix].name+"？")){
    RP_TRAVERSE2.removeCompanion(trav.id, comps[ix].name);
  }
  travPartyView();
};
