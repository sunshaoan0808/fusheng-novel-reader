"use strict";
/* 场景配图双通道 MVP（2026-11-24 用户拍板）：
 * sceneimg 纯逻辑（prompt 拼装/通道选择/URL/节流）+ 全链接线 pin。 */
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

function loadSceneimg(extra) {
  const ctx = { console, Date, setTimeout, Promise };
  Object.assign(ctx, extra || {});
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("www/rp/sceneimg.js", "utf8"), ctx);
  return vm.runInContext("RP_SCENEIMG", ctx);
}

(async () => {
const S = loadSceneimg();
t("buildPrompt: 全字段拼装（地点/时段天气映射/在场外貌/大事记）", () => {
  const p = S.buildPrompt(
    { place: "潇湘馆", period: "dusk", weather: "rain", present: ["林黛玉", "贾宝玉"], diary: "黛玉葬花" },
    { appearance: { "林黛玉": "身着月白长裙，眉眼含愁" } });
  assert.ok(p.includes("地点：潇湘馆"));
  assert.ok(p.includes("黄昏，细雨"));
  assert.ok(p.includes("林黛玉（身着月白长裙，眉眼含愁）"));
  assert.ok(p.includes("贾宝玉"));
  assert.ok(p.includes("画面：黛玉葬花"));
  assert.ok(p.includes("不要出现文字"));
});
t("buildPrompt: 无 diary 用 excerpt 兜底且截断", () => {
  const p = S.buildPrompt({ place: "医院走廊" }, { excerpt: "她".repeat(100) });
  assert.ok(p.includes("画面：" + "她".repeat(60)));
  assert.ok(!p.includes("她".repeat(61)));
});
t("buildPrompt: 空场景只剩骨架不断言", () => {
  const p = S.buildPrompt(null, {});
  assert.ok(p.startsWith("场景插画"));
  assert.ok(p.includes("细腻叙事插画"));
});
t("buildPrompt: weatherName 优先于枚举映射", () => {
  const p = S.buildPrompt({ weather: "rain", weatherName: "毛毛细雨" }, {});
  assert.ok(p.includes("毛毛细雨"));
});
t("pollinationsUrl: 编码 + 尺寸 + seed 默认", () => {
  const u = S.pollinationsUrl("医院 走廊", null);
  assert.ok(u.startsWith("https://image.pollinations.ai/prompt/"));
  assert.ok(u.includes(encodeURIComponent("医院 走廊")));
  assert.ok(u.includes("width=1024") && u.includes("height=640") && u.includes("seed=42"));
  assert.ok(S.pollinationsUrl("x", 7).includes("seed=7"));
});
t("channelOf: 默认免费/api 齐备才 api/api 未配为 null", () => {
  assert.strictEqual(S.channelOf({}, {}), "pollinations");
  assert.strictEqual(S.channelOf({ imgSrc: "api", base: "b", key: "k", imgModel: "m" }, {}), "api");
  assert.strictEqual(S.channelOf({ imgSrc: "api", base: "b", key: "k" }, {}), null);
  assert.strictEqual(S.channelOf({ imgSrc: "pollinations" }, {}), "pollinations");
});
await (async () => {
  const S2 = loadSceneimg({ RP_NET: { generateImage: async (cfg, prompt, model) => "data:image/png;base64,XX" } });
  const r1 = await S2.generate({ imgSrc: "api", base: "b", key: "k", imgModel: "m" }, {}, "p", 1);
  assert.strictEqual(r1, "data:image/png;base64,XX");
  const r2 = await S2.generate({}, {}, "医院", 3);
  assert.ok(r2.startsWith("https://image.pollinations.ai/prompt/"));
  let threw = false;
  try { await S2.generate({ imgSrc: "api" }, {}, "p", 1); } catch (e) { threw = /未配置/.test(e.message); }
  assert.ok(threw);
  n++; console.log("ok - generate: api 走 RP_NET / 免费走 URL / 未配抛错");
})();
await (async () => {
  const S3 = loadSceneimg();
  const a = await S3.autoCgImage({ cfg: {}, scene: { place: "走廊" }, excerpt: "撞见" });
  assert.ok(typeof a === "string" && a.includes("image.pollinations.ai"));
  const b = await S3.autoCgImage({ cfg: {}, scene: { place: "走廊" }, excerpt: "撞见" });
  assert.strictEqual(b, null); // 35 秒节流
  n++; console.log("ok - autoCgImage: 首次出图、节流内返回 null");
})();
await (async () => {
  let completes = 0, imgPrompt = null;
  const S4 = loadSceneimg({ RP_NET: {
    complete: async () => { completes++; return "A hospital corridor in the morning, a woman in a beige trench coat looking back, cinematic illustration, no text"; },
    generateImage: async (cfg, prompt) => { imgPrompt = prompt; return "data:image/png;base64,XX"; }
  } });
  const zh = "场景插画。地点：市中心医院门诊大厅。上午，多云。在场：杨蓉（米色风衣，长发）。画面：挂号窗口前，她回头望向身后。细腻叙事插画，电影感构图，柔和光影，画面中不要出现文字";
  const u1 = await S4.generate({}, {}, zh, 5);
  assert.ok(u1.includes(encodeURIComponent("hospital corridor")), "免费通道应发英文 prompt");
  assert.strictEqual(completes, 1);
  const u2 = await S4.generate({}, {}, zh, 6);
  assert.strictEqual(completes, 1, "同 prompt 译文应走缓存");
  const u3 = await S4.generate({}, {}, "A forest at dawn, cinematic illustration", 5);
  assert.strictEqual(completes, 1, "英文 prompt 不翻译");
  assert.ok(u3.includes(encodeURIComponent("A forest at dawn")));
  await S4.generate({ imgSrc: "api", base: "b", key: "k", imgModel: "m" }, {}, zh, 5);
  assert.strictEqual(imgPrompt, zh, "api 通道中文直发不翻译");
  assert.strictEqual(completes, 1);
  n++; console.log("ok - generate: 免费通道中文先译英文（缓存）/英文直发/api 不译");
})();
await (async () => {
  const S5 = loadSceneimg({ RP_NET: { complete: async () => { throw new Error("down"); } } });
  const u = await S5.generate({}, {}, "场景插画。地点：医院。画面：她回头。", 5);
  assert.ok(u.includes(encodeURIComponent("医院")), "翻译失败应回落中文原文");
  n++; console.log("ok - translatePrompt: 翻译失败回落原文不抛错");
})();
t("cgAutoOn: 无 RP cfg 默认开、显式关才关", () => {
  assert.strictEqual(loadSceneimg().cgAutoOn(), true);
  assert.strictEqual(loadSceneimg({ getRpCfg: () => ({ cgAuto: false }) }).cgAutoOn(), false);
  assert.strictEqual(loadSceneimg({ getRpCfg: () => ({}) }).cgAutoOn(), true);
});

/* ---- 接线 pin ---- */
const R = (p) => fs.readFileSync(p, "utf8");
t("pin: index.html 加载 sceneimg.js", () => {
  assert.ok(R("www/index.html").includes('src="rp/sceneimg.js"'));
});
t("pin: chat.js 定格自动落图（notices 扫 cg + 事件回挂）", () => {
  const s = R("www/rp/chat.js");
  assert.ok(s.includes('kind === "cg"'));
  assert.ok(s.includes("RP_SCENEIMG.autoCgImage"));
  assert.ok(s.includes('new CustomEvent("rp-cgimg"'));
  assert.ok(s.includes("RP_SCENEIMG.cgAutoOn()"));
});
t("pin: app_prefs 监听回挂 + 定格卡渲染 + 图鉴留底", () => {
  const s = R("www/js/app_prefs.js");
  assert.ok(s.includes('addEventListener("rp-cgimg"'));
  assert.ok(s.includes("nd_cg_art_v1"));
  assert.ok(s.includes("m.cgImg"));
  assert.ok(s.includes("cgtpl"));
  assert.ok(s.includes("sceneCardHTML(sceneCard, {idx: idx})"));
});
t("pin: sceneCardHTML 出图 + 配图按钮 + 地址白名单", () => {
  const s = R("www/js/app_ui.js");
  assert.ok(s.includes("sct-img"));
  assert.ok(s.includes("sceneImgForm("));
  assert.ok(s.includes("data:image\\/"));
});
t("pin: app_rundata 浮层/压缩/限量/大图", () => {
  const s = R("www/js/app_rundata.js");
  assert.ok(s.includes("window.sceneImgForm"));
  assert.ok(s.includes("window.shrinkImgForStore"));
  assert.ok(s.includes("window.capChatImgs"));
  assert.ok(s.includes("window.viewImgFull"));
  assert.ok(s.includes("RP_SCENEIMG.generate(getCfg(), getRpCfg()"));
});
t("pin: 设置页生图来源 + cg 自动开关三处齐", () => {
  const s = R("www/app.js");
  assert.ok(s.includes('id="c_imgsrc"'));
  assert.ok(s.includes("imgSrc:"));
  assert.ok(s.includes('id="r_cgauto"'));
  assert.ok(s.includes("rc.cgAuto!==false"));
  assert.ok(s.includes("cgAuto:"));
});
t("pin: ui42.css 定格卡与配图样式", () => {
  const s = R("www/ui42.css");
  assert.ok(s.includes(".cgtpl"));
  assert.ok(s.includes(".sct-gen"));
  assert.ok(s.includes(".sct-img"));
});

console.log("\n" + n + " 项全过");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
