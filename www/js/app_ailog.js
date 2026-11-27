/* 浮生 · app 分段 20：AI 诊断日志页（2026-11-26 新增，非迁移）：RP_AILOG 的查看/分析/导出界面。
 * 列表 → 详情（提示词/思考/答复三段全文）→ AI 分析（最近 10 条交给
 * 当前聊天模型做诊断，结论留存）。导出诊断包是给外部迭代用的：
 * 把 JSON 发给开发者/Muse，就能按真实记录修提示词与代码（飞轮）。 */
"use strict";

function aiLogTime(ts){
  const d = new Date(ts);
  const p = (n)=> String(n).padStart(2, "0");
  return (d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
window.showAiLog = ()=>{
  __backAction = ()=>showSettings();
  document.body.classList.remove("chatmode", "immersive");
  titleEl.textContent = "AI 诊断日志";
  const st = (typeof RP_AILOG !== "undefined") ? RP_AILOG.stats() : {n: 0, chars: 0, enabled: false};
  subEl.textContent = st.enabled ? ("自动记录中 · " + st.n + " 条") : "自动记录已关";
  const sums = (typeof RP_AILOG !== "undefined") ? RP_AILOG.summaries() : [];
  const diagModel = (typeof RP_AILOG !== "undefined" && RP_AILOG.getDiagModel) ? RP_AILOG.getDiagModel() : "";
  const analyses = (typeof RP_AILOG !== "undefined") ? RP_AILOG.loadAnalyses() : [];
  let h = `<button class="back" onclick="showSettings()">${icon("back")} 返回设置</button>`
    + `<div class="card"><div class="kv">每一次调用 AI 的<b>完整提示词、思考过程、答复</b>都记在这里（主聊天、导演、世界模拟、摘要等全覆盖），只存本机。上限 ${st.maxN || 40} 条 / 约 ${Math.round((st.maxChars || 1200000) / 10000)} 万字，超限自动淘汰最旧的。</div>`
    + `<div class="kv" style="margin-top:6px">当前 ${st.n} 条 · 共 ${st.chars} 字 · 自动记录 <b>${st.enabled ? "开" : "关"}</b></div>`
    + `<div class="btnrow" style="margin-top:8px">`
    + `<button class="btn" onclick="aiLogAnalyze(this)">AI 分析最近 10 条</button>`
    + `<button class="btn ghost" onclick="aiLogExport()">导出诊断包</button>`
    + `<button class="btn ghost" onclick="toggleAiLog()">${st.enabled ? "暂停记录" : "开启记录"}</button>`
    + `<button class="btn danger" onclick="aiLogClear()">清空</button></div>`
    + `<div class="field" style="margin-top:10px"><label>审核模型（交叉审核：用另一个模型审，避开自诊盲区；留空 = 当前聊天模型）</label>`
    + `<input id="ailog_model" placeholder="填模型名，如 deepseek-chat" value="${esc(diagModel)}" onchange="aiLogSetModel(this.value)"></div>`
    + `<div id="ailog_result"></div></div>`;
  if(analyses.length){
    h += `<h2 class="sec">历次分析</h2>` + analyses.slice().reverse().map((a, ri)=>{
      const i = analyses.length - 1 - ri;
      return `<div class="card" style="cursor:pointer" onclick="showAiAnalysis(${jq(i)})"><div class="kv"><b>${esc(aiLogTime(a.ts))}</b> · ${esc(a.scope || "")}</div><div class="kv" style="opacity:.75">${esc(String(a.text || "").slice(0, 90))}…</div></div>`;
    }).join("");
  }
  h += `<h2 class="sec">记录</h2>`;
  if(!sums.length) h += `<div class="empty">还没有记录，去聊几句再回来</div>`;
  h += sums.map(s=>`<div class="card" style="cursor:pointer" onclick="showAiLogDetail('${jq(s.id)}')">`
    + `<div class="kv"><b>${esc(aiLogTime(s.ts))}</b> · ${esc(s.model || "?")}${s.stream ? " · 流式" : ""}${s.tag ? " · " + esc(s.tag) : ""} · ${(s.ms / 1000).toFixed(1)}s</div>`
    + `<div class="kv" style="opacity:.75">提示词 ${s.promptChars} 字（${s.msgs} 段）${s.thinkChars ? " · 思考 " + s.thinkChars + " 字" : ""} · 答复 ${s.replyChars} 字${s.error ? " · ⚠️ " + esc(s.error) : ""}</div></div>`).join("")
    + `<div style="height:40px"></div>`;
  view.innerHTML = h;
  try{ window.scrollTo(0, 0); }catch(e){}
};
window.showAiLogDetail = (id)=>{
  const e = (typeof RP_AILOG !== "undefined") ? RP_AILOG.get(id) : null;
  if(!e){ showAiLog(); return; }
  __backAction = ()=>showAiLog();
  titleEl.textContent = "记录详情";
  subEl.textContent = aiLogTime(e.ts) + " · " + (e.model || "");
  const pre = (label, text)=>`<h2 class="sec">${label}</h2><div class="card"><pre class="ailog-pre">${esc(text || "（无）")}</pre></div>`;
  const msgs = (e.messages || []).map(m=>`【${m.role || "?"}】\n${m.content || ""}`).join("\n\n");
  view.innerHTML = `<button class="back" onclick="showAiLog()">${icon("back")} 返回日志</button>`
    + (e.error ? `<div class="card"><div class="kv">⚠️ 本次调用出错：${esc(e.error)}</div></div>` : "")
    + pre("提示词（实际发送的全部内容）", msgs)
    + pre("AI 的思考", e.thinking)
    + pre("AI 的答复", e.reply)
    + `<div style="height:40px"></div>`;
  try{ window.scrollTo(0, 0); }catch(e2){}
};
window.showAiAnalysis = (i)=>{
  const list = (typeof RP_AILOG !== "undefined") ? RP_AILOG.loadAnalyses() : [];
  const a = list[i];
  if(!a){ showAiLog(); return; }
  __backAction = ()=>showAiLog();
  titleEl.textContent = "分析结论";
  subEl.textContent = aiLogTime(a.ts) + " · " + (a.scope || "");
  view.innerHTML = `<button class="back" onclick="showAiLog()">${icon("back")} 返回日志</button>`
    + `<div class="card"><pre class="ailog-pre">${esc(a.text || "")}</pre></div><div style="height:40px"></div>`;
  try{ window.scrollTo(0, 0); }catch(e){}
};
window.aiLogAnalyze = async (btn)=>{
  const box = document.getElementById("ailog_result");
  if(box) box.innerHTML = `<div class="kv" style="margin-top:8px">诊断中…（把最近 10 条的提示词/思考/答复交给当前模型分析，约十几秒）</div>`;
  if(btn) btn.disabled = true;
  try{
    const cfg = getCfg();
    if(!cfg.base || !cfg.model) throw new Error("先在设置里配好 API 地址与模型");
    const dm = (typeof RP_AILOG !== "undefined" && RP_AILOG.getDiagModel) ? RP_AILOG.getDiagModel() : "";
    const effCfg = dm ? Object.assign({}, cfg, {model: dm}) : cfg;
    const text = await RP_AILOG.analyze((c, ms, t)=>RP_NET.complete(c, ms, t), effCfg, 10);
    if(box) box.innerHTML = `<div class="kv" style="margin-top:8px"><b>诊断完成</b>（已存入历次分析）</div><pre class="ailog-pre">${esc(text)}</pre>`;
  }catch(e){
    if(box) box.innerHTML = `<div class="kv" style="margin-top:8px">分析失败：${esc(e.message || String(e))}</div>`;
  }
  if(btn) btn.disabled = false;
};
window.aiLogSetModel = (v)=>{
  RP_AILOG.setDiagModel((v || "").trim());
  rpToast(RP_AILOG.getDiagModel() ? ("审核模型已设为 " + RP_AILOG.getDiagModel()) : "审核模型已清空（跟随聊天模型）");
};
window.aiLogExport = ()=>{
  try{
    const obj = RP_AILOG.exportObj();
    const d = new Date();
    downloadJson("fusheng-ailog-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + ".json", obj);
    rpToast("诊断包已导出（含全部记录与分析）");
  }catch(e){ rpToast("导出失败：" + (e.message || e)); }
};
window.aiLogClear = ()=>{
  if(!confirm("清空全部诊断记录？（分析结论会保留）")) return;
  RP_AILOG.clear();
  showAiLog();
};
window.toggleAiLog = ()=>{
  const on = RP_AILOG.enabled();
  RP_AILOG.setEnabled(!on);
  rpToast(!on ? "自动记录已开启" : "自动记录已暂停");
  if(titleEl.textContent === "AI 诊断日志") showAiLog(); else showSettings();
};
