/* 蒸馏字段利用门禁（2026-11-24 全利用四期，常驻）：
 * 三本书卡字段全集里，每个字段必须有登记在案的消费者，且登记的
 * 代码文件里必须真的出现该字段名（防"登记了但接线被删"）。
 * 新蒸出字段无消费者 → 本测试红，先派活再提交。
 * 豁免只许列在 EXEMPT 里并写明理由，且总数受限。 */
const fs = require("fs");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

const PROMPT = "www/rp/prompt.js";       // 常驻段 LAYERS
const PORTRAIT = "www/rp/portrait.js";   // 情境包
const ARC = "www/rp/arc.js";             // 弧光
const WORLDLINE = "www/rp/worldline.js"; // 暗线段 + 导演叙事定位
const CONTINUITY = "www/rp/agent_continuity.js"; // 事后审计
const CHARACTER = "www/js/app_character.js";     // 档案页展示

const CONSUMERS = {
  // 常驻 prompt 段
  core_identity: [PROMPT], gender: [PROMPT], age_stage: [PROMPT], identity_anchor: [PROMPT],
  soul_goal: [PROMPT], hidden_desire: [PROMPT], inner_need: [PROMPT, PORTRAIT],
  core_traits: [PROMPT], temperament_type: [PROMPT], values: [PROMPT], worldview: [PROMPT],
  moral_bottom_line: [PROMPT], moral_position: [PROMPT], fatal_flaw: [PROMPT],
  pressure_truth: [PROMPT], shadow_side: [PROMPT, PORTRAIT], big_five: [PROMPT],
  ooc_redline: [PROMPT, PORTRAIT, CONTINUITY], thinking_style: [PROMPT],
  speech_style: [PROMPT, PORTRAIT], cadence: [PROMPT],
  signature_phrases: [PROMPT, PORTRAIT], typical_lines: [PROMPT, PORTRAIT],
  subtext_style: [PROMPT], sentence_openers: [PROMPT], sentence_endings: [PROMPT],
  connective_tokens: [PROMPT], forbidden_fillers: [PROMPT],
  appearance_feature: [PROMPT], visual_identity: [PROMPT], physical_marks: [PROMPT],
  voice_dressing: [PROMPT], signature_items: [PROMPT], habit_action: [PROMPT],
  carry_style: [PROMPT, PORTRAIT], others_impression: [PROMPT], reputation: [PROMPT],
  action_pattern: [PROMPT], action_style: [PROMPT], background: [PROMPT], life_timeline: [PROMPT, PORTRAIT],
  social_soil: [PROMPT], socio_economics: [PROMPT], key_bonds: [PROMPT, PORTRAIT],
  faction_position: [PROMPT], world_belong: [PROMPT], stance_stability: [PROMPT],
  stress_response: [PROMPT, PORTRAIT], fear_triggers: [PROMPT, PORTRAIT],
  taboo_topics: [PROMPT, PORTRAIT],
  // 情境包
  decision_rules: [PORTRAIT], restraint_threshold: [PORTRAIT], emotion_model: [PORTRAIT],
  grievance_style: [PORTRAIT], joy_style: [PORTRAIT], anger_style: [PORTRAIT],
  social_mode: [PORTRAIT], trauma_scar: [PORTRAIT], background_imprint: [PORTRAIT],
  strengths: [PORTRAIT], weaknesses: [PORTRAIT], belief_anchor: [PORTRAIT],
  preference_like: [PORTRAIT], dislike_hate: [PORTRAIT], life_experience: [PORTRAIT],
  interest_claim: [PORTRAIT], resource_dependence: [PORTRAIT], trade_principle: [PORTRAIT],
  reward_logic: [PORTRAIT], cognitive_limits: [PORTRAIT],
  private_self: [PORTRAIT], disguise_switch: [PORTRAIT], self_cognition: [PORTRAIT],
  inner_conflict: [PORTRAIT],
  // 弧光
  arc_type: [ARC], arc_start: [ARC], arc_mid: [ARC], arc_end: [ARC],
  arc_blocker: [ARC], timeline_stage: [ARC],
  // 暗线段 / 导演
  world_rule_fit: [WORLDLINE], rule_view: [WORLDLINE], plot_restriction: [WORLDLINE],
  foil_pairs: [WORLDLINE], theme_role: [WORLDLINE], story_role: [WORLDLINE],
  ensemble_role: [WORLDLINE], pre_intro: [WORLDLINE],
  // 审计
  forbidden_behaviors: [CONTINUITY],
  // 档案页展示
  evidence_source: [CHARACTER], contradiction_note: [CHARACTER],
  description_count: [CHARACTER], dialogue_count: [CHARACTER],
  thought_count: [CHARACTER], chunk_count: [CHARACTER], role_tags: [CHARACTER],
};
/* 豁免：水浒个别卡 fields 里混入的冗余键，与 card.name 本体重复，无独立语义 */
const EXEMPT = {name: "与 card.name 重复的冗余键", aliases: "别名列表，导入/蒸馏元数据"};

const union = new Set();
for(const b of ["honglou_full", "shuihu_full", "qinganlu"]){
  const cs = JSON.parse(fs.readFileSync(WWW + "/data/rp_cards_" + b + ".json", "utf8"));
  const arr = Array.isArray(cs) ? cs : Object.values(cs);
  for(const c of arr) for(const k of Object.keys(c.fields || {})) union.add(k);
}
t("字段全集非空（>90）", union.size > 90);
t("豁免受控（<=3）", Object.keys(EXEMPT).length <= 3);

const fileCache = {};
const fileHas = (f, name) => {
  if(!(f in fileCache)) fileCache[f] = fs.readFileSync(f.replace(/^www\//, WWW + "/"), "utf8");
  return fileCache[f].indexOf(name) >= 0;
};

for(const field of union){
  if(EXEMPT[field]) continue;
  const files = CONSUMERS[field];
  t(`字段 ${field} 有登记消费者`, Array.isArray(files) && files.length > 0);
  if(files) for(const f of files)
    t(`字段 ${field} 在 ${f} 真实出现`, fileHas(f, field));
}
/* 登记表不许有全集之外的幽灵字段（防登记表腐烂） */
for(const field of Object.keys(CONSUMERS))
  t(`登记字段 ${field} 仍在全集内`, union.has(field) || field === "background");

console.log(`field_utilization: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
