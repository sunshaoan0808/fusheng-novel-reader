/* 生成 www/rp/distill_prompt_full.js —— 把 novel-distill 管线的全套蒸馏提示词
 * (zaomeng 基座 + distill_overlay, 单角色组装: 整节剥掉《多角色蒸馏差分要求》)
 * 与 24 组 / 95 字段表固化为 App 端模块, 使手机端蒸馏与管线同源。
 * 用法: node tools/gen_distill_prompt.js [novel-distill 仓库路径]
 * 管线提示词变更后重跑本脚本并提交生成物; 生成物带 sha 指纹, 测试会校验关键标记。 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoRoot = path.resolve(__dirname, "..");
const srcRoot = process.argv[2] || path.resolve(repoRoot, "..", "novel-distill");
const basePath = path.join(srcRoot, "prompts", "zaomeng_distill.md");
const overlayPath = path.join(srcRoot, "prompts", "distill_overlay.md");
const outPath = path.join(repoRoot, "www", "rp", "distill_prompt_full.js");

const base = fs.readFileSync(basePath, "utf8");
const overlay = fs.readFileSync(overlayPath, "utf8");

/* 单角色组装: 剥掉《多角色蒸馏差分要求》整节 (与管线 build_system_prompt 同规则) */
function stripSection(md, header) {
  const lines = md.split("\n");
  const out = [];
  let skip = false;
  for (const ln of lines) {
    if (ln.startsWith("## ") ) skip = (ln.trim() === header);
    if (!skip) out.push(ln);
  }
  return out.join("\n");
}
const baseSingle = stripSection(base, "## 多角色蒸馏差分要求");
if (baseSingle === base) { console.error("未找到多角色节, 中止"); process.exit(1); }
const text = baseSingle.replace(/\s+$/, "") + "\n\n" + overlay.replace(/\s+$/, "") + "\n";

/* 字段组: 从基座《覆盖要求》的编号清单提取 (组名 + 反引号字段名) */
const groups = [];
const coverStart = base.indexOf("## 覆盖要求");
const coverEnd = base.indexOf("\n## ", coverStart + 1);
const cover = coverStart >= 0 ? base.slice(coverStart, coverEnd > 0 ? coverEnd : undefined) : "";
if (!cover) { console.error("未找到《覆盖要求》节, 中止"); process.exit(1); }
for (const ln of cover.split("\n")) {
  const m = ln.match(/^\d+\.\s+(.+)$/);
  if (!m) continue;
  const fields = [];
  const re = /`([a-z][a-z0-9_]*)`/g;
  let f;
  while ((f = re.exec(m[1])) !== null) fields.push(f[1]);
  if (!fields.length) continue;
  let title = m[1].slice(0, m[1].indexOf("`")).replace(/[`：:]\s*$/, "").trim();
  title = title.replace(/（[^）]*$/, "").trim() || ("组" + (groups.length + 1));
  groups.push({ name: title, fields });
}
const totalFields = groups.reduce((s, g) => s + g.fields.length, 0);
if (totalFields < 90) { console.error("字段提取异常: 只得到 " + totalFields); process.exit(1); }

const sha = crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
const out =
"/* 全套蒸馏提示词 (生成物, 勿手改): 由 tools/gen_distill_prompt.js 从 novel-distill\n" +
" * prompts/zaomeng_distill.md + distill_overlay.md 组装 (单角色版, 已剥多角色差分节)。\n" +
" * 指纹 sha256:" + sha + " · " + groups.length + " 组 / " + totalFields + " 字段 · 提示词 " + text.length + " 字。\n" +
" * 管线提示词更新后重跑生成器再提交本文件。 */\n" +
"var DISTILL_PROMPT_FULL = {\n" +
"  sha: " + JSON.stringify(sha) + ",\n" +
"  text: " + JSON.stringify(text) + ",\n" +
"  groups: " + JSON.stringify(groups) + "\n" +
"};\n";
fs.writeFileSync(outPath, out);
console.log("written", outPath, "| sha", sha, "| groups", groups.length, "| fields", totalFields, "| prompt chars", text.length);
