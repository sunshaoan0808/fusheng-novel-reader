/* 多厂家 LLM 配置层回归 (2026-11-28):
 * 旧配置迁移 (含"蒸馏仅覆盖模型名"形态) / 用途解析优先 / 厂家 CRUD /
 * 删厂家清指派 / DISTILL_LLM 接入 / UI 挂载冒烟。只用 Node vm, 零依赖。 */
const fs = require("fs");
const vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const rp = f => fs.readFileSync(WWW + "/rp/" + f, "utf8");
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

function sandbox(fixtures) {
  const mem = new Map();
  Object.keys(fixtures || {}).forEach(k => mem.set(k, JSON.stringify(fixtures[k])));
  const localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
    key: i => Array.from(mem.keys())[i] || null,
    get length() { return mem.size; },
    clear: () => mem.clear()
  };
  const sb = { localStorage, console, Date, Math, JSON, RegExp, Object, Array, String, Number,
    parseInt, parseFloat, setTimeout, clearTimeout, Promise, Map, Set };
  const ctx = vm.createContext(sb);
  sb.window = sb; sb.globalThis = sb;
  return ctx;
}
const load = (ctx, files) => files.forEach(f => vm.runInContext(rp(f), ctx, { filename: f }));

const FIX = {
  nd_api_cfg_v1: { base: "https://zen/v1", key: "K1", model: "chat-model", ttsModel: "tts-1", imgModel: "", imgBase: "", imgKey: "" },
  nd_models: ["chat-model", "deepseek-v4.1-flash-free"],
  nd_distill_llm: { model: "deepseek/deepseek-v4.1-flash" },
  nd_api_profiles: [{ name: "备用档", base: "https://b/v1", key: "K2", model: "m2" }]
};

{
  const sb = sandbox(FIX);
  load(sb, ["llm_roles.js"]);
  const R = sb.LLM_ROLES;
  const ps = R.getProviders();
  t("迁移生成 2 个厂家 (主接口+配置档)", ps.length === 2);
  const roles = R.getRoles();
  t("对话指派 = 主接口+chat-model", !!roles.chat && roles.chat.model === "chat-model");
  t("蒸馏指派 = 主接口+被覆盖的模型名", !!roles.distill && roles.distill.model === "deepseek/deepseek-v4.1-flash" && roles.distill.pid === roles.chat.pid);
  t("TTS 指派 = 主接口+tts-1", !!roles.tts && roles.tts.model === "tts-1");
  t("生图未指派 (旧配置无生图模型)", roles.image === null);
  const rd = R.resolve("distill");
  t("resolve(distill) 给全套凭据", !!rd && rd.base === "https://zen/v1" && rd.key === "K1" && rd.model === "deepseek/deepseek-v4.1-flash");
  t("resolve(image) 为 null 走旧逻辑", R.resolve("image") === null);
  t("主接口带上模型列表缓存", (ps.find(p => p.name === "主接口") || {}).models.length === 2);

  /* CRUD + 指派清理 */
  const nid = R.addProvider({ name: "生图厂", base: "https://img/v1", key: "K3", models: ["flux-1"] });
  t("同址同 Key 去重", R.addProvider({ name: "重复", base: "https://img/v1", key: "K3" }) === nid);
  R.setRole("image", nid, "flux-1");
  t("生图指派后可解析", (R.resolve("image") || {}).model === "flux-1");
  R.updateProvider(nid, { key: "" });
  t("编辑时空 Key 不覆盖", R.providerById(nid).key === "K3");
  R.removeProvider(nid);
  t("删厂家清掉指向它的指派", R.getRoles().image === null && R.resolve("image") === null);
  R.setRole("chat", null, "");
  t("指派可清空回退旧配置", R.resolve("chat") === null);
}

{
  /* DISTILL_LLM 接入: 指派优先 */
  const sb = sandbox(FIX);
  load(sb, ["llm_roles.js", "distill_llm.js"]);
  const c = sb.DISTILL_LLM.cfg();
  t("蒸馏 cfg 走指派", c._fromRole === true && c.baseUrl === "https://zen/v1" && c.key === "K1" && c.model === "deepseek/deepseek-v4.1-flash");
}

{
  /* 空环境: 不炸, 全 null */
  const sb = sandbox({});
  load(sb, ["llm_roles.js"]);
  t("空环境厂家为空", sb.LLM_ROLES.getProviders().length === 0);
  t("空环境解析为 null", sb.LLM_ROLES.resolve("chat") === null);
}

{
  /* UI 挂载冒烟 */
  const sb = sandbox(FIX);
  load(sb, ["llm_roles.js"]);
  const box = { innerHTML: "" };
  sb.LLM_ROLES_UI.mount(box);
  t("UI 含用途分配与厂家名", box.innerHTML.includes("用途分配") && box.innerHTML.includes("主接口"));
  t("UI 含四种用途行", ["chat", "distill", "image", "tts"].every(r => box.innerHTML.includes('id="lr_p_' + r + '"')));
}

console.log("llm_roles: " + pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
