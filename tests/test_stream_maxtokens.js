/* 回归 (2026-11-22): 流式聊天不传 max_tokens,「回复长度」设置形同虚设。
 * 真机链路实测: 默认流式路径发出的请求 6/6 无 max_tokens 字段, 成功轮次
 * 仅 209~275 字。本测试钉住: (1) RP_NET.stream 把 maxTokens/topP 透传进
 * 请求体; (2) 默认 respTokens = 2000; (3) 叙事者指令带篇幅下限。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

(async () => {
  /* ---- 1. stream 透传 max_tokens / top_p ---- */
  let captured = null;
  const enc = new TextEncoder();
  const sse = 'data: {"choices":[{"delta":{"content":"你好"},"finish_reason":null}]}\n\n'
            + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
            + 'data: [DONE]\n\n';
  const sb = { console, JSON, Math, Date, Object, Array, String, Number, RegExp,
    parseInt, parseFloat, isFinite, setTimeout, clearTimeout, TextDecoder, TextEncoder,
    AbortController,
    fetch: async (url, opt) => {
      captured = JSON.parse(opt.body);
      let sent = false;
      return { ok: true, body: { getReader: () => ({ read: async () => {
        if (sent) return { done: true };
        sent = true;
        return { done: false, value: enc.encode(sse) };
      } }) } };
    },
  };
  vm.createContext(sb); sb.window = sb; sb.globalThis = sb;
  vm.runInContext(fs.readFileSync(WWW + "/rp/chat.js", "utf8"), sb, { filename: "chat.js" });
  vm.runInContext("globalThis.RP_NET = RP_NET;", sb);
  const out = await sb.RP_NET.stream(
    { base: "http://x/v1", key: "k", model: "m" },
    [{ role: "user", content: "hi" }],
    { temperature: 0.9, stream: true, topP: 0.95, maxTokens: 2000 },
    () => {});
  t("stream 返回全文", out === "你好");
  t("请求体带 max_tokens=2000", captured && captured.max_tokens === 2000);
  t("请求体带 top_p=0.95", captured && captured.top_p === 0.95);
  t("请求体 stream=true", captured && captured.stream === true);

  /* ---- 2. 默认 respTokens = 2000 ---- */
  const core = fs.readFileSync(WWW + "/js/app_chat_core.js", "utf8");
  t("默认 respTokens 2000", /respTokens:\s*2000/.test(core));

  /* ---- 3. 叙事者指令带篇幅下限 ---- */
  const prompt = fs.readFileSync(WWW + "/rp/prompt.js", "utf8");
  t("叙事指令含篇幅下限", prompt.indexOf("篇幅：每轮回复要有小说段落的体量") >= 0
    && prompt.indexOf("400 字上下为底线") >= 0);
  t("篇幅下限堵凑字歪路", prompt.indexOf("绝不靠替玩家行动") >= 0);

  console.log(`test_stream_maxtokens: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FATAL", e && e.stack || e); process.exit(1); });
