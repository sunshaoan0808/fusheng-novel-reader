#!/usr/bin/env python3
"""走原著线·导入卡 视觉验证：选书页导入卡节（已补完/待补完两张卡）+ 卡的选幕页"""
import asyncio, json, os, sys
import urllib.request
import websockets

DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIR)
from runner import CDP

PORT = 9461
URL = "file:///home/hatch/workspace/github/novel-reader/www/index.html"
SHOT_DIR = os.path.join(DIR, "out")

SEED = r"""
localStorage.clear();
localStorage.setItem("nd_onboarded","1");
var mk = (id, name)=>({id:id, name:name, novel:"导入角色卡",
  fields:{core_identity:"温柔体贴的学姐", core_traits:"温柔，偶尔腹黑",
    role_tags:"校园；纯爱", speech_style:"轻声细语"},
  greeting:"你来了，我等你好久了。", altGreetings:[], exampleDialogue:"",
  scenario:"", systemPrompt:"", postHistoryInstructions:"", creatorNotes:"",
  tags:[], worldbook:[], raw:{tags:[]}, createdAt:Date.now()});
localStorage.setItem("nd_imported_cards", JSON.stringify([mk("imp_done","白月光"), mk("imp_new","林黛玉")]));
/* 白月光已 AI 补完世界（有锚点），林黛玉没补完 */
localStorage.setItem("nd_wb2_card_imp_done", JSON.stringify({
  bg:"大周朝，京城。旧党与新党在朝堂上对峙，边关战事吃紧，漕运断绝，京中米价飞涨。",
  places:["京城","边关"], factions:["旧党","新党"],
  anchors:["雪夜初见","朝堂风云","边关急报","花灯之约"], updatedAt:Date.now()}));
try{ onboardDone(); }catch(e){ var ob=document.getElementById("onboard"); if(ob) ob.remove(); }
plotlinePickBook();
"ok";
"""

async def main():
    os.makedirs(SHOT_DIR, exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        "/opt/meta-chromium/chrome", "--headless=new",
        "--remote-debugging-port=%d" % PORT,
        "--user-data-dir=/tmp/plotline_card_%d" % PORT,
        "--no-sandbox", "--disable-gpu", "about:blank",
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    try:
        targets = None
        for _ in range(60):
            try:
                data = urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=5).read()
                targets = json.loads(data); break
            except Exception:
                await asyncio.sleep(0.5)
        if not targets:
            print("FAIL: 连不上 Chrome"); return
        page = [t for t in targets if t.get("type") == "page"][0]
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=50*1024*1024) as ws:
            c = CDP(ws)
            await c.send("Page.enable")
            await c.send("Emulation.setDeviceMetricsOverride",
                         {"width":360,"height":800,"deviceScaleFactor":2,"mobile":True})
            await c.send("Page.navigate", {"url": URL})
            for _ in range(40):   # app.js 排在脚本列表末尾，等 plotlinePickBook 真的挂上
                if await c.ev("typeof plotlinePickBook") == "function": break
                await asyncio.sleep(0.5)
            if await c.ev(SEED) != "ok":
                print("FAIL seed"); return
            await asyncio.sleep(1.0)
            info = await c.ev("""(JSON.stringify({
  sec: document.body.textContent.includes('导入卡'),
  badges: Array.from(document.querySelectorAll('.badge')).map(e=>e.textContent),
  cards: document.querySelectorAll('.card--tap').length,
  targets: Array.from(document.querySelectorAll('.card--tap')).map(e=>e.getAttribute('onclick')),
}))""")
            print("选书页:", info)
            await c.shot(os.path.join(SHOT_DIR, "plotline_card_pickbook.png"))

            # 点"已补完"的卡 → 选幕页
            await c.ev("plotlinePickCardStage('imp_done'); 'ok'")
            await asyncio.sleep(0.8)
            info2 = await c.ev("""(JSON.stringify({
  stages: document.querySelectorAll('.card--tap').length,
  first: (document.querySelector('.card--tap .name')||{}).textContent,
  back: !!document.querySelector('button.back'),
}))""")
            print("选幕页:", info2)
            await c.shot(os.path.join(SHOT_DIR, "plotline_card_stage.png"))
            print("shots in", SHOT_DIR)
    finally:
        proc.terminate()

asyncio.run(main())