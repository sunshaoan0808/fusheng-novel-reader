#!/usr/bin/env python3
"""开发期可选（Playwright，非运行时依赖）：v41 XSS 复审。走真实导入流程（#travFile 文件选择 → travImportFile → fromFile →
normalizeTavern → add），导入恶意 ST 卡（JSON + PNG tEXt chara），拿真实 card.id 遍历所有渲染卡数据的界面（含走原著线选幕/世界补完）。
检查：payload 是否执行、是否解析成真标签、on* 处理器里 payload 是否突破字符串字面量、处理器是否仍可解析。
usage: python3 tools/xss_card_audit.py www   （CONTROL=1 跑阳性对照）"""
import sys, asyncio, json, base64, struct, zlib, os, tempfile
from playwright.async_api import async_playwright
WWW = sys.argv[1]

def pl(tag):
    return ('<img src=x onerror="window.__XSS=(window.__XSS||[]).concat(\'%s\')">'
            '<svg onload="window.__XSS=(window.__XSS||[]).concat(\'%s-svg\')"></svg>'
            '<a href="javascript:window.__XSS=(window.__XSS||[]).concat(\'%s-js\')">%s-link</a>'
            '\'"><b data-x=%s>') % (tag, tag, tag, tag, tag)
ATTR = "'\"><img src=x onerror=window.__XSS=(window.__XSS||[]).concat('ATTR')>`${x}`</textarea></script><svg/onload=window.__XSS=(window.__XSS||[]).concat('ATTR2')>"

def mkcard(name, suffix):
    return {"spec": "chara_card_v2", "spec_version": "2.0", "data": {
        "name": name, "nickname": pl("nick"+suffix), "description": pl("desc"+suffix), "personality": pl("pers"+suffix),
        "scenario": pl("scen"+suffix), "first_mes": pl("first"+suffix), "mes_example": "<START>\n{{user}}: hi\n{{char}}: " + pl("mes"+suffix),
        "creator_notes": pl("notes"+suffix), "system_prompt": pl("sys"+suffix), "post_history_instructions": pl("phi"+suffix),
        "alternate_greetings": [pl("alt1"+suffix), pl("alt2"+suffix)], "group_only_greetings": [pl("grp"+suffix)],
        "tags": [pl("tag"+suffix), "javascript:alert(1)"], "creator": pl("creator"+suffix), "character_version": pl("ver"+suffix),
        "assets": [{"type": "icon", "uri": "javascript:window.__XSS=(window.__XSS||[]).concat('asset')", "name": pl("asset"+suffix), "ext": "png"}],
        "character_book": {"name": pl("bookname"+suffix), "entries": [
            {"keys": [pl("key"+suffix)], "secondary_keys": [pl("skey"+suffix)], "content": pl("wbcontent"+suffix),
             "comment": pl("wbcomment"+suffix), "name": pl("wbname"+suffix), "enabled": True, "insertion_order": 1, "constant": True}]},
        "extensions": {"depth_prompt": {"prompt": pl("depth"+suffix), "depth": 4}, "example_dialogue": pl("exd"+suffix),
                       "soul": {"persona": {"core_traits": [pl("trait"+suffix)]}, "memory": {"long_term": {"facts": [pl("fact"+suffix)]}}}}}}

def png_with_chara(obj):
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    idat = zlib.compress(b"\x00\x00\x00\x00")
    text = b"chara\x00" + base64.b64encode(json.dumps(obj, ensure_ascii=False).encode("utf-8"))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"tEXt", text) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

async def main():
    tmp = tempfile.mkdtemp()
    f1 = os.path.join(tmp, "evil1.json"); open(f1, "w").write(json.dumps(mkcard("恶意卡甲", "A"), ensure_ascii=False))
    f2 = os.path.join(tmp, "evil2.png"); open(f2, "wb").write(png_with_chara(mkcard("林" + ATTR, "B")))
    errs, fired_all, live_all = [], set(), {}
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 390, "height": 844})
        await ctx.add_init_script("window.alert=()=>{};window.confirm=()=>true;window.prompt=()=>null;try{localStorage.setItem('nd_onboarded','1')}catch(e){}")
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: errs.append("pageerror " + str(e)[:200]))
        await pg.goto("file://" + WWW + "/index.html"); await pg.wait_for_timeout(1500)
        for f in (f1, f2):
            await pg.evaluate("()=>{setNav('traverse')}"); await pg.wait_for_timeout(500)
            await pg.set_input_files("#travFile", f); await pg.wait_for_timeout(800)
        # 导入完成后，后续不再自动确认（避免删除类按钮误删）
        await pg.evaluate("()=>{window.confirm=()=>false}")
        lst = await pg.evaluate("()=>RP_CARDIMPORT.list().map(x=>[x.id,x.name])")
        print("imported:", [(i, n[:12]) for i, n in lst])
        assert len(lst) >= 2 and all(i for i, _ in lst), "import flow returned no ids"
        # 世界补完结果（AI 输出同属不可信）+ 补完草稿：都种恶意
        await pg.evaluate("""(ids)=>{ const P=s=>'<img src=x onerror="window.__XSS=(window.__XSS||[]).concat(\\''+s+'\\')">';
            ids.forEach(id=>{ localStorage.setItem('nd_wb2_card_'+id, JSON.stringify({kind:'card',id, bg:P('wbbg'), anchors:[P('anc1')+'：'+P('syn1'), P('anc2')]})); }); }""", [i for i, _ in lst])
        steps = []
        for cid, nm in lst:
            n = json.dumps(nm); c = json.dumps(cid)
            steps += [
                f"charDetail('imported',{n})", "charTab('info')", "charTab('memory')", "charTab('chat')", "charTab('arc')", "charTab('soul')",
                f"openCardArchive('imported',{n})", f"viewCardSource('imported',{n})", f"editCard('imported',{c})",
                f"chatWith('imported',{n})", "openSheet(false)", f"chatWithOpening('imported',{n},0)", f"chatWithOpening('imported',{n},1)",
                f"pickOpening('imported',{n},2)", "toggleDrawer(true)", "toggleDrawer(false)",
                f"regexEditor('imported',{n})", f"loreEditor('imported','chat')", f"openAlbum('imported',{n})", f"showATasks({n})",
                "setNav('traverse')", "plotlinePickBook()", f"plotlinePickCardStage({c})",
                f"PLOTLINE_WB_BACK=true; travWorldComplete('card',{c})", f"PLOTLINE_WB_BACK=false; travWorldComplete('card',{c})",
                f"window._wbDraft={{kind:'card',id:{c},bg:'<img src=x onerror=window.__XSS=[\\'draft\\']>',anchors:['<svg onload=window.__XSS=[\\'draft2\\']>']}}; travWorldCompleteView()",
                f"plotlineStartCard({c},0)", "toggleDrawer(true)", "toggleDrawer(false)",
                f"bodyIdentity('card',{c})", f"partyPickMain('card',{c})", f"partyPickMainSoul('card',{c})", f"partyPickMainBody('card',{c})",
                f"partyPickComps('card',{c},{n})", "isekaiPickSrc()", f"isekaiPickDst('imported',{n})",
                f"cardGapfillPrompt({c},['ooc_redline','soul_goal'],[])",
                "setNav('chat')", "showChatPicker && showChatPicker()", "importedGroupPicker()",
                "document.querySelectorAll('#gpick .card, #gpick [onclick]').forEach(e=>e.click()); startGroupChat()",
                "toggleDrawer(true)", "toggleDrawer(false)",
                "setNav('product')", "setNav('distill')", "setNav('writer')", "setNav('settings')", "setNav('traverse')",
                f"(typeof soulStart==='function')&&soulStart('imported',{n}).catch(()=>{{}})",
            ]
        if os.environ.get("CONTROL"):
            steps = [f"openCardArchive('imported',{json.dumps(lst[1][1])}); window.__T1=(document.body.innerText.match(/[a-zA-Z0-9]+A-link/g)||[]).join(',')", 
                     "view.innerHTML='<div onclick=\"f(\\'x\\');window.__XSS=1\"></div>'",
                     "view.innerHTML=RP_CARDIMPORT.list()[1].fields ? JSON.stringify(RP_CARDIMPORT.list()[1].scenario) : ''"]
        for st in steps:
            try: await pg.evaluate("()=>{" + st + "}")
            except Exception as e: errs.append("eval " + st[:70] + ": " + str(e).split("\n")[0][:140])
            await pg.wait_for_timeout(350)
            live = await pg.evaluate(r"""()=>{
                 // JS 词法级检查：on* 属性里 payload 标记若出现在字符串字面量之外 = 已突破
                 function outside(v){ let q=null, out=''; for(let i=0;i<v.length;i++){ const ch=v[i];
                     if(q){ if(ch==='\\'){i++;continue;} if(ch===q) q=null; continue; }
                     if(ch==="'"||ch==='"'||ch==='`'){ q=ch; continue; } out+=ch; } return out; }
                 const out=[];document.querySelectorAll('*').forEach(e=>{for(const a of e.attributes){
                 const v=a.value||''; if(/^on/i.test(a.name)&&/__XSS|ATTR/.test(outside(v))) out.push('JSBREAK '+e.tagName+' '+a.name+'='+v.slice(0,90));
                 if(/^on/i.test(a.name)){ try{ new Function('event', v); }catch(err){ out.push((/__XSS|ATTR/.test(v)?'NOPARSE ':'WARN-NOPARSE(非注入，处理器本身语法错) ')+e.tagName+' '+a.name+'='+v.slice(0,90)); } }
                 if(/^(href|src|action|formaction|xlink:href)$/i.test(a.name)&&/^\s*javascript:/i.test(v)) out.push('JSURL '+e.tagName+' '+a.name+'='+v.slice(0,60));
                 if(/^on/i.test(a.name) && e.tagName!=='BODY' && /__XSS|ATTR/.test(v) && /^on(error|load|mouseover|focus)$/i.test(a.name)) out.push('HANDLER '+e.outerHTML.slice(0,80));}});
                 document.querySelectorAll('img[src="x"],svg[onload],b[data-x]').forEach(e=>out.push('PARSED '+e.outerHTML.slice(0,80)));
                 return out;}""")
            if live: live_all.setdefault(st[:70], live[:5])
        if os.environ.get("CONTROL"): print("text visible:", await pg.evaluate("()=>window.__T1"))
        fired_all |= set(await pg.evaluate("()=>window.__XSS||[]"))
        await b.close()
    print("XSS fired:", sorted(fired_all))
    for k, v in live_all.items(): print("LIVE after", k, "->", v)
    print("errors:", len(errs)); [print("  ", e) for e in errs[:30]]
    real = {k: [x for x in v if not x.startswith("WARN")] for k, v in live_all.items()}
    real = {k: v for k, v in real.items() if v}
    print("RESULT", "FAIL" if (fired_all or real) else "PASS")

asyncio.run(main())
