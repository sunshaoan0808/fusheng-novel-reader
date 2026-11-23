/* v42 聊天分排：旁白/对白切分（js/app_ui.js chatSegHTML）
 * 纯函数，vm 里只载 escutil + app_ui.js；断言切分结果与「每块是合法 HTML」。 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const ctx = {console, CHAT: {mode: "single", runId: "r", name: "黛玉"}, INDEX: [], icon: () => "<svg></svg>",
  charImg: () => "", allChars: () => [], getHistSafe: () => [], chatHistKey: () => "k"};
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(WWW, "rp/escutil.js"), "utf8"), ctx);
vm.runInContext("const esc = escH;", ctx);
vm.runInContext(fs.readFileSync(path.join(WWW, "js/app_ui.js"), "utf8"), ctx);
const seg = (h) => vm.runInContext("chatSegHTML(" + JSON.stringify(h) + ")", ctx);
const kinds = (h) => (seg(h).match(/class="seg seg-(\w+)"/g) || []).map(x => x.replace(/.*seg-/, "").replace('"', ""));
const balanced = (h) => { const st = []; for(const m of h.matchAll(/<(\/?)([a-z0-9]+)[^>]*>/g)){ if(m[1]){ if(st.pop() !== m[2]) return false; } else if(!/^(br|img|hr)$/.test(m[2])) st.push(m[2]); } return !st.length; };

t("无记号整段 = 一个对白块（与 v41 一样一个气泡）", JSON.stringify(kinds("<p>何妨，进来坐罢。</p>")) === '["dlg"]');
t("引号外叙述 = 旁白，引号内 = 对白", JSON.stringify(kinds("<p>她抬眼看你。</p><p>「你来了。」</p>")) === '["nar","dlg"]');
t("同段混排切成三块", JSON.stringify(kinds("<p>她道：「你来了。」然后低头。</p>")) === '["nar","dlg","nar"]');
t("*动作* 是旁白，星号不显示", JSON.stringify(kinds("<p>*她笑了笑*  好啊。</p>")) === '["nar","dlg"]' && seg("<p>*她笑了笑* 好啊。</p>").indexOf("*") < 0);
t("（动作）是旁白，括号保留", JSON.stringify(kinds("<p>（低头不语）</p><p>「好。」</p>")) === '["nar","dlg"]' && seg("<p>（低头不语）</p>").indexOf("（低头不语）") > 0);
t("“”与 &quot; 也算对白", JSON.stringify(kinds("<p>他说“好”。</p>")) === '["nar","dlg","nar"]' && JSON.stringify(kinds("<p>&quot;Hi&quot; she said.</p>")) === '["dlg","nar"]');
t("「」里套『』不提前收", JSON.stringify(kinds("<p>「这一句『冷月』是谁写的？」</p>")) === '["dlg"]');
t("相邻同类块合并", JSON.stringify(kinds("<p>风起。</p><p>竹响。</p><p>「来。」</p>")) === '["nar","dlg"]');
const h1 = seg("<p>她道：<b>「快<mark class=\"hl\">来</mark>」</b>说罢转身。</p>");
t("跨块行内标签闭合再重开，HTML 平衡", balanced(h1) && /<b>「快<mark class="hl">来<\/mark>」<\/b>/.test(h1));
t("&quot; 实体不被拆坏", seg("<p>&quot;Hi&quot; x</p>").indexOf("&quot;Hi&quot;") >= 0);
t("纯空白段被丢弃", (seg("<p>「好」 </p>").match(/seg-/g) || []).length === 1);
t("系统性提示不走分排", !vm.runInContext('chatSegEligible({role:"assistant",content:"⚠️ 出错了"})', ctx)
  && vm.runInContext('chatSegEligible({role:"assistant",content:"「好」"})', ctx)
  && !vm.runInContext('chatSegEligible({role:"user",content:"「好」"})', ctx));

/* OOC 存档（2026-11-23 用户真机实报 v85）：标记摘条后正文照常分排，三样式通用 */
const oocParsed = JSON.parse(vm.runInContext('JSON.stringify(parseOocTag("【OOC 存档·时代泄漏（手机）】她抬眼。"))', ctx));
t("parseOocTag 摘出原因与正文", oocParsed.reason === "时代泄漏（手机）" && oocParsed.rest === "她抬眼。");
t("parseOocTag 非 OOC 消息返回 null", vm.runInContext('parseOocTag("「你来了。」")', ctx) === null);
t("OOC 存档消息按摘条后正文判定分排", vm.runInContext('chatSegEligible({role:"assistant",content:"【OOC 存档·时代泄漏（手机）】她抬眼。「你来了。」"})', ctx)
  && !vm.runInContext('chatSegEligible({role:"assistant",content:"【OOC 存档·时代泄漏】"})', ctx));
t("OOC 存档正文分排：旁白/对白切开", JSON.stringify(kinds("<p>她抬眼看你。</p><p>「你来了。」</p>")) === '["nar","dlg"]'
  && seg("<p>她抬眼看你。</p><p>「你来了。」</p>").indexOf("OOC") < 0);

/* v42-2 角色页：台词 / 性格词取自卡上已有字段 */
const Q = (c) => vm.runInContext("JSON.stringify(cardQuote(" + JSON.stringify(c) + "))", ctx);
const TT = (c) => vm.runInContext("JSON.stringify(cardTraitTags(" + JSON.stringify(c) + "))", ctx);
t("台词取 typical_lines 中最接近 16 字的一句并去引号", JSON.parse(Q({fields:{typical_lines:{v:"",items:["「宝玉，你好……」","「不是东风压了西风，就是西风压了东风。」"]}}})).text === "不是东风压了西风，就是西风压了东风。");
t("台词去掉证据标注 [S026]", JSON.parse(Q({fields:{typical_lines:"- 「今晚不折腾你了，上来躺着」（[S026]）- 「辛苦了」"}})).text === "今晚不折腾你了，上来躺着");
t("无台词退回身份一句话（非引语）", JSON.parse(Q({fields:{core_identity:"巡盐御史之女"}})).quote === false);
t("什么都没有返回 null", Q({fields:{}}) === "null");
t("性格词：切短词、去括注、最多 5 个", TT({fields:{core_traits:"情深惜物悲悯；诗才敏捷词锋尖俏；心软口硬；客居自敛、屈辱敏感；心事深藏；伤春自怜", temperament_type:"阴冷（6/10）"}}) === JSON.stringify(["情深惜物悲悯","心软口硬","客居自敛","屈辱敏感","心事深藏"]));
/* 场景模板卡：协议原文现抽现剥（2026-11-23 用户截图形状：错括号 + <scene>/<diary> 整段漏出） */
const segTail = JSON.parse(vm.runInContext('JSON.stringify(parseSceneTail("她别扭地应了。\\n〚+25分钟〛\\n〚地点=市中心医院门诊走廊〛\\n〚在场=杨蓉，周明远〛\\n<scene>\\n地点：市中心医院门诊走廊\\n时段: morning\\n天气: cloudy\\n</scene>\\n<diary>9月30日上午，杨蓉送你到医院复查，撞见周明远。</diary>"))', ctx));
t("parseSceneTail 抽出场景卡字段", segTail.card && segTail.card.place === "市中心医院门诊走廊" && segTail.card.period === "morning" && segTail.card.weather === "cloudy" && segTail.card.timeAdd === 25 && segTail.card.present.join(",") === "杨蓉,周明远" && segTail.card.diary.indexOf("周明远") >= 0);
t("parseSceneTail 正文不留协议原文", segTail.rest.indexOf("〚") < 0 && segTail.rest.indexOf("<scene>") < 0 && segTail.rest.indexOf("<diary>") < 0 && segTail.rest.indexOf("她别扭地应了") >= 0);
t("无协议消息 parseSceneTail 返回 null 卡", vm.runInContext('parseSceneTail("「你来了。」").card', ctx) === null);
const segCardHTML = vm.runInContext('sceneCardHTML({place:"市中心医院门诊走廊", period:"morning", weather:"cloudy", timeAdd:25, present:["杨蓉","周明远"], diary:"撞见周明远"})', ctx);
t("sceneCardHTML 出固定模板（地点/上午/阴/+25分钟/大事记）", segCardHTML.indexOf("scenetpl") >= 0 && segCardHTML.indexOf("市中心医院门诊走廊") >= 0 && segCardHTML.indexOf("上午") >= 0 && segCardHTML.indexOf("阴") >= 0 && segCardHTML.indexOf("+25分钟") >= 0 && segCardHTML.indexOf("大事记") >= 0);
const prefsSrc2 = fs.readFileSync(path.join(WWW, "js", "app_prefs.js"), "utf8");
t("renderChat 接了场景卡（m.scene + parseSceneTail 兜底）", prefsSrc2.indexOf("parseSceneTail(body)") >= 0 && prefsSrc2.indexOf("sceneHTML") >= 0 && prefsSrc2.indexOf("m.scene") >= 0);
const chatSrc2 = fs.readFileSync(path.join(WWW, "rp", "chat.js"), "utf8");
t("chat.js 四路把 sceneCard 存到消息", (chatSrc2.match(/\.scene = wire\w+\.sceneCard/g) || []).length === 4);
const ui42Css2 = fs.readFileSync(path.join(WWW, "ui42.css"), "utf8");
t("ui42 有 scenetpl 样式", ui42Css2.indexOf(".scenetpl") >= 0);
console.log(`ui42_seg: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
