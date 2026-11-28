/* 角色自动发现 (2026-10-07 v2): 借鉴 NER4Novel 两遍式。
 * 第一遍: 规则粗提 (对话标签 + 高频2-4字词 + 称谓模式)
 * 第二遍: LLM 确认 + 别名归一
 * 输出: [{name, count, aliases[], importance}]
 */
var DISTILL_DISCOVER = (function(){
"use strict";

// 泛称过滤: 这些不是具体人物
var GENERIC_WORDS = ["门子","公子","小姐","夫人","太太","奶奶","爷","老爷","少爷",
  "姑娘","大人","将军","丞相","王爷","皇上","娘娘","先生","师父","师傅","老师","妈妈","爸爸","爷爷","外公","外婆",
  "大哥","二哥","大姐","妹妹","哥哥","弟弟","姐姐","父亲","母亲","爹","娘",
  "众人","大家","小厮","丫鬟","婆子","丫头","仆人","下人","小厮","老者","道人",
  "和尚","尼姑","道士","书生","秀才","举人","进士","官员","差役","衙役"];

function isGeneric(name){
  return GENERIC_WORDS.indexOf(name) >= 0;
}

// 停用词: 姓氏滑窗误伤的高频非人名词（2026-10-10 实测补）
var STOP_WORDS = {};
var STOP_PHRASES = ("那个 那些 这个 这些 这里 那里 哪里 什么 怎么 为什么 如此 这样 那样 别的 别处 每当 当时 同时 之后 之前 之间 之中 之下 之上 以内 以外 以来 一起 一样 一般 一同 一切 一共 一度 一番 一家 一事 一种 一旁 一侧 一头 一边 一面 一会儿 一时 一刻 一秒 一分 一天 一月 一年 一世 一生 一辈子 东西 南北 上下 左右 前后 里外 中间 中央 当中 之内 之外 以前 以后 期间 时候 时刻 时辰 时光 时间 年代 年份 月份 日期 春夏秋冬 晨昏昼夜 今明昨 早晚 午夜 半夜 凌晨 傍晚 黄昏 清晨 正午 天地 乾坤 宇宙 世界 人间 世间 尘世 红尘 江湖 武林 朝廷 官府 衙门 客栈 酒楼 茶馆 庙宇 寺庙 道观 祠堂 山洞 洞穴 山谷 山峰 山顶 山脚 山路 官道 大道 小道 小路 街巷 村庄 城镇 城池 都城 京城 皇宫 宫殿 大殿 书房 书院 学堂 广场 市场 集市 灯会 烟火 歌舞 戏曲 拳脚 刀枪 暗器 毒药 解药 丹药 灵丹 真气 灵力 法力 修为 境界 品级 实力 势力 帮派 门派 宗门 家族 世家 豪门 贵族 皇族 大臣 武将 文官 谋士 军师 卫兵 侍卫 宾客 客人 贵客 主人 奴仆 随从 跟班 小厮 书童 弟子 门徒 徒弟 师兄 师弟 师姐 师妹 同门 秘籍 宝典 阵法 禁制 结界 封印 符箓 咒语 因果 轮回 转世 温柔 怀里 双手 方才 任何 那根 那股 子的 里的 上的 人的 有一 那一 低声 高声 大声 轻声 低低 轻轻 微微 悄悄 默默 暗暗 偷偷 满足 满意 满意地 不清 不楚 都不知 正要 将要 就要 快要 每一 每个 各位 诸位 那双 这双 双眼 眼睛 目光 眼神 眉眼 口鼻 嘴唇 嘴角 舌尖 牙齿 头发 发丝 青丝 衣衫 衣裙 长袍 衣袖 袖口 领口 腰带 玉佩 香囊 荷包 手帕 帕子 棉被 被褥 枕头 床榻 床帐 帷幔 帘子 门帘 窗户 窗棂 房门 屋门 院门 院墙 围墙 高墙 城墙 房顶 屋顶 瓦片 青瓦 梁柱 门框 台阶 石阶 石径 小径 路边 道旁 林间 林中 树下 花下 月下 灯下 烛光 火光 电光 剑光 刀光 寒光 冷光 金光 银光 白光 红光 蓝光 绿光 紫光 黑光 灰光 暗光 微光 余光 眼角 眉梢 心头 心间 心底 心底深处 脑海 脑中 耳边 耳畔 身后 身前 身旁 身侧 左右 两侧 对面 前方 后方 上方 下方 头顶 脚下 足下 身下 体内 体外 周身 全身 浑身 满身 一身 通体 遍体 鳞伤 伤痕 血痕 血迹 血渍 汗水 泪水 雨水 露水 晨露 霜降 冰雪 风雪 雨雪 阴云 乌云 浓云 烟云 云雾 雾气 水汽 热气 暑气 寒气 冷气 凉气 暖气 香气 臭气 腥气 血腥 杀气 戾气 怨气 怒气 火气 脾气 性子 性情 秉性 本性 天性 野性 魔性 妖性 鬼性 神性 佛性 慧根 灵根 仙骨 道骨 凡骨 肉身 法身 金身 真身 化身 分身 投影 虚影 残影 幻影 幻象 假象 真相 实情 内情 隐情 苦衷 难处 处境 境地 田地 下场 结局 收场 落幕 开场 开端 肇始 缘起 前缘 宿缘 孽缘 情缘 尘缘 佛缘 仙缘 机缘 造化 气数 定数 变数 异数").split(" ");
STOP_PHRASES.forEach(function(w){ STOP_WORDS[w] = true; });
function isStopWord(name){ return !!STOP_WORDS[name]; }

// 别名清洗: 去动词尾，去截断碎片
var VERB_TAIL = "说道问叹笑应答喊骂哭嚷道着了过";
function cleanAlias(alias, canonical){
  // 去尾部动词
  while(alias.length > 2 && VERB_TAIL.indexOf(alias[alias.length-1]) >= 0){
    alias = alias.slice(0, -1);
  }
  // 如果是正名的截断碎片 (如"王夫" vs "王夫人")，丢弃
  if(canonical && canonical.indexOf(alias) === 0 && alias.length < canonical.length){
    return null;
  }
  // 如果别名包含正名或被正名包含，保留
  return alias.length >= 2 ? alias : null;
}

/* ============ 2026-11-28 别名归一调研落地四项 (文献借鉴, 见调研报告) ============
 * ①多路召回: 词频之外开提名通道 (敬称构词/老小阿前缀), 提名只负责送判定, 不负责定性
 * ②叙述者通道: 第一人称密度检测 + 自称姓名正则, 保证叙述者必进判定池
 * ③反边层 cannot-link: 确定性禁令, LLM 说合也不许合 (防灾难性误并)
 * ④证据门: LLM 去重合并必须给逐字原文引文, 无证据的合并作废 (在 dedupeCharacters) */
var CL_SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴鬱胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍卻璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公万俟";

/* 提名通道扫描: 返回 {提名: 出现次数}。敬称构词 (汪教授/苏小姐/方老太太/杨母)、
 * 老X (老杨/老杨头)、小X (小远, 第二字过停用表压噪声)、阿X (阿青)。 */
/* 注意: 只放具体名词字 (心声脸手…), 不放远/明/高这类字 —— 小远/小明/小高都是正经小名 */
var XIAO_STOP = "心声脸手脚眼耳口头身事路店门窗衣饭茶水酒烟钱书信画歌舞剑刀枪车船灯火风水山石花草鸟鱼猫狗区屋院腿臂腹穴电熊跑巧偷时孩的间候小";
/* 小X 提名还须带人物语境: 紧跟动作/言说动词, 或呼语形态 (小远，你…/小远！)。
 * 否则小时/小区/小屋这类常用词会把提名通道灌满 (真书回归实测教训)。 */
var XIAO_VERB = "说道问笑喊叫哭走跑站坐看望盯拉推点头摇头转身回头伸手挥手拍";
function scanNominations(text){
  var nom = {};
  var xiaoCtx = {}, xiaoNames = {};
  function bump(name){
    if(!name || name.length < 2 || name.length > 4) return;
    if(isGeneric(name) || isStopWord(name)) return;
    nom[name] = (nom[name] || 0) + 1;
  }
  var m;
  var sufRe = new RegExp("[" + CL_SURNAMES + "][\\u4e00-\\u9fa5]{0,2}(?:教授|先生|小姐|夫人|太太|老爷|奶奶|爷爷|老师|医生|师傅|大夫|老板|掌柜|母|父|姐|哥|婶|姨|叔|伯|嫂)", "g");
  while((m = sufRe.exec(text))) bump(m[0]);
  var laoRe = new RegExp("老[" + CL_SURNAMES + "](?:[头子儿婆爷])?", "g");
  while((m = laoRe.exec(text))){ if(m[0] !== "老家") bump(m[0]); }
  var xiaoRe = /小([\u4e00-\u9fa5])/g;
  while((m = xiaoRe.exec(text))){
    if(XIAO_STOP.indexOf(m[1]) >= 0) continue;
    var xname = "小" + m[1];
    xiaoNames[xname] = true;
    bump(xname); /* 计数记总出现次数 (展示/排序用), 语境命中只作提名资格 */
    var a1 = text.charAt(m.index + 2), a2 = text.charAt(m.index + 3);
    var ctxOk = XIAO_VERB.indexOf(a1) >= 0 || a1 === "：" || a1 === "！"
      || (a1 === "，" && "你我他她快来去".indexOf(a2) >= 0);
    if(ctxOk) xiaoCtx[xname] = (xiaoCtx[xname] || 0) + 1;
  }
  Object.keys(xiaoNames).forEach(function(n){
    if((xiaoCtx[n] || 0) < 2) delete nom[n];
  });
  var aRe = /阿([\u4e00-\u9fa5])/g;
  while((m = aRe.exec(text))){ if("弥陀".indexOf(m[1]) < 0) bump("阿" + m[1]); }
  return nom;
}

/* 自称线索: 全书所有「我叫X/我的名字是X/我是X」句式。注意线索未必是叙述者的 ——
 * 对话里配角也会自报姓名 (真书实测: 陈青的名片句排在林远的自称句之前, 按首命中
 * 猜本名必错)。所以线索只作证据交给 LLM 结合视角裁决, 不在这里下结论。 */
function selfIntroClues(text){
  var pats = [/我叫([\u4e00-\u9fa5]{2,3})/g, /我的名字(?:是|叫)([\u4e00-\u9fa5]{2,3})/g, /我是([\u4e00-\u9fa5]{2,3})[，。！？；]/g];
  var names = [], intros = [];
  pats.forEach(function(re){
    var m;
    while((m = re.exec(text))){
      var nm = m[1];
      while(nm.length > 2 && "是的了在就都也还又才只已正将要会能可".indexOf(nm[nm.length - 1]) >= 0) nm = nm.slice(0, -1);
      if(nm.length >= 2 && !isGeneric(nm) && !isStopWord(nm) && names.indexOf(nm) < 0) names.push(nm);
      if(intros.length < 5){
        var s0 = Math.max(text.lastIndexOf("。", m.index), text.lastIndexOf("\n", m.index)) + 1;
        var e0 = m.index + m[0].length;
        var rest = text.slice(e0, e0 + 80);
        var cut = rest.search(/[。！？\n]/);
        var sent = text.slice(s0, cut >= 0 ? e0 + cut + 1 : e0 + 40).trim();
        if(sent && intros.indexOf(sent) < 0) intros.push(sent.slice(0, 120));
      }
    }
  });
  return { names: names, intros: intros };
}

/* 叙述者探测: 「我」的密度判第一人称; 自称线索只收集不裁决 (裁决在 LLM) */
function probeNarrator(text){
  var total = 0, i = 0;
  while((i = text.indexOf("我", i)) >= 0){ total++; i += 1; }
  var density = text.length ? total * 1000 / text.length : 0;
  var clues = selfIntroClues(text);
  return { firstPerson: density >= 5 && total >= 150, count: total, selfNames: clues.names, intros: clues.intros };
}

/* 反边层: 两个称呼在任何情况下都不许合并为一人, 返回 true 表示禁合。
 * 规则: 同姓不同名 (互不包含)、敬称性别冲突、原文中同段互动 (互相称呼/双说话人)。
 * 「叙述者」不设反边 —— 它可以锚定到任何人, 由证据门把关。 */
var CL_MALE_SUF = ["先生", "老爷", "爷爷", "少爷", "公子", "叔", "伯", "父", "爹", "哥", "弟"];
var CL_FEMALE_SUF = ["小姐", "夫人", "太太", "奶奶", "姑娘", "婶", "姨", "母", "娘", "姐", "妹", "嫂"];
function clGenderSuf(name){
  var i;
  for(i = 0; i < CL_MALE_SUF.length; i++) if(name.slice(-CL_MALE_SUF[i].length) === CL_MALE_SUF[i]) return "m";
  for(i = 0; i < CL_FEMALE_SUF.length; i++) if(name.slice(-CL_FEMALE_SUF[i].length) === CL_FEMALE_SUF[i]) return "f";
  return "";
}
function clInteract(p, a, b){
  var verbs = ["说道", "问道", "笑道", "喊道", "答道", "骂道", "哭道"];
  function speaks(n){
    for(var i = 0; i < verbs.length; i++) if(p.indexOf(n + verbs[i]) >= 0) return true;
    return p.indexOf(n + "说") >= 0;
  }
  if(speaks(a) && speaks(b)) return true;
  var mids = ["对", "向", "朝", "跟", "和", "拉着", "看着", "望着", "盯着", "指着", "冲着"];
  for(var i = 0; i < mids.length; i++){
    if(p.indexOf(a + mids[i] + b) >= 0 || p.indexOf(b + mids[i] + a) >= 0) return true;
  }
  return false;
}
function cannotLink(a, b, paragraphs){
  if(!a || !b || a === b) return false;
  if(a === "叙述者" || b === "叙述者") return false;
  if(a.length >= 2 && b.length >= 2 && a.charAt(0) === b.charAt(0)
    && CL_SURNAMES.indexOf(a.charAt(0)) >= 0
    && a.indexOf(b) < 0 && b.indexOf(a) < 0){
    /* 昵称/碎片形态不拦: 姓后是「头子儿婆」单字后缀 (杨头~杨老头) 或带小/老前缀
     * (林远~林小远) 时可能是同一人, 交给判定与证据门; 拦的只是两个完整本名。 */
    var ra = a.slice(1), rb = b.slice(1);
    var frag = function(r){ return (r.length === 1 && "头子儿婆".indexOf(r) >= 0) || r.charAt(0) === "小" || r.charAt(0) === "老"; };
    if(!frag(ra) && !frag(rb)) return true;
  }
  var ga = clGenderSuf(a), gb = clGenderSuf(b);
  if(ga && gb && ga !== gb) return true;
  if(paragraphs){
    for(var i = 0; i < paragraphs.length; i++){
      var p = paragraphs[i];
      if(p.indexOf(a) < 0 || p.indexOf(b) < 0) continue;
      if(clInteract(p, a, b)) return true;
    }
  }
  return false;
}

// 第一遍: 规则提取候选
function extractCandidates(text, opts){
  opts = opts || {};
  var minCount = opts.minCount || 5;
  var freq = {};
  var tagBonus = {}; // 对话标签命中的候选，质量更高

  // 1. 对话标签中的名字 (复用 speaker 逻辑简化版)
  // 收紧：排除"的/他/她/它/这/那"开头（"他说"不是名字），排除"接着说"类副词+说；
  // 只取 2-3 字（4 字多为"压低声音"类状语）；
  // 强信号：名字前是标点/句首（"，凌安说道"），"微微一笑"这类紧贴动词的状语会被弱化
  var tagRe = /(^|[，。！？；：“”"'\s])([\u4e00-\u9fa5]{2,3})(?:笑道|问道|说道|叹道|忙道|答道|回道|骂道|哭道|喊道|道|说|笑|问)/g;
  var m;
  var TAIL = "笑说道问叹应的了着过";
  function cleanTail(s){ while(s.length > 2 && TAIL.indexOf(s[s.length-1]) >= 0) s = s.slice(0, -1); return s; }
  while((m = tagRe.exec(text))){
    var name = cleanTail(m[2]);
    // 过滤：代词开头、副词+说结构、尾部否定词（"凌安没说"→"凌安没"非名）
    if(/^[他她它这那]/.test(name)) continue;
    if(/[没不别]$/.test(name)) continue;
    if(/(?:接着|跟着|随后|于是|然后|便|就|却|倒|竟|还|又|也|都|只|单|空|白|硬|死|苦|笑|哭|喊|骂)说$/.test(m[0])) continue;
    if(name.length >= 2){ freq[name] = (freq[name] || 0) + 1; tagBonus[name] = true; }
  }

  // 2. 高频 2-4 字词 (简化版，不用分词，用滑动窗口统计)
  // 为性能，只统计对话标签附近和常见姓氏开头的
  var surnames = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴鬱胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍卻璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公万俟司马上官欧阳夏侯诸葛闻人东方赫连皇甫尉迟公羊澹台公冶宗政濮阳淳于单于太叔申屠公孙仲孙轩辕令狐钟离宇文长孙慕容鲜于闾丘司徒司空亓官司寇仉督子车颛孙端木巫马公西漆雕乐正壤驷公良拓跋夹谷宰父谷梁晋楚闫法汝鄢涂钦段干百里东郭南门呼延归海羊舌微生岳帅缑亢况郈有琴梁丘左丘东门西门商牟佘佴伯赏南宫墨哈谯笪年爱阳佟";
  var surnameSet = {};
  for(var i = 0; i < surnames.length; i++) surnameSet[surnames[i]] = true;

  // 滑动窗口找姓氏开头的 2-3 字组合
  var windowSize = 50000; // 分段处理防卡死
  for(var seg = 0; seg < text.length; seg += windowSize){
    var segText = text.slice(seg, seg + windowSize);
    for(var j = 0; j < segText.length - 3; j++){
      var ch = segText[j];
      if(surnameSet[ch]){
        // 尝试 2字、3字
        for(var len = 2; len <= 3; len++){
          var word = segText.slice(j, j + len);
          if(/^[\u4e00-\u9fa5]{2,3}$/.test(word)){
            // 排除明显不是名字的 (后接"的/了/着"等)
            var next = segText[j + len];
            if(next && "的了着过和与在".indexOf(next) < 0){
              freq[word] = (freq[word] || 0) + 1;
            }
          }
        }
      }
    }
  }

  // 过滤低频 + 泛称 + 停用词；剥离尾部的"的"并合并计数（"凌安的"→"凌安"）
  var merged = {};
  Object.keys(freq).forEach(function(name){
    var base = name;
    if(base.length > 2 && base[base.length-1] === "的") base = base.slice(0, -1);
    if(base.length < 2) return;
    merged[base] = (merged[base] || 0) + freq[name];
    if(tagBonus[name]) tagBonus[base] = true;
  });
  // 多路召回 (2026-11-28): 提名通道的结果并入候选池, 提名/对话标签命中的候选
  // 只需出现 ≥2 次即可入池 —— 词频门槛只管裸滑窗通道, 不再一刀切漏掉低频真角色
  var nominated = {};
  var coreCount = {};
  var nomMap = scanNominations(text);
  Object.keys(nomMap).forEach(function(name){
    if(nomMap[name] < 2) return;
    nominated[name] = true;
    coreCount[name] = merged[name] || 0;
    if(merged[name] == null) merged[name] = nomMap[name];
    else merged[name] = Math.max(merged[name], nomMap[name]);
  });
  var cands = [];
  Object.keys(merged).forEach(function(name){
    var cnt = merged[name];
    if(cnt < minCount && !(nominated[name] && cnt >= 2) && !(tagBonus[name] && cnt >= 2)) return;
    if(isGeneric(name) || isStopWord(name)) return;
    /* nomOnly: 只靠提名才够格的核心池外候选, 名额分配时单独排队, 不许挤掉核心池 */
    var nomOnly = !!nominated[name] && (coreCount[name] || 0) < minCount && !(tagBonus[name] && (coreCount[name] || 0) >= 2);
    cands.push({name: name, count: cnt, tagHit: !!tagBonus[name], nominated: !!nominated[name], nomOnly: nomOnly});
  });
  // 对话标签命中的优先，其次按频次
  cands.sort(function(a, b){
    if(!!a.tagHit !== !!b.tagHit) return a.tagHit ? -1 : 1;
    return b.count - a.count;
  });
  /* 名额分配 (真书回归教训): 核心池 (词频/对话标签) 先坐满 80 席 —— 林远这类
   * 排 60 多名的真角色不能被提名噪声挤出池; 提名独有候选随后补满 100 席;
   * 还有空位再回填核心池余部。 */
  var coreList = cands.filter(function(c){ return !c.nomOnly; });
  var nomList = cands.filter(function(c){ return c.nomOnly; });
  var picked = coreList.slice(0, 80);
  var inPicked = {};
  picked.forEach(function(c){ inPicked[c.name] = true; });
  nomList.forEach(function(c){
    if(picked.length < 100 && !inPicked[c.name]){ picked.push(c); inPicked[c.name] = true; }
  });
  coreList.slice(80).forEach(function(c){
    if(picked.length < 100 && !inPicked[c.name]){ picked.push(c); inPicked[c.name] = true; }
  });
  return picked;
}

// 第二遍: LLM 确认 + 别名归一
// 为每个候选提取 N 条证据句（名字出现的原句），供 LLM 快速判断是否为真角色
// sentences 可由调用方预先切好复用：对 30 个候选各切一次全文是纯浪费（30 万字实测 747ms）
function extractEvidence(text, name, n, sentences){
  n = n || 5;
  var out = [];
  // 按句切分（。！？\n），找包含名字的句子
  var list = sentences || String(text == null ? "" : text).split(/[。！？\n]+/);
  for(var i = 0; i < list.length && out.length < n; i++){
    var raw = list[i];
    // 先做最便宜的 indexOf, 命中才 trim —— trim 每次都会新建字符串, 对 Top30 各扫一遍全句时占大头
    if(raw.indexOf(name) < 0) continue;
    var s = raw.trim();
    if(s.length >= 8 && s.length <= 120){
      // 去重：太相似的跳过
      var dup = out.some(function(e){ return e === s; });
      if(!dup) out.push(s);
    }
  }
  return out;
}

/* 段落上下文提取 (2026-11-28 用户拍板): 名字连同它所在的段落、上一段、下一段
 * 一起交给 LLM 判断。证据句是碎片, 段落上下文能看出名字到底指人、指物还是
 * 只是常用词的一部分; 第一人称叙事的主角名出现次数少, 也靠上下文翻案。 */
function splitParagraphs(text){
  return String(text == null ? "" : text).split(/\n+/).map(function(p){ return p.trim(); })
    .filter(function(p){ return p.length > 0; });
}
function countOcc(hay, needle){
  var n = 0, i = 0;
  while(needle && (i = hay.indexOf(needle, i)) >= 0){ n++; i += needle.length; }
  return n;
}
/* 取名字出现最集中的一段 (并列取最早), 前后各带一段; 每段限长防 token 爆炸 */
function extractContext(name, paragraphs){
  var best = -1, bestN = 0;
  for(var i = 0; i < paragraphs.length; i++){
    var n = countOcc(paragraphs[i], name);
    if(n > bestN){ bestN = n; best = i; }
  }
  if(best < 0) return "";
  function cap(t, max){ return t.length > max ? t.slice(0, max) + "…" : t; }
  var parts = [];
  if(best > 0) parts.push("【上段】" + cap(paragraphs[best - 1], 200));
  parts.push("【本段】" + cap(paragraphs[best], 320));
  if(best < paragraphs.length - 1) parts.push("【下段】" + cap(paragraphs[best + 1], 200));
  return parts.join("\n");
}

/* 宽容解析 LLM 返回的 JSON 对象: 先按贪婪匹配整段试解; 失败再从第一个 {
 * 起做括号配平扫描 (跳过字符串内括号), 取第一个完整对象试解。
 * 实测失败形态: 模型在 JSON 前后多写了带花括号的文字, 贪婪匹配把两段拼成非法串。 */
function parseJsonObj(text){
  var m = String(text == null ? "" : text).match(/\{[\s\S]*\}/);
  if(m){ try{ return JSON.parse(m[0]); }catch(e){} }
  var t = String(text == null ? "" : text);
  var pos = t.indexOf("{");
  while(pos >= 0){
    var depth = 0, inStr = false, esc = false, end = -1;
    for(var i = pos; i < t.length; i++){
      var ch = t[i];
      if(inStr){
        if(esc) esc = false;
        else if(ch === "\\") esc = true;
        else if(ch === '"') inStr = false;
        continue;
      }
      if(ch === '"') inStr = true;
      else if(ch === "{") depth++;
      else if(ch === "}"){
        depth--;
        if(depth === 0){ end = i; break; }
      }
    }
    if(end < 0) return null;
    try{ return JSON.parse(t.slice(pos, end + 1)); }catch(e){}
    /* 这段不是合法 JSON (如前言里的 {注: …}), 跳过它找下一个对象 */
    pos = t.indexOf("{", end + 1);
  }
  return null;
}

var CONFIRM_SYS = "你是小说角色识别器。从候选名单中确认哪些是真实人物角色, 合并同一人的不同写法。每个候选附了它出现最集中段落的原文上下文 (上段/本段/下段), 依据上下文判断: 名字指代具体人物才是角色; 指代物品、动物、地点、泛称或只是常用词的一部分, 都不是角色。若文本是第一人称叙事, 叙述者本人也是角色, 请结合上下文确认其姓名并保留。同一人有多个候选写法时只返回一人, 正名取更完整者, 其余写法放进 aliases。返回 JSON: {\"characters\": [{\"name\": \"正名\", \"aliases\": [\"别名\"], \"importance\": 1-10, \"reason\": \"一句话推荐理由\"}]}。importance 按戏份打分, reason 说明为什么值得蒸馏 (如: 主角/关键情节推动者/有完整成长弧)。只返回名单里确认的角色, 不要把候选原样全抄回来。候选里若有「叙述者」, 它指第一人称叙事中的「我」: 其上下文附有开篇与若干「自称线索」句, 线索句可能出自他人之口 (对话中别人自报姓名), 须结合叙事视角判断哪一个才是叙述者本人的姓名; 能确认的用真实姓名返回该角色, 确认不了才以「叙述者」为名返回。";

/* 跨批合并: 后批返回的人若与已保留者同名/互为别名/名字互含, 并入已保留者。
 * 反边层把关: 与已保留者 cannotLink 的不许并入, 继续找下一个可并的。 */
function mergeConfirmResults(acc, batch, paragraphs){
  batch.forEach(function(c){
    var hit = null;
    for(var i = 0; i < acc.length; i++){
      var a = acc[i];
      if(cannotLink(a.name, c.name, paragraphs)) continue;
      if(a.name === c.name || a.aliases.indexOf(c.name) >= 0 || c.aliases.indexOf(a.name) >= 0
        || (a.name.length >= 2 && c.name.indexOf(a.name) >= 0) || (c.name.length >= 2 && a.name.indexOf(c.name) >= 0)){ hit = a; break; }
    }
    if(!hit){ acc.push(c); return; }
    if(c.name.length > hit.name.length && hit.aliases.indexOf(hit.name) < 0){
      /* 改名以更完整的写法为准, count 也随正名走 (苏清禾 61 次, 不是含子串的苏清 70 次) */
      hit.aliases.push(hit.name); hit.name = c.name; hit.count = c.count;
    }else{
      if(c.name !== hit.name && hit.aliases.indexOf(c.name) < 0) hit.aliases.push(c.name);
      hit.count = Math.max(hit.count, c.count);
    }
    c.aliases.forEach(function(al){ if(al !== hit.name && hit.aliases.indexOf(al) < 0) hit.aliases.push(al); });
    hit.importance = Math.max(hit.importance, c.importance);
    if(!hit.reason) hit.reason = c.reason;
  });
  return acc;
}

/* 名字变体确定性预合并 (2026-11-28, Vala 名变体规则的本地版): 老杨头/杨老头这类
 * 只差老/小/阿前缀与头/子/儿后缀的机械变体, 不劳 LLM —— 剥成核心形相同就先并,
 * 正名取出现次数最多者。核心形须 ≥2 字且过反边检查, 防把两个人并掉。 */
function variantCore(name){
  var c = name.replace(/^[老小阿]/, "");
  c = c.replace(/[头子儿婆]$/, "");
  if(c.length >= 2 && c.charAt(c.length - 1) === "老") c = c.slice(0, -1);
  return c;
}
function preMergeVariants(results, paragraphs){
  var groups = {};
  var order = [];
  results.forEach(function(r){
    var core = variantCore(r.name);
    var key = (core.length >= 2 || (core.length === 1 && CL_SURNAMES.indexOf(core) >= 0)) ? core : "\u0001" + r.name;
    if(!groups[key]){ groups[key] = []; order.push(key); }
    groups[key].push(r);
  });
  var out = [];
  order.forEach(function(key){
    var g = groups[key].slice().sort(function(a, b){ return b.count - a.count; });
    var head = g[0];
    var merged = {name: head.name, aliases: head.aliases.slice(), importance: head.importance,
      count: head.count, reason: head.reason || ""};
    for(var i = 1; i < g.length; i++){
      if(cannotLink(merged.name, g[i].name, paragraphs)){ out.push(g[i]); continue; }
      if(merged.aliases.indexOf(g[i].name) < 0) merged.aliases.push(g[i].name);
      g[i].aliases.forEach(function(a){ if(a !== merged.name && merged.aliases.indexOf(a) < 0) merged.aliases.push(a); });
      merged.importance = Math.max(merged.importance, g[i].importance);
      if(!merged.reason) merged.reason = g[i].reason || "";
    }
    out.push(merged);
  });
  return out;
}

/* 名单去重 (2026-11-28): 分批判定看不见跨批的同一人 (林远/小远、老杨头/杨老头
 * 这类全名与小名、敬称变体, 规则互含判断抓不住), 最后把紧凑名单交 LLM 合并一次。
 * 失败不阻断: 原样返回未去重名单。count/importance 合并后按组内最大值重算,
 * 不信 LLM 复述的数字。 */
var DEDUPE_SYS = "你是角色名单去重器。下面是已确认的小说角色名单, 其中可能有同一人的不同称呼 (全名/小名/昵称/敬称变体, 如「林远」与「小远」、「老杨头」与「杨老头」), 必须合并为一人: 正名取最正式、最完整的写法, 其余称呼放进 aliases。不同的人不要合并 (同姓不同人尤其小心)。合并必须有原文证据: 每组合并要在 evidence 字段给出一句逐字摘自原文的引文 (不超过 60 字), 句中同时出现正名与被合并的称呼, 或明确交代两者是同一人; 给不出原文证据的不要合并, 宁可分开列。名单中若有「叙述者」且另一角色明显是第一人称叙述者本人, 把「叙述者」并入该角色并给证据; 不确定就保留「叙述者」。返回 JSON: {\"characters\": [{\"name\": \"正名\", \"aliases\": [\"别名\"], \"importance\": 1-10, \"reason\": \"一句话理由\", \"evidence\": \"合并证据引文 (仅合并组需要)\"}]}, 包含合并后的全部角色, 不要漏人。";
async function dedupeCharacters(results, onProgress, text, warnings){
  warnings = warnings || [];
  if(!results || results.length < 2) return results;
  onProgress(1, 1, "LLM 名单去重...");
  try{
    var r = await DISTILL_LLM.chat([
      {role: "system", content: DEDUPE_SYS},
      {role: "user", content: JSON.stringify({characters: results.map(function(c){
        return {name: c.name, aliases: c.aliases, importance: c.importance, reason: c.reason};
      })})}
    ]);
    var obj = parseJsonObj(r.content);
    if(!obj) return results;
    var list = (obj.characters || []).filter(function(c){ return c && c.name && !isGeneric(c.name); });
    if(!list.length || list.length > results.length) return results;
    /* 两道确定性门 (2026-11-28): LLM 的合并只是提案, 过不了门的拆回原样 ——
     * 反边门: 组内成员两两 cannotLink 的, 后到者拆回独立条目;
     * 证据门: 吸收了其他原条目的组, evidence 必须是原文逐字引文且含被吸收的称呼。 */
    var paragraphs = splitParagraphs(text || "");
    var normText = (text || "").replace(/\s+/g, "");
    function evInText(ev){ return normText.indexOf(ev.replace(/\s+/g, "")) >= 0; }
    function cloneOrig(o){
      return {name: o.name, aliases: o.aliases.slice(), importance: o.importance, count: o.count, reason: o.reason || ""};
    }
    var used = {};
    var out = [];
    list.forEach(function(c){
      var rawAliases = (c.aliases || []).map(function(a){ return cleanAlias(a, c.name); })
        .filter(function(a){ return a && a !== c.name && !isGeneric(a); });
      rawAliases = rawAliases.filter(function(a, ix){ return rawAliases.indexOf(a) === ix; });
      var names = [c.name].concat(rawAliases);
      var members = [];
      results.forEach(function(o, ix){
        if(used[ix]) return;
        if(names.indexOf(o.name) >= 0 || o.aliases.some(function(a){ return names.indexOf(a) >= 0; })) members.push({o: o, ix: ix});
      });
      if(!members.length) return; /* LLM 凭空报的人, 不收 */
      var canon = null;
      members.forEach(function(mb){ if(mb.o.name === c.name) canon = mb; });
      var kept = canon ? [canon] : [];
      var splitBack = [];
      members.forEach(function(mb){
        if(canon && mb === canon) return;
        var blocked = kept.some(function(k){ return cannotLink(k.o.name, mb.o.name, paragraphs); });
        if(blocked) splitBack.push(mb); else kept.push(mb);
      });
      if(splitBack.length){
        warnings.push("去重有成员被反边规则拆回独立条目: " + splitBack.map(function(mb){ return mb.o.name; }).join("、"));
      }
      var absorbed = kept.filter(function(mb){ return !canon || mb !== canon; });
      if(absorbed.length){
        var ev = typeof c.evidence === "string" ? c.evidence.trim() : "";
        var evOk = ev.length >= 6 && evInText(ev) && absorbed.some(function(mb){
          if(mb.o.name === "叙述者") return ev.indexOf("我") >= 0;
          return ev.indexOf(mb.o.name) >= 0 || mb.o.aliases.some(function(a){ return ev.indexOf(a) >= 0; });
        });
        if(!evOk){
          warnings.push("去重合并被证据门驳回: " + c.name + " 与 " + absorbed.map(function(mb){ return mb.o.name; }).join("、") + " (无有效原文证据)");
          splitBack = splitBack.concat(absorbed);
          kept = canon ? [canon] : [];
          absorbed = [];
        }
      }
      kept.forEach(function(mb){ used[mb.ix] = true; });
      splitBack.forEach(function(mb){ used[mb.ix] = true; out.push(cloneOrig(mb.o)); });
      if(!kept.length) return;
      var aliases = rawAliases.slice();
      kept.forEach(function(mb){
        if(mb.o.name !== c.name && aliases.indexOf(mb.o.name) < 0) aliases.push(mb.o.name);
        mb.o.aliases.forEach(function(a){ if(a !== c.name && aliases.indexOf(a) < 0) aliases.push(a); });
      });
      aliases = aliases.filter(function(a){ return a !== c.name; });
      var count = 0, imp = c.importance || 5;
      kept.forEach(function(mb){
        count = Math.max(count, mb.o.count);
        imp = Math.max(imp, mb.o.importance);
      });
      out.push({name: c.name, aliases: aliases, importance: imp, count: count,
        reason: c.reason || (canon ? canon.o.reason : "") || ""});
    });
    /* LLM 漏报的原条目原样保留, 不许静默丢人 */
    results.forEach(function(o, ix){ if(!used[ix]) out.push(cloneOrig(o)); });
    return out;
  }catch(e){
    return results;
  }
}

async function confirmCharacters(candidates, text, opts, warnings){
  opts = opts || {};
  warnings = warnings || [];
  var onProgress = opts.onProgress || function(){};
  /* 全候选判定 (2026-11-28): 不再只看 Top 30 —— 低频真角色 (如第一人称主角)
   * 排在 60 名开外, 窗口一截就永远漏掉。候选池本身已过 minCount 与泛称过滤,
   * 总量 ≤100, 分批 (每批 20) 逐批让 LLM 带段落上下文判定。 */
  var pool = candidates.slice(0, 100);
  var paragraphs = splitParagraphs(text);
  /* 叙述者通道 (2026-11-28): 第一人称文本里叙述者必进判定池 —— 探到自称本名就以
   * 本名入池, 探不到就以「叙述者」占位入池 (开篇上下文交判定), 不再靠词频碰运气。 */
  var probe = probeNarrator(text);
  if(probe.firstPerson){
    /* 自称线索里的每个名字都提名入池 (含叙述者本名 —— 他可能被词频池挤掉);
     * 再加「叙述者」占位候选, 由 LLM 结合开篇与线索裁决本名, 不在这里猜。 */
    probe.selfNames.forEach(function(nm){
      var exN = null;
      pool.forEach(function(c){ if(c.name === nm) exN = c; });
      if(exN) exN.narrator = true;
      else pool.unshift({name: nm, count: 0, narrator: true});
    });
    if(!pool.some(function(c){ return c.name === "叙述者"; })){
      pool.unshift({name: "叙述者", count: probe.count, narrator: true});
    }
  }
  var BATCH = 20;
  var batches = [];
  for(var i = 0; i < pool.length; i += BATCH) batches.push(pool.slice(i, i + BATCH));
  var results = [];
  var okBatches = 0, lastErr = null;
  for(var b = 0; b < batches.length; b++){
    var batch = batches[b];
    onProgress(b, Math.max(1, batches.length), "LLM 判定角色 (第 " + (b + 1) + "/" + batches.length + " 批)...");
    var candsWithCtx = batch.map(function(c){
      if(c.narrator && c.name === "叙述者"){
        var ctxN = "【开篇】" + paragraphs.slice(0, 3).join("\n").slice(0, 600);
        if(probe.intros && probe.intros.length) ctxN += "\n【自称线索】\n" + probe.intros.join("\n");
        return {name: c.name, count: c.count, context: ctxN};
      }
      return {name: c.name, count: c.count, context: extractContext(c.name, paragraphs)};
    });
    try{
      var r = await DISTILL_LLM.chat([
        {role: "system", content: CONFIRM_SYS},
        {role: "user", content: JSON.stringify({candidates: candsWithCtx})}
      ]);
      var obj = parseJsonObj(r.content);
      if(!obj) throw new Error("LLM 返回无 JSON");
      var mapped = (obj.characters || []).map(function(c){
        var cand = batch.find(function(t){ return t.name === c.name; })
          || pool.find(function(t){ return t.name === c.name; });
        if(isGeneric(c.name)) return null;
        var aliases = (c.aliases || []).map(function(a){ return cleanAlias(a, c.name); })
          .filter(function(a){ return a && a !== c.name && !isGeneric(a); });
        aliases = aliases.filter(function(a, ix){ return aliases.indexOf(a) === ix; });
        return {
          name: c.name,
          aliases: aliases,
          importance: c.importance || 5,
          count: cand ? cand.count : 0,
          reason: c.reason || ""
        };
      }).filter(Boolean);
      mergeConfirmResults(results, mapped, paragraphs);
      okBatches++;
    }catch(e){
      lastErr = e;
    }
  }
  if(okBatches > 0){
    if(okBatches < batches.length){
      warnings.push("LLM 判定有 " + (batches.length - okBatches) + " 批失败, 结果可能不全: " + (lastErr ? lastErr.message : ""));
    }
    results = preMergeVariants(results, paragraphs);
    results = await dedupeCharacters(results, onProgress, text, warnings);
    /* 叙述者正名 (真书回归实测): 合并可能把真名并进「叙述者」占位条目当别名,
     * 卡名不能顶着占位名 —— 别名里有自称线索实证的本名 (或姓氏全名) 就扶正。 */
    results.forEach(function(r){
      if(r.name !== "叙述者") return;
      var promote = null;
      (probe.selfNames || []).forEach(function(nm){ if(!promote && r.aliases.indexOf(nm) >= 0) promote = nm; });
      if(!promote){
        for(var i = 0; i < r.aliases.length; i++){
          var a = r.aliases[i];
          if(a.length >= 2 && CL_SURNAMES.indexOf(a.charAt(0)) >= 0 && "小老阿".indexOf(a.charAt(0)) < 0){ promote = a; break; }
        }
      }
      if(promote){
        r.aliases = r.aliases.filter(function(a){ return a !== promote; });
        r.name = promote;
      }
    });
    return results.sort(function(a, b2){ return b2.importance - a.importance || b2.count - a.count; });
  }
  var wmsg = "LLM 确认失败，已降级为规则结果: " + (lastErr ? lastErr.message : "未知错误");
  warnings.push(wmsg);
  onProgress(0, 1, wmsg);
  // 降级: 直接用规则结果
  return pool.slice(0, 20).map(function(c){
    return {name: c.name, aliases: [], importance: 5, count: c.count,
      reason: "规则提取 (出现 " + c.count + " 次)"};
  });
}

async function discover(text, opts){
  opts = opts || {};
  var onProgress = opts.onProgress || function(){};
  onProgress(0, 2, "第一遍: 规则提取候选...");
  var cands = extractCandidates(text, opts);
  onProgress(1, 2, "发现 " + cands.length + " 个候选");
  onProgress(1, 2, "第二遍: LLM 确认...");
  var warnings = [];
  var chars = await confirmCharacters(cands, text, opts, warnings);
  chars.warnings = warnings;  // 挂到数组上，UI 可读
  onProgress(2, 2, "确认 " + chars.length + " 个角色");
  return chars;
}

return {
  extractCandidates: extractCandidates,
  extractContext: extractContext,
  parseJsonObj: parseJsonObj,
  splitParagraphs: splitParagraphs,
  confirmCharacters: confirmCharacters,
  discover: discover,
  isGeneric: isGeneric,
  cleanAlias: cleanAlias,
  scanNominations: scanNominations,
  probeNarrator: probeNarrator,
  cannotLink: cannotLink,
  variantCore: variantCore,
  preMergeVariants: preMergeVariants
};
})();
