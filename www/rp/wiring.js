/* RP_WIRING：Tier 1 模块接线层（浮生自有集成代码）。
 * 把 beats/zonestore/status/action/onturn/art/cg/check/diary/scene/system 十一个纯逻辑模块
 * 接进单聊主路径：一轮回复落地后由 onturn 编排结算——zonestore 解析结构化状态区块，
 * status 结算好感、scene 更新场景、cg 解锁图鉴、diary 记大事、art 按剧本行驱动立绘状态，
 * system 通知中心汇集本轮系统消息。任何一步失败都被编排器隔离，不影响正文。
 * 无区块的回复原样透传，行为与接线前一致。
 */
var RP_WIRING = (function () {
  "use strict";

  function gf(name) {
    return typeof globalThis !== "undefined" && typeof globalThis[name] === "function"
      ? globalThis[name] : null;
  }
  function loadJSON(key, fallback) {
    try {
      if (typeof localStorage === "undefined") return fallback;
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }
  function isEnabled() {
    try {
      if (typeof localStorage === "undefined") return true;
      return localStorage.getItem("rp_wiring_enabled") !== "0";
    } catch (e) { return true; }
  }
  function setEnabled(on) {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("rp_wiring_enabled", on ? "1" : "0");
      }
    } catch (e) {}
  }

  /* ---------- 实例 ---------- */
  var createZoneStore = gf("createZoneStore");
  var createFavorEngine = gf("createFavorEngine");
  var createTurnOrchestrator = gf("createTurnOrchestrator");
  var createActionManager = gf("createActionManager");
  var createArtStage = gf("createArtStage");
  var createCgGallery = gf("createCgGallery");
  var createCheck = gf("createCheck");
  var createDiary = gf("createDiary");
  var createSceneManager = gf("createSceneManager");
  var createNotificationCenter = gf("createNotificationCenter");
  var BEATS = typeof globalThis !== "undefined" ? globalThis.RP_BEATS : null;

  var ZONE_NAMES = ["status", "scene", "cg", "diary", "actions"];
  var store = null;
  if (createZoneStore) {
    store = createZoneStore();
    store.declare("status", { kind: "data" });
    store.declare("scene", { kind: "data" });
    store.declare("cg", { kind: "text" });
    store.declare("diary", { kind: "text" });
    store.declare("actions", { kind: "list" });
  }

  var favorEngines = new Map();
  var FAVOR_STORAGE_KEY = "rp_wire_favor_v1";
  function favorEngineFor(key) {
    if (!favorEngines.has(key)) {
      var engine = createFavorEngine();
      var all = loadJSON(FAVOR_STORAGE_KEY, {});
      if (all && all[key]) {
        try { engine.restore(all[key]); } catch (e) {}
      }
      favorEngines.set(key, engine);
    }
    return favorEngines.get(key);
  }
  function persistFavor(key) {
    var all = loadJSON(FAVOR_STORAGE_KEY, {});
    all[key] = favorEngines.get(key).snapshot();
    saveJSON(FAVOR_STORAGE_KEY, all);
  }

  var sceneMgr = createSceneManager ? createSceneManager() : null;
  var gallery = createCgGallery ? createCgGallery() : null;
  var CG_STORAGE_KEY = "rp_wire_cg_v1";
  if (gallery) {
    var savedCg = loadJSON(CG_STORAGE_KEY, null);
    if (savedCg && Array.isArray(savedCg.unlocked)) {
      savedCg.unlocked.forEach(function (id) {
        gallery.register({ id: id, title: id, art: "cg:" + id });
      });
      gallery.restore(savedCg);
    }
  }
  var diaryLog = createDiary ? createDiary() : null;
  var DIARY_STORAGE_KEY = "rp_wire_diary_v1";
  if (diaryLog) {
    var savedDiary = loadJSON(DIARY_STORAGE_KEY, null);
    if (savedDiary) {
      try { diaryLog.restore(savedDiary); } catch (e) {}
    }
  }
  var notices = createNotificationCenter ? createNotificationCenter() : null;
  var stage = createArtStage ? createArtStage() : null;
  var actionMgr = createActionManager ? createActionManager() : null;
  var checker = createCheck ? createCheck() : null;

  /* ---------- 区块抽取 ---------- */
  var ZONE_HINT = /<(status|scene|cg|diary|actions)[\s>]/;
  function extractZones(text) {
    var found = {};
    var clean = text;
    ZONE_NAMES.forEach(function (z) {
      var re = new RegExp("<" + z + ">([\\s\\S]*?)</" + z + ">", "g");
      var m, last = null;
      while ((m = re.exec(text)) !== null) { last = m[1]; }
      if (last !== null) found[z] = last;
      clean = clean.replace(re, "");
    });
    return { found: found, clean: clean };
  }

  /* ---------- 结算步骤（onturn 编排，失败隔离） ---------- */
  var orchestrator = createTurnOrchestrator ? createTurnOrchestrator() : null;
  if (orchestrator) {
    orchestrator.register("zones", function (ctx) {
      var ex = extractZones(ctx.rawText);
      ctx.zonesRaw = ex.found;
      ctx.zones = {};
      ctx.cleanText = Object.keys(ex.found).length
        ? ex.clean.replace(/\n{3,}/g, "\n\n").trim()
        : ctx.rawText;
      if (store) {
        store.begin();
        Object.keys(ex.found).forEach(function (z) {
          store.feed(z, "<" + z + ">" + ex.found[z] + "</" + z + ">");
          var v = store.get(z);
          if (v !== undefined) ctx.zones[z] = v;
        });
      }
      return Object.keys(ex.found);
    });

    orchestrator.register("favor", function (ctx) {
      ctx.favorChanges = [];
      if (!createFavorEngine || !ctx.zones.status) return 0;
      var key = (ctx.runId || "") + "|" + (ctx.name || "");
      var engine = favorEngineFor(key);
      var res = engine.applyStatus(ctx.zones.status, { defaultTarget: ctx.name || undefined });
      ctx.favorChanges = res.changes || [];
      ctx.favorChanges.forEach(function (ch) {
        if (notices) {
          notices.post({
            kind: "favor",
            text: ch.name + " 好感 " + (ch.delta > 0 ? "+" + ch.delta : String(ch.delta)) + "（当前 " + ch.total + "）",
            priority: 1
          });
        }
      });
      if (ctx.favorChanges.length) persistFavor(key);
      return ctx.favorChanges.length;
    });

    orchestrator.register("scene", function (ctx) {
      if (!sceneMgr || !ctx.zones.scene) return null;
      var s = ctx.zones.scene;
      var loc = s["地点"];
      if (typeof loc === "string" && loc.trim()) {
        var zid = "zone:" + loc.trim();
        sceneMgr.defineLocation(zid, { name: loc.trim(), backgrounds: { default: "zonebg:" + loc.trim() } });
        sceneMgr.enter(zid);
      }
      if (typeof s["时段"] === "string") sceneMgr.setTime(s["时段"].trim());
      if (typeof s["天气"] === "string") sceneMgr.setWeather(s["天气"].trim());
      ctx.sceneState = sceneMgr.state();
      return ctx.sceneState;
    });

    orchestrator.register("cg", function (ctx) {
      if (!gallery || typeof ctx.zones.cg !== "string") return false;
      var id = ctx.zones.cg.trim();
      if (!id) return false;
      gallery.register({ id: id, title: id, art: "cg:" + id });
      var first = gallery.unlock(id);
      if (first) {
        if (notices) notices.post({ kind: "cg", text: "解锁新图鉴：" + id, priority: 2 });
        saveJSON(CG_STORAGE_KEY, gallery.snapshot());
      }
      return first;
    });

    orchestrator.register("actions", function (ctx) {
      ctx.pendingActions = null;
      if (!actionMgr || !Array.isArray(ctx.zones.actions) || !ctx.zones.actions.length) return 0;
      ctx.pendingActions = actionMgr.present(ctx.zones.actions);
      return ctx.pendingActions ? ctx.pendingActions.options.length : 0;
    });

    orchestrator.register("diary", function (ctx) {
      if (!diaryLog || typeof ctx.zones.diary !== "string") return 0;
      var body = ctx.zones.diary.trim();
      if (!body) return 0;
      var entry = diaryLog.add({ body: body, category: "story", round: ctx.round });
      if (entry) saveJSON(DIARY_STORAGE_KEY, diaryLog.snapshot());
      return entry ? 1 : 0;
    });

    orchestrator.register("art", function (ctx) {
      ctx.stageChanges = [];
      if (!BEATS || !stage || !ctx.cleanText) return 0;
      var rows = BEATS.parseNarrativeRows(ctx.cleanText);
      var cues = [];
      (rows || []).forEach(function (r) {
        if (r && r["谁"] && r["表情"]) cues.push({ speaker: r["谁"], expression: r["表情"] });
      });
      if (cues.length) ctx.stageChanges = stage.applyCues(cues);
      return ctx.stageChanges.length;
    });

    orchestrator.register("notices", function (ctx) {
      ctx.notices = notices ? notices.drain() : [];
      return ctx.notices.length;
    });
  }

  /* ---------- 对外 ---------- */
  function passthrough(rawText) {
    return { cleanText: rawText, report: null, favorChanges: [], notices: [], pendingActions: null, sceneState: null };
  }

  function settleReply(rawText, opts) {
    opts = opts || {};
    if (!isEnabled() || !orchestrator || typeof rawText !== "string" || !ZONE_HINT.test(rawText)) {
      return Promise.resolve(passthrough(rawText));
    }
    var ctx = { runId: opts.runId || "", name: opts.name || "", rawText: rawText };
    return orchestrator.settle(ctx).then(function (report) {
      if (!report) return passthrough(rawText);
      return {
        cleanText: typeof ctx.cleanText === "string" ? ctx.cleanText : rawText,
        report: report,
        favorChanges: ctx.favorChanges || [],
        notices: ctx.notices || [],
        pendingActions: ctx.pendingActions || null,
        sceneState: ctx.sceneState || null
      };
    });
  }

  var INSTRUCTION = [
    "【结构化状态区块】正文写完后，如本轮有下列变化，在正文之后输出对应区块（没有变化就不要输出，不要在正文里解释这些区块）：",
    "<status> 好感: +3 </status> —— 与当前角色的好感变化（带 + 或 - 号；指向其他角色时写「角色名好感: +3」）",
    "<scene>\n地点: 潇湘馆\n时段: night\n天气: rain\n</scene> —— 地点或时段天气变化时输出（每项一行；时段用 dawn/morning/noon/afternoon/dusk/night/midnight，天气用 clear/cloudy/rain/snow/fog/storm）",
    "<cg>编号</cg> —— 本轮出现值得收录的定格画面时，输出它的编号",
    "<diary>一句话记下本轮大事</diary> —— 出现值得长期记住的事件时输出"
  ].join("\n");

  function instruction() {
    return isEnabled() ? INSTRUCTION : "";
  }

  return {
    settleReply: settleReply,
    instruction: instruction,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    favorOf: function (runId, name) {
      if (!createFavorEngine) return null;
      return favorEngineFor((runId || "") + "|" + (name || "")).favorOf(name);
    },
    engines: {
      store: store,
      scene: sceneMgr,
      gallery: gallery,
      diary: diaryLog,
      notices: notices,
      stage: stage,
      actions: actionMgr,
      checker: checker,
      orchestrator: orchestrator
    }
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = RP_WIRING;
}
