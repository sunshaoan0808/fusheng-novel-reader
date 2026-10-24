/* 测试辅助（零依赖）：经典脚本的轻量词法扫描。
 *   strip(src)        —— 抹掉注释/字符串/正则/模板文本内容（保留换行与代码、模板 ${} 内的代码），供正则查找
 *   topLevelDecls(src)—— 真正处于脚本顶层（花括号/圆括号/方括号深度均为 0）的声明：
 *                         [{name, kind: const|let|var|class|function, line}]，支持 `const a = 1, b = 2` 多声明
 * 只服务于静态守卫测试；不追求完整 JS 语法，只要求对本仓库代码稳定。 */
"use strict";
function strip(src){
  let out = "", i = 0; const n = src.length; const st = [{m: "code", depth: 0}];
  const blank = c => (c === "\n" ? "\n" : " ");
  while(i < n){
    const top = st[st.length - 1], c = src[i], d = src[i + 1];
    if(top.m === "code"){
      if(c === "/" && d === "/"){ while(i < n && src[i] !== "\n"){ out += " "; i++; } continue; }
      if(c === "/" && d === "*"){ while(i < n && !(src[i] === "*" && src[i + 1] === "/")){ out += blank(src[i]); i++; } out += "  "; i += 2; continue; }
      if(c === "/"){
        let j = out.length - 1; while(j >= 0 && /\s/.test(out[j])) j--;
        const prev = j >= 0 ? out[j] : "";
        const kw = /(?:^|[^\w$])(return|typeof|case|in|of|void|delete|new|throw|else|do)$/.test(out.slice(Math.max(0, j - 10), j + 1));
        if(prev === "" || /[(,=:\[!&|?{};+\-*%~^<>]/.test(prev) || kw){
          out += " "; i++; let cls = false;
          while(i < n){ const e = src[i];
            if(e === "\\"){ out += "  "; i += 2; continue; }
            if(e === "\n") break;
            if(e === "[") cls = true; else if(e === "]") cls = false;
            else if(e === "/" && !cls){ out += " "; i++; break; }
            out += " "; i++; }
          continue;
        }
      }
      if(c === "'" || c === '"' || c === "`"){ st.push({m: c}); out += c; i++; continue; }
      if(c === "{"){ top.depth++; out += c; i++; continue; }
      if(c === "}"){
        if(top.depth === 0 && st.length > 1){ st.pop(); out += c; i++; continue; }
        top.depth--; out += c; i++; continue;
      }
      out += c; i++; continue;
    }
    if(c === "\\"){ out += "  "; i += 2; continue; }
    if(top.m === "`" && c === "$" && d === "{"){ st.push({m: "code", depth: 0}); out += "${"; i += 2; continue; }
    if(c === top.m){ st.pop(); out += c; i++; continue; }
    if((top.m === "'" || top.m === '"') && c === "\n"){ st.pop(); out += c; i++; continue; }
    out += blank(c); i++;
  }
  return out;
}
function topLevelDecls(src){
  const s = strip(src), res = [];
  let depth = 0, line = 1;
  const isId = ch => /[\w$]/.test(ch);
  for(let i = 0; i < s.length; i++){
    const c = s[i];
    if(c === "\n"){ line++; continue; }
    if(c === "{" || c === "(" || c === "["){ depth++; continue; }
    if(c === "}" || c === ")" || c === "]"){ depth--; continue; }
    if(depth !== 0 || !/[a-z]/.test(c) || (i > 0 && (isId(s[i - 1]) || s[i - 1] === "."))) continue;
    const m = /^(?:(const|let|var|class)|(?:async\s+)?function\*?)\s+([A-Za-z_$][\w$]*)/.exec(s.slice(i, i + 200));
    if(!m) continue;
    const kind = m[1] || "function";
    res.push({name: m[2], kind, line});
    if(kind === "const" || kind === "let" || kind === "var"){
      /* 多声明：在本声明内（深度 0）遇到逗号，取下一个标识符；遇到 ; 或「行尾不是续行」结束 */
      let j = i + m[0].length, dd = 0, ln = line;
      while(j < s.length){
        const e = s[j];
        if(e === "\n"){
          ln++;
          if(dd === 0){
            let k = j - 1; while(k >= 0 && /[ \t\r]/.test(s[k])) k--;
            let q = j + 1; while(q < s.length && /\s/.test(s[q])) q++;
            const prevC = s[k], nextC = s[q];
            if(!/[,=+\-*/%&|^!?:<>(\[{.]/.test(prevC) && !/[,.+\-*/%&|^?:=)\]}]/.test(nextC || "")) break;
          }
        }
        else if(e === "{" || e === "(" || e === "[") dd++;
        else if(e === "}" || e === ")" || e === "]"){ if(dd === 0) break; dd--; }
        else if(dd === 0 && e === ";") break;
        else if(dd === 0 && e === ","){
          const mm = /^\s*([A-Za-z_$][\w$]*)/.exec(s.slice(j + 1, j + 80));
          if(mm) res.push({name: mm[1], kind, line: ln});
        }
        j++;
      }
    }
  }
  return res;
}
module.exports = { strip, topLevelDecls };
