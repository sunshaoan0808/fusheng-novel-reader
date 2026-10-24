#!/usr/bin/env node
/* 跑全部单测（零依赖）：等价于 for f in tests/test_*.js; do node "$f"; done
 * 任一失败则退出码 1。用法：npm test  或  node tools/run_tests.js [-v]
 * Runs every tests/test_*.js in its own node process; exits 1 if any fails. */
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "tests");
const VERBOSE = process.argv.includes("-v");
const files = fs.readdirSync(DIR).filter(f => /^test_.*\.js$/.test(f)).sort();
const failed = [];
const t0 = Date.now();
for (const f of files) {
  const r = cp.spawnSync(process.execPath, [path.join(DIR, f)], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
  const ok = r.status === 0;
  if (!ok) {
    failed.push(f);
    console.log("FAIL " + f);
    process.stdout.write(((r.stdout || "") + (r.stderr || "")).split("\n").slice(-30).join("\n") + "\n");
  } else if (VERBOSE) console.log("ok   " + f);
}
console.log(`\n${files.length - failed.length}/${files.length} test files passed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(failed.length ? 1 : 0);
