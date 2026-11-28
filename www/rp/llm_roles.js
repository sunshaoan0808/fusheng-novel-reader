/* 多厂家 LLM 配置层 (2026-11-28): 厂家 (name/base/key/模型列表) 与用途分配分离。
 * 用途四种: chat 对话 / distill 蒸馏 / image 生图 / tts 朗读。
 * 每个用途可指派 {厂家, 模型}; 未指派时各消费方沿用旧配置 (全局 nd_api_cfg_v1、
 * 蒸馏 nd_distill_llm、生图 imgBase/imgKey、TTS ttsModel), 行为不变。
 * 首次加载自动把旧配置迁移成厂家与指派 (旧键保留不删, 可回滚)。 */
var LLM_ROLES = (function(){
"use strict";

var PKEY = "nd_llm_providers_v1";
var RKEY = "nd_llm_roles_v1";
var ROLES = ["chat", "distill", "image", "tts"];
var ROLE_NAMES = {chat: "对话", distill: "蒸馏", image: "生图", tts: "TTS 朗读"};

function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
function parse(k, dft){ try{ var v = JSON.parse(lsGet(k) || "null"); return v == null ? dft : v; }catch(e){ return dft; } }

function getProviders(){ var a = parse(PKEY, null); return Array.isArray(a) ? a : []; }
function saveProviders(a){ lsSet(PKEY, JSON.stringify(a || [])); }
function getRoles(){
  var r = parse(RKEY, null);
  if(!r || typeof r !== "object") r = {};
  ROLES.forEach(function(k){ if(!(k in r)) r[k] = null; });
  return r;
}
function saveRoles(r){ lsSet(RKEY, JSON.stringify(r)); }
function providerById(id){
  var a = getProviders();
  for(var i = 0; i < a.length; i++) if(a[i].id === id) return a[i];
  return null;
}

var seq = 0;
function newId(){ return "p" + Date.now().toString(36) + (seq++).toString(36); }

function addProvider(p){
  var a = getProviders();
  var base = String((p && p.base) || "").trim(), key = String((p && p.key) || "");
  for(var i = 0; i < a.length; i++){
    if(a[i].base === base && a[i].key === key && base) return a[i].id; /* 同址同 Key 去重 */
  }
  var item = {id: newId(), name: String((p && p.name) || "未命名厂家").trim() || "未命名厂家",
    base: base, key: key, models: (p && Array.isArray(p.models)) ? p.models.slice() : []};
  a.push(item); saveProviders(a);
  return item.id;
}
function updateProvider(id, patch){
  var a = getProviders();
  for(var i = 0; i < a.length; i++){
    if(a[i].id !== id) continue;
    if(patch.name != null) a[i].name = String(patch.name).trim() || a[i].name;
    if(patch.base != null) a[i].base = String(patch.base).trim();
    if(patch.key != null && patch.key !== "") a[i].key = String(patch.key); /* 空 = 不修改 */
    if(Array.isArray(patch.models)) a[i].models = patch.models.slice();
    saveProviders(a); return true;
  }
  return false;
}
function removeProvider(id){
  saveProviders(getProviders().filter(function(p){ return p.id !== id; }));
  var r = getRoles(), changed = false;
  ROLES.forEach(function(k){ if(r[k] && r[k].pid === id){ r[k] = null; changed = true; } });
  if(changed) saveRoles(r);
}
function setRole(role, pid, model){
  if(ROLES.indexOf(role) < 0) return false;
  var r = getRoles();
  r[role] = pid ? {pid: pid, model: String(model || "").trim()} : null;
  saveRoles(r); return true;
}

/* 解析某用途的有效配置: 指派优先; 无指派或厂家缺失/无 Key 返回 null, 消费方走旧逻辑 */
function resolve(role){
  var r = getRoles()[role];
  if(!r || !r.pid) return null;
  var p = providerById(r.pid);
  if(!p || !p.base || !p.key) return null;
  return {base: p.base, key: p.key, model: r.model || "", provider: p.name, pid: p.id, source: "role"};
}

/* 拉取厂家模型列表 (OpenAI 兼容 GET /models), 成功后存入厂家记录 */
async function fetchModels(id){
  var p = providerById(id);
  if(!p) throw new Error("厂家不存在");
  if(!p.base || !p.key) throw new Error("先填好接口地址与 Key");
  var resp = await fetch(p.base.replace(/\/$/, "") + "/models",
    {headers: {"Authorization": "Bearer " + p.key}});
  if(!resp.ok){
    var eb = ""; try{ eb = await resp.text(); }catch(_){}
    throw new Error("HTTP " + resp.status + (eb ? ": " + String(eb).replace(/\s+/g, " ").slice(0, 140) : ""));
  }
  var d = await resp.json();
  var models = ((d && d.data) || []).map(function(m){ return m && m.id; }).filter(Boolean);
  if(!models.length) throw new Error("接口未返回模型列表");
  updateProvider(id, {models: models});
  return models;
}

/* 旧配置迁移: 只在厂家表不存在时执行一次; 旧键一律保留 */
function ensureMigrated(){
  if(lsGet(PKEY) !== null) return;
  var providers = [], roles = {chat: null, distill: null, image: null, tts: null};
  saveProviders(providers); saveRoles(roles); /* 先落空表, 防并发重复迁移 */
  function add(base, key, name, models){
    if(!base && !key) return null;
    return addProvider({base: base || "", key: key || "", name: name, models: models || []});
  }
  var main = parse("nd_api_cfg_v1", {});
  var modelCache = parse("nd_models", []);
  var pidMain = add(main.base, main.key, "主接口", Array.isArray(modelCache) ? modelCache : []);
  if(pidMain && main.model) roles.chat = {pid: pidMain, model: main.model};
  parse("nd_api_profiles", []).forEach(function(p){
    if(p && (p.base || p.key)) add(p.base, p.key, p.name || "聊天配置档");
  });
  var d = parse("nd_distill_llm", {});
  if(d.baseUrl || d.key){
    var pidD = add(d.baseUrl, d.key, "蒸馏接口");
    if(pidD && d.model) roles.distill = {pid: pidD, model: d.model};
  }else if(d.model && pidMain){
    roles.distill = {pid: pidMain, model: d.model}; /* 仅覆盖模型名、共用主接口 (用户当前形态) */
  }
  if(main.imgBase || main.imgKey){
    var pidI = add(main.imgBase || main.base, main.imgKey || main.key, "生图接口");
    if(pidI && main.imgModel) roles.image = {pid: pidI, model: main.imgModel};
  }else if(main.imgModel && pidMain){
    roles.image = {pid: pidMain, model: main.imgModel};
  }
  if(main.ttsModel && pidMain) roles.tts = {pid: pidMain, model: main.ttsModel};
  saveRoles(roles);
}
try{ ensureMigrated(); }catch(e){}

return {
  ROLES: ROLES, ROLE_NAMES: ROLE_NAMES,
  getProviders: getProviders, getRoles: getRoles, providerById: providerById,
  addProvider: addProvider, updateProvider: updateProvider, removeProvider: removeProvider,
  setRole: setRole, resolve: resolve, fetchModels: fetchModels, ensureMigrated: ensureMigrated
};
})();

/* 设置页 UI: 厂家管理 + 用途分配。挂载点为设置页的 #llm_roles_box。 */
var LLM_ROLES_UI = (function(){
"use strict";
/* 收敛到 escutil.js 的 escH()；独立加载（测试 vm）无 escH 时回退同款实现 */
var escHtml = (typeof escH === "function") ? escH : function(s){
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
};
var editingId = null;

function roleRow(role){
  var roles = LLM_ROLES.getRoles(), providers = LLM_ROLES.getProviders();
  var cur = roles[role];
  var pid = cur ? cur.pid : "";
  var prov = pid ? LLM_ROLES.providerById(pid) : null;
  var models = prov ? (prov.models || []) : [];
  var modelOpts = models.map(function(m){
    return '<option value="' + escHtml(m) + '"' + (cur && cur.model === m ? " selected" : "") + '>' + escHtml(m) + '</option>';
  }).join("");
  var provOpts = '<option value="">未分配（沿用旧配置）</option>' + providers.map(function(p){
    return '<option value="' + escHtml(p.id) + '"' + (p.id === pid ? " selected" : "") + '>' + escHtml(p.name) + '</option>';
  }).join("");
  return '<div class="field"><label>' + LLM_ROLES.ROLE_NAMES[role] + '</label>'
    + '<div class="modelrow"><select id="lr_p_' + role + '" onchange="LLM_ROLES_UI.roleProvider(\'' + role + '\')">' + provOpts + '</select>'
    + '<select id="lr_m_' + role + '" onchange="LLM_ROLES_UI.roleApply(\'' + role + '\')">' + modelOpts + '</select></div>'
    + '<input id="lr_mc_' + role + '" placeholder="或手动输入模型名" value="' + escHtml(cur && models.indexOf(cur.model) < 0 ? cur.model : "") + '" style="margin-top:6px" onchange="LLM_ROLES_UI.roleApply(\'' + role + '\')">'
    + '</div>';
}

function providerRow(p){
  var usedBy = [];
  var roles = LLM_ROLES.getRoles();
  LLM_ROLES.ROLES.forEach(function(k){ if(roles[k] && roles[k].pid === p.id) usedBy.push(LLM_ROLES.ROLE_NAMES[k]); });
  return '<div style="padding:8px 0;border-bottom:1px solid var(--line)">'
    + '<b>' + escHtml(p.name) + '</b> <span style="color:var(--ink-dim);font-size:12px">' + escHtml(p.base || "(未填地址)") + '</span>'
    + '<div style="font-size:12px;color:var(--ink-dim);margin-top:2px">Key ' + (p.key ? "已保存" : "未填")
    + ' · 模型 ' + ((p.models || []).length) + ' 个'
    + (usedBy.length ? ' · 用于：' + escHtml(usedBy.join("、")) : "") + '</div>'
    + '<div class="btnrow" style="margin-top:6px">'
    + '<button class="btn ghost" onclick="LLM_ROLES_UI.edit(\'' + p.id + '\')">编辑</button>'
    + '<button class="btn ghost" onclick="LLM_ROLES_UI.fetchModels(\'' + p.id + '\')">拉取模型列表</button>'
    + '<button class="btn ghost" onclick="LLM_ROLES_UI.remove(\'' + p.id + '\')">删除</button>'
    + '</div></div>';
}

function html(){
  var providers = LLM_ROLES.getProviders();
  var ep = editingId ? LLM_ROLES.providerById(editingId) : null;
  var s = '<h3>模型厂家 · 用途分配</h3>'
    + '<div class="kv">可以配多个厂家（地址 + Key + 模型列表），再把每个厂家的某个模型指派给一种用途：对话、蒸馏、生图、TTS 朗读。指派优先于下方旧接口表单；未分配的用途沿用旧配置，行为不变。</div>'
    + '<div style="margin-top:10px;font-weight:600">用途分配</div>'
    + LLM_ROLES.ROLES.map(roleRow).join("")
    + '<div style="margin-top:12px;font-weight:600">厂家列表</div>'
    + (providers.length ? providers.map(providerRow).join("") : '<div class="kv">还没有厂家，用下方表单添加第一个。</div>')
    + '<div style="margin-top:12px;font-weight:600">' + (ep ? "编辑厂家" : "添加厂家") + '</div>'
    + '<div class="field"><label>厂家名</label><input id="lr_name" placeholder="如：zen 网关 / OpenAI / 硅基流动" value="' + escHtml(ep ? ep.name : "") + '"></div>'
    + '<div class="field"><label>API 地址</label><input id="lr_base" placeholder="https://…/v1" value="' + escHtml(ep ? ep.base : "") + '"></div>'
    + '<div class="field"><label>API Key</label><input id="lr_key" type="password" placeholder="' + (ep && ep.key ? "已保存（留空 = 不修改）" : "sk-…") + '" value=""></div>'
    + '<div class="btnrow"><button class="btn" onclick="LLM_ROLES_UI.saveProvider()">' + (ep ? "保存修改" : "添加厂家") + '</button>'
    + (ep ? '<button class="btn ghost" onclick="LLM_ROLES_UI.edit(null)">取消编辑</button>' : "") + '</div>'
    + '<div id="lr_msg" style="margin-top:6px"></div>';
  return s;
}
function mount(box){ if(box) box.innerHTML = html(); }
function refresh(){ var box = document.getElementById("llm_roles_box"); if(box) mount(box); }
function msg(t){ var m = document.getElementById("lr_msg"); if(m) m.innerHTML = '<span style="font-size:12px;color:var(--ink-dim)">' + escHtml(t) + '</span>'; }

return {
  mount: mount, refresh: refresh,
  edit: function(id){ editingId = id; refresh(); },
  saveProvider: function(){
    var name = document.getElementById("lr_name").value.trim();
    var base = document.getElementById("lr_base").value.trim();
    var key = document.getElementById("lr_key").value;
    if(!name){ msg("先给厂家起个名"); return; }
    if(!base){ msg("先填 API 地址"); return; }
    if(editingId){ LLM_ROLES.updateProvider(editingId, {name: name, base: base, key: key}); editingId = null; msg("已保存"); }
    else{
      if(!key){ msg("新厂家需要填 Key"); return; }
      LLM_ROLES.addProvider({name: name, base: base, key: key}); msg("已添加");
    }
    refresh();
  },
  remove: function(id){
    var p = LLM_ROLES.providerById(id);
    if(!window.confirm("删除厂家「" + (p ? p.name : "") + "」？指向它的用途分配会一并清空（回退旧配置）。")) return;
    if(editingId === id) editingId = null;
    LLM_ROLES.removeProvider(id); refresh();
  },
  fetchModels: async function(id){
    msg("拉取中…");
    try{
      var models = await LLM_ROLES.fetchModels(id);
      msg("已拉取 " + models.length + " 个模型，可在上方用途分配里选");
      refresh();
    }catch(e){ msg("拉取失败：" + e.message); }
  },
  roleProvider: function(role){
    var pid = document.getElementById("lr_p_" + role).value;
    var cur = LLM_ROLES.getRoles()[role];
    LLM_ROLES.setRole(role, pid || null, pid && cur && cur.pid === pid ? cur.model : "");
    refresh();
  },
  roleApply: function(role){
    var pid = document.getElementById("lr_p_" + role).value;
    var custom = document.getElementById("lr_mc_" + role).value.trim();
    var sel = document.getElementById("lr_m_" + role).value;
    LLM_ROLES.setRole(role, pid || null, custom || sel || "");
    msg(LLM_ROLES.ROLE_NAMES[role] + " 已指派");
  }
};
})();
