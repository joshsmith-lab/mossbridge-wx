/**
 * Interaction regression checks, with fixed weather and no live data dependency.
 * TZ=America/New_York PORCH_FONT_DIR=/path/to/fonts node tools/interactions.mjs
 * Uses the same optional PORCH_CHROME_PATH as the visual harnesses.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serve, stage, SEVERE, forecast, tides, marine, LOC_TZ } from "./fixtures.mjs";

/* the payload refresh() builds from a raw forecast, so it can be planted as a cache */
const cachePayload=(t,o,loc)=>{
  const wj=forecast(t,o,LOC_TZ[loc],loc),i0=Math.max(0,wj.hourly.time.findIndex(x=>x>=wj.current.time.slice(0,13)+":00"));
  const S=a=>a&&a.slice(i0,i0+24),H=wj.hourly;
  const mj=marine(t,o,LOC_TZ[loc]).hourly;
  return{current:wj.current,daily:wj.daily,marine:{time:mj.time,wave:mj.wave_height},water:null,
    hourly:{time:S(H.time),temp:S(H.temperature_2m),feels:S(H.apparent_temperature),pop:S(H.precipitation_probability),
      code:S(H.weather_code),wind:S(H.wind_speed_10m),gust:S(H.wind_gusts_10m),uv:S(H.uv_index)},
    tides:tides(t).predictions,alerts:[],storms:null,nowcast:wj.minutely_15};
};

const PORT=Number(process.env.PORCH_PORT||8807),FONT_DIR=process.env.PORCH_FONT_DIR||"";
const server=await serve(PORT,FONT_DIR);
const browser=await chromium.launch(process.env.PORCH_CHROME_PATH?{executablePath:process.env.PORCH_CHROME_PATH}:{});
const now=new Date("2026-09-13T10:30:00-04:00");
const base={baseTemp:67,nowTemp:67,feels:73,isDay:1,code:65,cloud:95,nowWind:8,nowDir:280,
  nowGust:14,nowUv:1.5,uvMax:3,windAmp:7,gustAmp:11,popCurve:()=>80};
let checks=0;
async function open(width,o=base,loc="sp"){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:2,
    timezoneId:"America/New_York",reducedMotion:"reduce",serviceWorkers:"block"});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  await stage(page,{now,loc,o,fontDir:FONT_DIR,port:PORT});
  return {context,page,errors};
}
const load=async page=>{
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
  await page.evaluate(()=>document.fonts.ready);
};
const fits=async page=>{
  const view=await page.locator(".hourly-scroll").boundingBox(),peek=await page.locator("#hourlyPeek").boundingBox();
  assert.ok(peek&&peek.x>=view.x+7&&peek.x+peek.width<=view.x+view.width-7,
    "the full hourly readout stays inside the visible chart: "+JSON.stringify({view,peek}));
};
try{
  for(const width of [320,390,900]){
    const {context,page,errors}=await open(width);
    await load(page);
    await page.locator("#hourlyExplore").scrollIntoViewIfNeeded();
    await page.locator(".hourly-scroll").evaluate(el=>el.scrollLeft=250);
    const view=await page.locator(".hourly-scroll").boundingBox();
    for(const x of [view.x+10,view.x+view.width-10]){
      await page.locator("#hourlySvg").dispatchEvent("pointermove",{pointerType:"mouse",clientX:x});
      await fits(page);
    }
    await page.locator("#hourlyExplore").focus();
    for(const key of ["End","Home"]){
      await page.keyboard.press(key);await fits(page);
    }
    await page.keyboard.press("Escape");assert.equal(await page.locator("#hourlyPeek").isVisible(),false);
    const alignment=await page.evaluate(()=>{
      const svg=document.getElementById("hourlySvg").getBoundingClientRect();
      return [...document.querySelectorAll("#hrLabels span")].every((el,i)=>{
        const b=el.getBoundingClientRect();
        return Math.abs(b.left+b.width/2-(svg.left+HOURLY_PEEK.x[i]/HOURLY_PEEK.W*svg.width))<1;
      });
    });
    assert.equal(alignment,true,"hour labels align with their temperature and precipitation columns");
    await page.locator(".hourly-scroll").evaluate(el=>el.scrollLeft=200);
    await page.locator("#locBtn").click();
    assert.equal(await page.locator(".hourly-scroll").evaluate(el=>el.scrollLeft),0);
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  for(const width of [320,390,900]){
    const {context,page,errors}=await open(width,base,"mb");
    await load(page);
    const sizes=await page.evaluate(()=>({
      hourly:document.querySelector(".hourly-scroll").getBoundingClientRect().height,
      tide:document.getElementById("tideExplore").getBoundingClientRect().height,
    }));
    assert.ok(Math.abs(sizes.hourly-sizes.tide)<1.5,"hourly and tide areas match height: "+JSON.stringify(sizes));
    const box=await page.locator("#tideSvg").boundingBox();
    for(const x of [box.x+12,box.x+box.width-12]){
      await page.locator("#tideSvg").dispatchEvent("pointermove",{pointerType:"mouse",clientX:x});
      const peek=await page.locator("#tidePeek").boundingBox();
      assert.ok(peek&&peek.x>=box.x+7&&peek.x+peek.width<=box.x+box.width-7,"tide readout fits the chart");
      const reading=await page.evaluate(()=>TIDE_PEEK.samples[TIDE_I]);
      assert.equal(await page.locator("#tidePeekDepth").innerText(),"~"+reading.depth.toFixed(1)+" ft");
      assert.equal(await page.locator("#tidePeekDirection").innerText(),reading.direction);
    }
    await page.locator("#tideExplore").focus();
    await page.keyboard.press("Home");
    const first=await page.evaluate(()=>TIDE_PEEK.samples[TIDE_I].time);
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(first=>TIDE_PEEK.samples[TIDE_I].time-first,first),15*60*1000);
    assert.match(await page.locator("#tidePeekLive").textContent(),/about .* feet, (rising|falling)/);
    await page.keyboard.press("End");
    assert.equal(await page.evaluate(()=>TIDE_I),await page.evaluate(()=>TIDE_PEEK.samples.length-1));
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#tidePeek").isVisible(),false);
    await page.locator("#tideSvg").dispatchEvent("pointerdown",{pointerType:"touch",clientX:box.x+box.width/2});
    assert.equal(await page.locator("#tidePeek").isVisible(),true);
    await page.locator("#tideSvg").dispatchEvent("pointerup",{pointerType:"touch"});
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  for(const [code,kind] of [[75,"snow"],[67,"freezing rain"]]){
    const {context,page,errors}=await open(320,{...base,code,nowTemp:-3,baseTemp:-5,feels:-12});
    await load(page);await page.locator("#hourlyExplore").focus();await page.keyboard.press("Home");
    assert.match(await page.locator("#peekRain").innerText(),new RegExp(kind+" 80%"));
    assert.match(await page.locator("#hourlyPeekLive").textContent(),new RegExp("chance of "+kind));
    await fits(page);
    assert.equal(await page.locator("#bigTemp").innerText(),"-3°");
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    const {context,page,errors}=await open(390,{...base,code:1,popCurve:()=>5});
    let features=SEVERE(now);
    await page.route("**api.weather.gov/alerts**",route=>route.fulfill({json:{features}}));
    await load(page);
    /* a warning at the farm is the family's action in red on the Piddling card, and no fishing time
       on the moon: the alert strip names the event and its instruction */
    const fishing=()=>page.locator("#moonSvg").getAttribute("aria-label");
    assert.equal(await page.locator("#sayTitle").innerText(),"PIDDLING");
    assert.equal(await page.locator("#saySay").innerText(),"Chores can wait.");
    assert.equal(await page.locator("#saySay").getAttribute("class"),"lead no");
    assert.match(await fishing(),/fishing times: none clear\.$/);
    await page.locator("#alertStrip").click();
    assert.match(await page.locator(".alert-body").innerText(),/Move to an interior room/);
    assert.equal(await page.locator("#alertStrip").getAttribute("aria-expanded"),"true");
    features=features.map(f=>({properties:{...f.properties,ends:new Date(now.getTime()-60000).toISOString()}}));
    await page.evaluate(()=>refresh());
    assert.equal(await page.locator("#alertStrip").isVisible(),false);
    /* and when it has ended an ordinary day is the moon and its fishing times, and no card: never a green go */
    assert.doesNotMatch(await fishing(),/none clear/);
    assert.equal(await page.locator("#sayCard").isVisible(),false);
    assert.match(await page.locator("#moonSection .eyebrow b").innerText(),/^ALMANAC FISHING TIMES/);
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* the ordinary summer afternoon at the farm: thunder in the hourly run, nothing warned. The
       headline gives the hour, the card what to do, and a bite window that runs into the thunder is dropped */
    const {context,page,errors}=await open(390,{...base,code:2,cloud:40,popCurve:()=>5,hourlyCode:(i,hr)=>i<24&&hr>=12&&hr<=19?95:undefined});
    await load(page);
    /* the headline names the thunder the run carries, so the card says only what to do about it */
    assert.match(await page.locator("#verdict").innerText(),/Thunder possible around noon\.$/);
    assert.equal(await page.locator("#saySay").innerText(),"Piddle before the thunder.");
    assert.equal(await page.locator("#saySay").getAttribute("class"),"lead caution");
    const bites=await page.evaluate(()=>{const n=new Date(),t0=new Date(n).setHours(12,0,0,0),t1=new Date(n).setHours(20,0,0,0);
      return solunarWindows(n).filter(w=>w.end>n&&w.start.getTime()<t1&&w.end.getTime()>t0).map(w=>clock12(w.start)+" to "+clock12(w.end))});
    const fish=await page.locator("#moonSvg").getAttribute("aria-label");
    for(const b of bites)assert.ok(!fish.includes(b),`no fishing time in the thunder: ${b} in "${fish}"`);
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* A phone that opens at the coast and taps to the farm paints the farm's cache first. The farm's
       own sections have to be on that paint and on the live one, in the coast's places: the moon
       where the tide was, and the year titled for the farm's airport (the farm's card once came up
       with no heading after a trip to the coast) */
    const o={...base,code:1,popCurve:()=>5},t=new Date(now.getTime()-3.6e6);
    const {context,page,errors}=await open(390,o,"mb");
    await page.addInitScript(c=>localStorage.setItem("mbwx-sp",JSON.stringify(c)),{savedAt:t.getTime(),data:cachePayload(t,o,"sp")});
    await load(page);
    let release;const gate=new Promise(r=>release=r);
    await page.route("**api.open-meteo.com**",async r=>{if(r.request().url().includes("marine-api"))return r.fallback();await gate;r.fallback()});
    await page.locator("#locBtn").click();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.startsWith("updated"));
    assert.equal(await page.locator("#moonSection").isVisible(),true,"the cached farm paint has its moon");
    assert.match(await page.locator("#yearTitle").innerText(),/SHADY SPRING/);
    assert.equal(await page.locator("#tideSection").isVisible(),false);
    release();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
    assert.equal(await page.locator("#moonSection").isVisible(),true,"and so does the live one");
    assert.match(await page.locator("#yearTitle").innerText(),/SHADY SPRING/);
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* The entrance plays to someone, and nothing on screen is left undrawn. A phone opens on a
       same-day cache with the nowcast strip on and a one-line headline, the week sitting at the
       fold; the live paint drops the strip and runs the headline longer. The check used to be
       measured mid-render, before the strip went, and a week that was back on screen stayed
       blank (rv-pre) until a scroll crossed an observer threshold. Motion is on here. */
    const t=new Date("2026-09-22T11:20:00-04:00");
    const cached={baseTemp:80,nowTemp:82,feels:84,rh:60,isDay:1,code:1,cloud:20,nowWind:8,nowDir:200,nowGust:13,
      nowUv:6,uvMax:8,windAmp:7,gustAmp:10,popCurve:()=>5,dailyPop:p=>p.fill(10),nowcast:true};
    const live={...cached,nowcast:false,nowTemp:92,feels:99,rh:76,popCurve:(i,hr)=>hr>=15&&hr<=16&&i<24?45:5};
    const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:"America/New_York",serviceWorkers:"block"});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await stage(page,{now:t,loc:"mb",o:live,fontDir:FONT_DIR,port:PORT});
    await page.addInitScript(c=>localStorage.setItem("mbwx-mb",JSON.stringify(c)),{savedAt:t.getTime(),data:cachePayload(t,cached,"mb")});
    let release;const gate=new Promise(r=>release=r);
    await page.route("**api.open-meteo.com**",async r=>{if(r.request().url().includes("marine-api"))return r.fallback();await gate;r.fallback()});
    await page.goto(`http://localhost:${PORT}/`,{waitUntil:"domcontentloaded"});
    await page.evaluate(()=>document.fonts.ready);
    /* how much of each drawing is on screen, measured in the page */
    await page.addScriptTag({content:"window.__vis=id=>{const b=document.getElementById(id).getBoundingClientRect();return b.height>0?(Math.min(b.bottom,innerHeight)-Math.max(b.top,0))/b.height:0}"});
    const before=await page.evaluate(()=>{const b=document.getElementById("weekSvg").getBoundingClientRect();
      scrollTo(0,b.top+scrollY-innerHeight+.34*b.height);
      return{strip:document.getElementById("nowcast").classList.contains("on"),verdict:document.getElementById("verdict").offsetHeight,week:__vis("weekSvg")}});
    await page.waitForTimeout(200);
    assert.ok(before.strip&&before.week>.3&&before.week<.6&&await page.evaluate(()=>REVEAL.week.seen&&REVEAL.week.state==="armed"),
      "the cache paints the strip and puts the week at the fold, still to be drawn: "+JSON.stringify(before));
    release();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
    await page.waitForTimeout(4800);
    const after=await page.evaluate(()=>({strip:document.getElementById("nowcast").classList.contains("on"),
      verdict:document.getElementById("verdict").offsetHeight,charts:Object.fromEntries(["hourlySvg","weekSvg","tideSvg","uvSvg"].map(id=>
        [id,{vis:+__vis(id).toFixed(2),pre:document.getElementById(id).classList.contains("rv-pre")}]))}));
    assert.ok(!after.strip&&after.verdict>before.verdict,"the live paint drops the strip and runs the headline longer: "+JSON.stringify(after));
    for(const [id,s] of Object.entries(after.charts))
      assert.ok(!(s.vis>=.3&&s.pre),`${id} is on screen and still undrawn: `+JSON.stringify(after.charts));
    assert.ok(after.charts.weekSvg.vis>=.3,"the week is still on screen, so it is the chart being checked");
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* and the reason the entrance measures again: with no cache the loading shell has the tide on
       a phone's first screen, and the live paint pushes it below the fold. It waits for the scroll */
    const t=new Date("2026-09-22T11:20:00-04:00");
    const o={baseTemp:80,nowTemp:82,feels:84,rh:60,isDay:1,code:1,cloud:20,nowWind:8,nowDir:200,nowGust:13,
      nowUv:6,uvMax:8,windAmp:7,gustAmp:10,popCurve:()=>5,dailyPop:p=>p.fill(10)};
    const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:"America/New_York",serviceWorkers:"block"});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await stage(page,{now:t,loc:"mb",o,fontDir:FONT_DIR,port:PORT});
    let release;const gate=new Promise(r=>release=r);
    await page.route("**api.open-meteo.com**",async r=>{if(r.request().url().includes("marine-api"))return r.fallback();await gate;r.fallback()});
    await page.goto(`http://localhost:${PORT}/`,{waitUntil:"domcontentloaded"});
    await page.waitForTimeout(600);
    const tide=()=>page.evaluate(()=>{const b=document.getElementById("tideSvg").getBoundingClientRect();
      return{state:REVEAL.tide.state,seen:REVEAL.tide.seen,top:Math.round(b.top),fold:innerHeight,pre:document.getElementById("tideSvg").classList.contains("rv-pre")}});
    const shell=await tide();
    assert.ok(shell.top<shell.fold,"the loading shell has the tide on the first screen: "+JSON.stringify(shell));
    release();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
    await page.waitForTimeout(3500);
    const below=await tide();
    assert.ok(below.top>=below.fold&&below.state==="armed","the tide below the fold waits to be seen: "+JSON.stringify(below));
    await page.locator("#tideSvg").scrollIntoViewIfNeeded();
    await page.waitForTimeout(3800);
    const seen=await tide();
    assert.ok(seen.state==="done"&&!seen.pre,"scrolled to, it draws: "+JSON.stringify(seen));
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    const {context,page,errors}=await open(390);
    let offline=true;
    await page.route("**api.open-meteo.com**",route=>offline?route.abort():route.fallback());
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(()=>document.getElementById("stamp").textContent==="unavailable");
    assert.match(await page.locator("#verdict").innerText(),/Tap the timestamp to try again/);
    assert.equal(await page.locator("#refreshBtn").getAttribute("aria-busy"),"false");
    assert.equal(await page.locator(".skel").count(),0,"failed loading must end its skeleton animation");
    assert.equal(await page.locator(".live-dot").isVisible(),false,"no live pulse without a reading");
    offline=false;await page.locator("#refreshBtn").click();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
    assert.equal(await page.locator("#bigTemp").innerText(),"67°");
    assert.equal(await page.locator(".live-dot").isVisible(),true);
    offline=true;await page.evaluate(()=>refresh());
    assert.match(await page.locator("#stamp").innerText(),/updated/i);
    assert.equal(await page.locator("#bigTemp").innerText(),"67°");
    offline=false;await page.evaluate(()=>window.dispatchEvent(new Event("online")));
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  console.log(`${checks} interaction scenarios passed: matched chart heights, hourly and tide exploration, warnings, thunder coming at the farm, the farm's sections after the coast, the entrance across a cache-to-live paint and below the fold, and offline recovery.`);
}finally{
  await browser.close();server.close();
}
