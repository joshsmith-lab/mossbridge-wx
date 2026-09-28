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
async function open(width,o=base,loc="sp",when=now){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:2,
    timezoneId:"America/New_York",reducedMotion:"reduce",serviceWorkers:"block"});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  await stage(page,{now:when,loc,o,fontDir:FONT_DIR,port:PORT});
  return {context,page,errors};
}
const load=async page=>{
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
  await page.evaluate(()=>document.fonts.ready);
};
/* ── reading a chart ──────────────────────────────────
   Every line reads through one machine (xpSetup in index.html). These read it from the page: the
   pill as it is seen, the stop, what the reader says there, the slider's spoken value, and where
   the rings are against the point the chart published for that stop. */
const xpState=(page,k)=>page.evaluate(k=>{
  const X=XP[k],p=X.peek,D=X.D,svg=D&&D.svg,r=svg&&svg.getBoundingClientRect(),vb=svg&&svg.viewBox.baseVal;
  const at=(x,y)=>[r.left+x/D.W*r.width,r.top+y/vb.height*r.height];
  const rd=D&&X.i>=0?D.read(X.i):null;
  return{shown:!p.hidden,text:p.hidden?null:[...p.children].map(c=>c.textContent).join(" "),i:X.i,n:D?D.x.length:0,start:D?D.start:null,
    read:rd&&rd.parts.map(q=>q[0]).join(" "),said:rd&&rd.said,valuetext:X.key?X.key.getAttribute("aria-valuetext"):null,
    t:D&&X.i>=0?D.t[X.i]:null,x:D&&X.i>=0?at(D.x[X.i],0)[0]:null,
    rings:svg?[...svg.querySelectorAll(".xp-cursor circle")].map(c=>{const b=c.getBoundingClientRect();return[b.x+b.width/2,b.y+b.height/2]}):[],
    points:D&&X.i>=0&&!(D.noRing||[]).includes(X.i)?D.y[X.i].filter(Number.isFinite).map(y=>at(D.x[X.i],y)):[],
    gaps:D?Math.max(...D.x.slice(1).map((x,i)=>(x-D.x[i])/D.W*r.width)):0,
    box:(()=>{const b=X.box.getBoundingClientRect(),v=X.view?document.querySelector(X.view).getBoundingClientRect():b;return{left:Math.max(b.left,v.left),right:Math.min(b.right,v.right)}})(),
    pill:p.hidden?null:(()=>{const b=p.getBoundingClientRect();return{left:b.left,right:b.right}})()};
},k);
/* the pill stays 7px inside what can be seen of its chart */
const fitsIn=async(page,k)=>{
  const s=await xpState(page,k);
  assert.ok(s.pill&&s.pill.left>=s.box.left+7-.5&&s.pill.right<=s.box.right-7+.5,`the ${k} readout stays inside its chart: `+JSON.stringify({box:s.box,pill:s.pill,text:s.text}));
};
/* a real finger: CDP touch input goes through the browser's own gesture handling (touch-action,
   pointercancel on a pan), which a synthetic dispatchEvent skips */
const touch=async(cdp,page,pts,{dt=16,hold=0,end=true,each=null}={})=>{
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:pts[0][0],y:pts[0][1]}]});
  if(hold)await page.waitForTimeout(hold);
  for(const [x,y] of pts.slice(1)){await page.waitForTimeout(dt);await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y}]});if(each)await each(x,y)}
  if(end)await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
};
const across=(b,y,from=30,len=180,step=6)=>Array.from({length:Math.floor(len/step)+1},(_,k)=>[b.x+from+k*step,y]);
async function phone(width,o,loc,{motion=false,when=now,cache=null,gate=false}={}){
  const context=await browser.newContext({viewport:{width,height:800},deviceScaleFactor:2,hasTouch:true,isMobile:true,
    timezoneId:"America/New_York",reducedMotion:motion?"no-preference":"reduce",serviceWorkers:"block"});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  await stage(page,{now:when,loc,o,fontDir:FONT_DIR,port:PORT});
  if(cache)await page.addInitScript(c=>localStorage.setItem(c.k,JSON.stringify(c.v)),cache);
  await page.addInitScript(()=>{window.__cancels=0;addEventListener("pointercancel",()=>window.__cancels++,true)});
  let release=()=>{};
  if(gate){const g=new Promise(r=>release=r);
    await page.route("**api.open-meteo.com**",async r=>{if(r.request().url().includes("marine-api"))return r.fallback();await g;r.fallback()})}
  const cdp=await context.newCDPSession(page);
  return{context,page,errors,cdp,release};
}
const inView=async(page,sel)=>{await page.evaluate(sel=>{const e=document.querySelector(sel),b=e.getBoundingClientRect();scrollTo(0,scrollY+b.top-(innerHeight-b.height)/2)},sel);
  await page.waitForTimeout(80);return page.locator(sel).boundingBox()};
const coast={baseTemp:84,nowTemp:88,feels:95,rh:66,isDay:1,code:1,cloud:22,nowWind:9,nowDir:214,nowGust:16,nowUv:6,uvMax:8,
  windAmp:9,gustAmp:14,popCurve:(i,hr)=>hr>14&&hr<20?22:5,dailyPop:p=>{p[1]=35;p[2]=72}};
const wetSunday={baseTemp:84,nowTemp:90,feels:97,rh:70,isDay:1,code:2,cloud:40,nowWind:6,nowDir:250,nowGust:12,nowUv:8,uvMax:9,
  windAmp:6,gustAmp:10,popCurve:()=>10,dailyPop:p=>p.splice(0,8,35,85,100,45,10,0,65,20),
  dailyTemps:(hi,lo,c)=>{hi.splice(0,8,96,101,88,84,83,86,90,87);lo.splice(0,8,74,76,71,66,64,66,70,68);c.splice(0,8,2,95,63,80,1,0,81,2)}};
const sunday=new Date("2026-08-02T12:20:00-04:00");
const surgeO={baseTemp:74,nowTemp:78,feels:78,rh:70,isDay:1,code:3,cloud:70,nowWind:14,nowDir:45,nowGust:22,nowUv:3,uvMax:5,
  windAmp:9,gustAmp:13,sunrise:"07:04",sunset:"18:59",surge:2.1,popCurve:()=>10,dailyPop:p=>p.fill(15)};
const surgeAt=new Date("2026-09-27T13:05:00-04:00");
try{
  for(const width of [320,390,900]){
    /* the farm: the hours, the week, the moon and the year, read with a mouse at both edges */
    const {context,page,errors}=await open(width);
    await load(page);
    for(const [k,sel] of [["hourly",".hourly-scroll"],["week","#weekExplore"],["moon","#moonExplore"],["year","#yearExplore"]]){
      const view=await inView(page,sel);
      for(const x of [view.x+2,view.x+view.width-2]){await page.mouse.move(x,view.y+view.height*.55);await fitsIn(page,k)}
      await page.mouse.move(view.x+view.width/2,5);
    }
    const key=page.locator("#hourlyExplore .xp-key");
    await key.focus();
    for(const k of ["End","Home"]){await page.keyboard.press(k);await fitsIn(page,"hourly")}
    await page.keyboard.press("Escape");
    assert.equal((await xpState(page,"hourly")).shown,false);
    assert.equal(await page.evaluate(()=>document.activeElement.classList.contains("xp-key")),true,"Escape keeps focus");
    const alignment=await page.evaluate(()=>{
      const svg=document.getElementById("hourlySvg").getBoundingClientRect(),D=XP.hourly.D;
      return [...document.querySelectorAll("#hrLabels span")].every((el,i)=>{
        const b=el.getBoundingClientRect();
        return Math.abs(b.left+b.width/2-(svg.left+D.x[i]/D.W*svg.width))<1;
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
    const box=await inView(page,"#tideSvg");
    for(const x of [box.x+2,box.x+box.width-2]){
      await page.mouse.move(x,box.y+box.height/2);
      await fitsIn(page,"tide");
      const s=await xpState(page,"tide");
      assert.equal(s.text,s.read,"the tide pill is its reader's parts");
    }
    /* the coast's year never says snow, in any month */
    const year=await inView(page,"#yearExplore");
    for(const x of [year.x+2,year.x+year.width-2]){await page.mouse.move(x,year.y+year.height/2);await fitsIn(page,"year")}
    assert.ok(await page.evaluate(()=>XP.year.D.x.every((_,m)=>!/snow/.test(XP.year.D.read(m).said))),"Wilmington never says snow");
    await page.mouse.move(5,5);
    await page.locator("#tideExplore .xp-key").focus();
    await page.keyboard.press("Home");
    const first=await xpState(page,"tide");
    assert.equal(first.i,0);
    await page.keyboard.press("ArrowRight");
    const step=await xpState(page,"tide");
    assert.ok(step.i===1&&step.t-first.t>0&&step.t-first.t<=15*60*1000,"one step is the next quarter hour or a turn");
    assert.equal(step.valuetext,step.said,"the slider speaks the reader's sentence");
    assert.match(step.valuetext,/about .* feet, (rising|falling)$/);
    await page.keyboard.press("End");
    assert.equal((await xpState(page,"tide")).i,(await xpState(page,"tide")).n-1);
    await page.keyboard.press("Home");await page.keyboard.press("PageDown");
    const turn=await xpState(page,"tide");
    assert.match(turn.text,/^now /,"PageDown from the start lands on now");
    await page.keyboard.press("PageDown");
    assert.doesNotMatch((await xpState(page,"tide")).text,/~/,"and then on a turn, the table's own number");
    await page.keyboard.press("Escape");
    assert.equal((await xpState(page,"tide")).shown,false);
    /* with no surge on the gauge, no stop is said to be the table's */
    assert.ok(await page.evaluate(()=>XP.tide.D.x.every((_,i)=>!/table/.test(XP.tide.D.read(i).said))),"no gap, no table");
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  for(const [code,kind] of [[75,"snow"],[67,"freezing rain"]]){
    const {context,page,errors}=await open(320,{...base,code,nowTemp:-3,baseTemp:-5,feels:-12});
    await load(page);await page.locator("#hourlyExplore .xp-key").focus();await page.keyboard.press("Home");
    const s=await xpState(page,"hourly");
    assert.match(s.text,new RegExp(kind+" 80%"));
    assert.match(s.valuetext,new RegExp("chance of "+kind));
    await fitsIn(page,"hourly");
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
    /* and the moon's pill never names one: no stop inside the thunder hours says fishing, and a clear
       window's pill says fishing exactly across its band, so it ends where the band ends */
    const moon=await page.evaluate(()=>{const D=XP.moon.D,n=new Date(),t0=new Date(n).setHours(12,0,0,0),t1=new Date(n).setHours(20,0,0,0);
      const bands=[...D.svg.querySelectorAll("rect")].filter(r=>r.getAttribute("fill")===getComputedStyle(document.documentElement).getPropertyValue("--water").trim()&&+r.getAttribute("rx")===3)
        .map(r=>[+r.getAttribute("x"),+r.getAttribute("x")+ +r.getAttribute("width")]);
      return{bands,stops:D.t.map((t,i)=>({t,x:D.x[i],fishing:/fishing/.test(D.read(i).parts.map(q=>q[0]).join(" ")),storm:t>=t0&&t<t1}))}});
    assert.ok(moon.bands.length>0,"the fixture has a clear window to read");
    for(const s of moon.stops){
      assert.ok(!(s.storm&&s.fishing),"no fishing time in the thunder: "+new Date(s.t));
      if(moon.bands.some(([a,b])=>Math.abs(s.x-a)<1||Math.abs(s.x-b)<1))continue;
      const inBand=moon.bands.some(([a,b])=>s.x>a&&s.x<b);
      assert.equal(s.fishing,inBand,`a stop says fishing exactly inside a drawn band (${new Date(s.t)} at x ${s.x.toFixed(1)})`);
    }
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
    /* the new place's shell names the farm's airport in the hover text before any paint lands */
    assert.match(await page.locator("#yearTitle").getAttribute("title"),/Beckley airport/,"the shell's hover text is the farm's airport");
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.startsWith("updated"));
    assert.equal(await page.locator("#moonSection").isVisible(),true,"the cached farm paint has its moon");
    assert.match(await page.locator("#yearTitle").innerText(),/SHADY SPRING/);
    assert.match(await page.locator("#yearTitle").getAttribute("title"),/Beckley airport/);
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
  /* ── every line reads the same way, with a real finger ── */
  for(const [loc,charts] of [["mb",["hourly","week","tide","year"]],["sp",["moon"]]]){
    /* a 180px sideways slide at 390: the chart keeps the finger (no pointercancel), the stop follows
       it, the pill is its reader, the rings sit on the published point, and the reading stays a
       moment after the finger lifts (the week's goes at once, and opens the day) */
    const {context,page,errors,cdp}=await phone(390,loc==="mb"?coast:{...base,code:1,popCurve:()=>5},loc);
    await load(page);
    for(const k of charts){
      const b=await inView(page,`#${k}Explore`),y=b.y+b.height*.55;
      let last=-1,monotone=true;
      await touch(cdp,page,across(b,y),{end:false,each:async x=>{const s=await xpState(page,k);if(s.i<last)monotone=false;last=s.i}});
      await page.waitForTimeout(30);
      const s=await xpState(page,k);
      assert.equal(await page.evaluate(()=>__cancels),0,`${k}: the slide is the chart's, not the page's`);
      assert.ok(s.shown&&monotone,`${k}: the reading follows the finger to the right`);
      assert.ok(Math.abs(s.x-(b.x+210))<=Math.max(7.5,s.gaps/2+1),`${k}: the stop is under the finger: ${s.x} for ${b.x+210}`);
      assert.equal(s.text,s.read,`${k}: the pill is the reader's parts`);
      assert.equal(s.rings.length,s.points.length,`${k}: a ring for each point the stop has`);
      s.rings.forEach(([x,y],j)=>assert.ok(Math.hypot(x-s.points[j][0],y-s.points[j][1])<=1,`${k}: ring ${j} sits on the line`));
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      if(k==="week"){
        await page.waitForTimeout(60);
        assert.equal((await xpState(page,k)).shown,false,"the week's pill goes at once");
        assert.equal(await page.evaluate(i=>document.querySelectorAll("#weekRows .wk-day")[i].getAttribute("aria-expanded"),s.i),"true","and the day it ended on opens");
        continue;
      }
      await page.waitForTimeout(1000);
      assert.equal((await xpState(page,k)).shown,true,`${k}: still there a second after the finger lifts`);
      await page.waitForTimeout(1600);
      assert.equal((await xpState(page,k)).shown,false,`${k}: gone by 2.6s`);
    }
    /* a vertical drag that starts on a chart scrolls the page and shows nothing, mid-move or after */
    for(const k of charts){
      const b=await inView(page,`#${k}Explore`),room=await page.evaluate(()=>document.documentElement.scrollHeight-scrollY-innerHeight);
      const dir=room>260?-1:1,x=b.x+b.width/2,y0=b.y+b.height/2,sy=await page.evaluate(()=>scrollY),pts=[];
      const opened=await page.evaluate(()=>document.getElementById("weekRows").innerHTML.match(/aria-expanded="true"/g)?.length||0);
      for(let j=0;j<=12;j++)pts.push([x,y0+dir*j*200/12]);
      let mid=false;
      await touch(cdp,page,pts,{each:async()=>{if((await xpState(page,k)).shown)mid=true}});
      await page.waitForTimeout(400);
      const moved=Math.abs(await page.evaluate(()=>scrollY)-sy);
      assert.ok(moved>=150,`${k}: a vertical drag scrolls the page (${moved}px)`);
      assert.ok(!mid&&!(await xpState(page,k)).shown,`${k}: and shows nothing`);
      assert.equal(await page.evaluate(()=>document.getElementById("weekRows").innerHTML.match(/aria-expanded="true"/g)?.length||0),opened,`${k}: and opens or closes no day`);
    }
    if(loc==="mb"){
      /* a tap reads where it lands, at lift; a still press reads by 200ms and not at once; and one
         reading at a time: tapping the tide puts the hours away */
      const h=await inView(page,"#hourlyExplore"),hy=h.y+h.height*.55;
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:h.x+120,y:hy}]});
      await page.waitForTimeout(40);
      assert.equal((await xpState(page,"hourly")).shown,false,"nothing before the lift");
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      await page.waitForTimeout(40);
      const tap=await xpState(page,"hourly");
      assert.ok(tap.shown&&Math.abs(tap.x-(h.x+120))<=tap.gaps/2+1,"a tap reads where it landed");
      await page.waitForTimeout(2600);
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:h.x+200,y:hy}]});
      await page.waitForTimeout(10);
      assert.equal((await xpState(page,"hourly")).shown,false,"a press shows nothing at once");
      await page.waitForTimeout(200);
      assert.equal((await xpState(page,"hourly")).shown,true,"a still press reads by 200ms");
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      const t=await inView(page,"#tideExplore");
      await touch(cdp,page,[[t.x+150,t.y+t.height/2]],{hold:40});
      await page.waitForTimeout(40);
      assert.ok((await xpState(page,"tide")).shown&&!(await xpState(page,"hourly")).shown,"one reading at a time");
    }
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* the keys: Tab reaches each chart's slider, focus reads its start (now, or this month), the
       arrows step, Home and End reach the ends, Escape hides and keeps focus, and the spoken value is
       the reader's sentence. In the loading shell the sliders are off */
    const {context,page,errors}=await open(390,coast,"mb");
    let release;const gate=new Promise(r=>release=r);
    await page.route("**api.open-meteo.com**",async r=>{if(r.request().url().includes("marine-api"))return r.fallback();await gate;r.fallback()});
    await page.goto(`http://localhost:${PORT}/`,{waitUntil:"domcontentloaded"});
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll(".xp-key")].map(k=>k.disabled)),[true,true,true,true],"no slider before a reading");
    release();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
    const reached=[];
    for(let j=0;j<40&&reached.length<3;j++){
      await page.keyboard.press("Tab");
      const k=await page.evaluate(()=>{const a=document.activeElement;return a&&a.classList.contains("xp-key")?a.closest(".xp").id.replace("Explore",""):null});
      if(k&&!reached.includes(k)){reached.push(k);
        const s=await xpState(page,k);
        assert.ok(s.shown&&s.i===s.start,`${k}: focus reads its start`);
        assert.match(s.text,k==="year"?/^Sep /:/^now /);
        assert.equal(s.valuetext,s.said);}
    }
    assert.deepEqual(reached,["hourly","tide","year"],"Tab reaches each slider in page order");
    for(const [k,unit] of [["hourly",36e5],["tide",0],["year",1]]){
      await page.locator(`#${k}Explore .xp-key`).focus();
      const a=await xpState(page,k);await page.keyboard.press("ArrowRight");
      const b=await xpState(page,k);await page.keyboard.press("ArrowUp");
      const c=await xpState(page,k);
      assert.ok(b.i===a.i+1&&c.i===b.i+1,`${k}: the arrows step`);
      if(unit)assert.equal(b.t-a.t,unit,`${k}: one step is one ${k==="year"?"month":"hour"}`);
      else assert.ok(b.t-a.t>0&&b.t-a.t<=9e5,"the water steps a quarter hour or to a turn");
      await page.keyboard.press("Home");assert.equal((await xpState(page,k)).i,0);
      await page.keyboard.press("ArrowLeft");assert.equal((await xpState(page,k)).i,0,`${k}: the start clamps`);
      await page.keyboard.press("End");const e=await xpState(page,k);assert.equal(e.i,e.n-1);
      assert.equal(e.valuetext,e.said);
      if(k==="year"){assert.match(e.text,/^Dec /);await page.keyboard.press("Home");assert.match((await xpState(page,k)).text,/^Jan /)}
      await page.keyboard.press("Escape");
      assert.equal((await xpState(page,k)).shown,false);
      assert.equal(await page.evaluate(k=>document.activeElement===document.querySelector(`#${k}Explore .xp-key`),k),true,"Escape keeps focus");
    }
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* the week: the 8-column Sunday at 320. A slide from Tue to Fri inks each name in turn and the
       pill names each column; the lift opens Friday; a tap still toggles; a slide that ends on Today
       closes; a vertical drag opens nothing; a mouse hover never changes the open day, and a mouse
       drag that ends on the day it started on keeps it open; the arrows move and open */
    const {context,page,errors,cdp}=await phone(320,wetSunday,"sp",{when:sunday});
    await load(page);
    const b=await inView(page,"#weekExplore"),n=await page.locator("#weekRows .wk-day").count(),col=b.width/n,cx=i=>b.x+(i+.5)*col,y=b.y+b.height*.55;
    assert.equal(n,8);
    const openDay=()=>page.evaluate(()=>[...document.querySelectorAll("#weekRows .wk-day")].findIndex(d=>d.getAttribute("aria-expanded")==="true"));
    const inked=()=>page.evaluate(()=>[...document.querySelectorAll("#weekRows .wk-day")].findIndex(d=>d.classList.contains("xp-on")));
    const names=new Set(),pills=new Set();
    const pts=[];for(let x=cx(2);x<=cx(5);x+=4)pts.push([x,y]);pts.push([cx(5),y]);
    await touch(cdp,page,pts,{end:false,each:async()=>{names.add(await inked());const s=await xpState(page,"week");if(s.text)pills.add(s.text.split(" ")[0])}});
    assert.deepEqual([...names].filter(i=>i>=0),[2,3,4,5],"each name is inked in turn");
    assert.deepEqual([...pills],["Tue","Wed","Thu","Fri"],"and the pill names each column");
    assert.equal(await openDay(),-1,"the brief does not move during the slide");
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await page.waitForTimeout(60);
    assert.equal(await openDay(),5,"the lift opens Friday");
    assert.match(await page.locator("#weekBrief").innerText(),/^Friday/);
    await page.waitForTimeout(700);
    await touch(cdp,page,[[cx(3),y]],{hold:50});await page.waitForTimeout(80);
    assert.equal(await openDay(),3,"a tap opens its day");
    await touch(cdp,page,[[cx(3),y]],{hold:50});await page.waitForTimeout(80);
    assert.equal(await openDay(),-1,"and a tap on the open day closes it");
    await touch(cdp,page,[[cx(4),y]],{hold:50});await page.waitForTimeout(700);
    const back=[];for(let x=cx(4);x>=cx(0);x-=6)back.push([x,y]);
    await touch(cdp,page,back);await page.waitForTimeout(60);
    assert.equal(await openDay(),-1,"a slide that ends on Today closes the brief");
    await page.waitForTimeout(700);
    const sy=await page.evaluate(()=>scrollY),up=[];for(let j=0;j<=12;j++)up.push([cx(3),y-j*16]);
    await touch(cdp,page,up);await page.waitForTimeout(400);
    assert.ok(await page.evaluate(()=>scrollY)-sy>=150&&await openDay()===-1,"a vertical drag scrolls and opens nothing");
    await page.locator("#weekRows button.wk-day").first().focus();
    await page.keyboard.press("ArrowRight");
    assert.deepEqual([await openDay(),await page.evaluate(()=>+document.activeElement.dataset.i)],[2,2],"the arrow moves focus and opens that day");
    await page.keyboard.press("Escape");assert.equal(await openDay(),-1);
    assert.deepEqual(errors,[]);await context.close();
    /* and with a mouse */
    const m=await open(320,wetSunday,"sp",sunday);await load(m.page);
    const mb=await inView(m.page,"#weekExplore"),mcx=i=>mb.x+(i+.5)*mb.width/8,my=mb.y+mb.height*.55;
    const mopen=()=>m.page.evaluate(()=>[...document.querySelectorAll("#weekRows .wk-day")].findIndex(d=>d.getAttribute("aria-expanded")==="true"));
    for(let x=mcx(1);x<=mcx(6);x+=10)await m.page.mouse.move(x,my);
    assert.ok((await xpState(m.page,"week")).shown&&await mopen()===-1,"hover shows the pill and never opens a day");
    await m.page.mouse.click(mcx(2),my);assert.equal(await mopen(),2,"a click opens");
    await m.page.mouse.move(mcx(2),my);await m.page.mouse.down();
    for(let x=mcx(2);x<=mcx(5);x+=8)await m.page.mouse.move(x,my);
    for(let x=mcx(5);x>=mcx(2);x-=8)await m.page.mouse.move(x,my);
    await m.page.mouse.move(mcx(2),my);await m.page.mouse.up();await m.page.waitForTimeout(60);
    assert.equal(await mopen(),2,"a mouse drag that ends on the day it started on keeps it open");
    await m.page.waitForTimeout(700);
    await m.page.mouse.click(mcx(2),my);assert.equal(await mopen(),-1,"and a click still closes it");
    assert.deepEqual(m.errors,[]);await m.context.close();checks++;
  }
  {
    /* the water two feet over the table: at now the pill is the table plus the gap, the ring is on
       the gauge's mark when it is drawn and nowhere at now when it is not, and an hour on is the table's */
    const {context,page,errors}=await open(390,surgeO,"mb",surgeAt);
    await load(page);
    await page.locator("#tideExplore .xp-key").focus();
    const s=await xpState(page,"tide"),exp=await page.evaluate(()=>{
      const n=wallNow(),P=LAST.d.tides.map(p=>({t:new Date(p.t.replace(" ","T")).getTime(),v:+p.v})).sort((a,b)=>a.t-b.t),t=n.getTime();
      let i=0;while(i+1<P.length&&P[i+1].t<=t)i++;const a=P[i],b=P[i+1],f=(t-a.t)/(b.t-a.t);
      const table=a.v+(b.v-a.v)*(1-Math.cos(Math.PI*f))/2,gap=levelFeet(LAST.d.water,n);
      const mark=[...XP.tide.D.svg.querySelectorAll("path")].find(p=>/^M [\d.]+ [\d.]+ H [\d.]+$/.test(p.getAttribute("d"))&&p.getAttribute("stroke-width")==="2.4");
      const r=XP.tide.D.svg.getBoundingClientRect(),vb=XP.tide.D.svg.viewBox.baseVal;
      return{table,gap,markY:mark?r.top+ +mark.getAttribute("d").split(" ")[2]/vb.height*r.height:null}});
    assert.equal(exp.gap,2);
    assert.equal(s.text,`now ~${(exp.table+exp.gap).toFixed(1)} ft`,"now is the water that is there");
    assert.match(s.said,/running 2 ft above the tide table/);
    if(exp.markY==null)assert.equal(s.rings.length,0,"the skiff is the mark at now");
    else{assert.equal(s.rings.length,1);assert.ok(Math.abs(s.rings[0][1]-exp.markY)<=1,"the ring sits on the gauge's mark")}
    await page.keyboard.press("ArrowRight");
    assert.match((await xpState(page,"tide")).text,/ by the table$/,"everything else is the table's");
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* the year at the farm: January says its snow, July has none, and the ends clamp */
    const {context,page,errors}=await open(390,{...base,code:1,popCurve:()=>5},"sp");
    await load(page);
    await page.locator("#yearExplore .xp-key").focus();
    await page.keyboard.press("Home");
    assert.equal((await xpState(page,"year")).text,"Jan 41° / 24° rain 3.1 in snow 16 in");
    await page.keyboard.press("ArrowLeft");
    assert.match((await xpState(page,"year")).text,/^Jan /,"← at January stays on January");
    for(let j=0;j<6;j++)await page.keyboard.press("ArrowRight");
    assert.doesNotMatch((await xpState(page,"year")).text,/snow/,"no snow in July");
    await page.keyboard.press("End");
    assert.match((await xpState(page,"year")).text,/^Dec /);
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* a repaint keeps the moment: a finger held at 5p through the live data landing again still
       reads 5p, and a new place puts it away */
    const {context,page,errors,cdp}=await phone(390,coast,"mb");
    await load(page);
    const b=await inView(page,"#hourlyExplore"),y=b.y+b.height*.55;
    const x5=await page.evaluate(()=>{const D=XP.hourly.D,i=LAST.d.hourly.time.findIndex(t=>t.slice(11,13)==="17"),r=D.svg.getBoundingClientRect();return r.left+D.x[i]/D.W*r.width});
    const pts=[];for(let x=b.x+20;x<=x5;x+=6)pts.push([x,y]);pts.push([x5,y]);
    await touch(cdp,page,pts,{end:false});
    assert.match((await xpState(page,"hourly")).text,/^5p /);
    await page.evaluate(()=>render(LAST.d,true));
    assert.match((await xpState(page,"hourly")).text||"",/^5p /,"the repaint keeps 5p");
    await page.evaluate(()=>setLoc("sp"));
    assert.equal((await xpState(page,"hourly")).shown,false,"a new place puts it away");
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  for(const [age,width] of [[1,320],[2,390],[3,390],[4,320],[5,390]]){
    /* a cache opened hours after it was written: the hours start at the hour now is in, and say
       now there; the first hour is its clock; the axis's NOW sits at the same hour, and the hour
       beside it gives way, so no two words on the axis touch at 320 or 390 */
    const t=new Date(now.getTime()-age*3.6e6),o={...base,code:1,popCurve:()=>5};
    const {context,page,errors}=await open(width,o,"mb");
    await page.addInitScript(c=>localStorage.setItem("mbwx-mb",JSON.stringify(c)),{savedAt:t.getTime(),data:cachePayload(t,o,"mb")});
    await page.route("**api.open-meteo.com**",r=>r.request().url().includes("marine-api")?r.fallback():r.abort());
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(()=>/updated/.test(document.getElementById("stamp").textContent));
    await page.locator("#hourlyExplore .xp-key").focus();
    const s=await xpState(page,"hourly");
    assert.equal(s.start,age,"the hour now is in");
    assert.match(s.text,/^now /);
    const axis=await page.evaluate(()=>[...document.querySelectorAll("#hrLabels span")].map(e=>({t:e.textContent,r:e.getBoundingClientRect()})));
    assert.equal(axis.findIndex(e=>e.t==="NOW"),age,"the axis's NOW is at the same hour");
    const words=axis.filter(e=>e.t);
    words.slice(1).forEach((e,j)=>assert.ok(e.r.left>=words[j].r.right-.5,`${age}h at ${width}: "${words[j].t}" and "${e.t}" do not touch on the axis`));
    await page.keyboard.press("Home");
    assert.match((await xpState(page,"hourly")).text,new RegExp("^"+(10-age)+"a "),"an hour before now is its clock");
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* with motion on: a slide during the entrance finishes it first, so the ring never rides a line
       still drawing in, and the explorer adds no animation of its own */
    const {context,page,errors,cdp}=await phone(390,coast,"mb",{motion:true});
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
    await page.waitForFunction(()=>REVEAL.hourly.state==="running",null,{timeout:3000});
    const b=await page.locator("#hourlyExplore").boundingBox(),y=b.y+b.height*.55;
    await touch(cdp,page,across(b,y,30,120));
    assert.deepEqual(await page.evaluate(()=>[REVEAL.hourly.state,!document.querySelector("#hourlyExplore .xp-peek").hidden]),["done",true],"the entrance finished, the pill is up");
    await page.evaluate(()=>finishReveal());
    await page.waitForTimeout(2800);
    const before=await page.evaluate(()=>document.getAnimations().length);
    let during=0;
    await touch(cdp,page,across(b,y),{each:async()=>{during=Math.max(during,await page.evaluate(()=>document.getAnimations().length))}});
    await page.waitForTimeout(2800);
    const after=await page.evaluate(()=>document.getAnimations().length);
    assert.ok(during<=before&&after===before,`the explorer adds no animations: ${before} before, ${during} during, ${after} after`);
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* a missing hourly temperature is not a zero: on a cache whose 3p is null the line keeps to the
       known hours, nothing is drawn at NaN, the real low keeps its mark, and 3p reads unavailable */
    const o={...base,code:1,popCurve:()=>5},t=new Date(now.getTime()-3.6e5),data=cachePayload(t,o,"mb");
    data.hourly.temp[5]=null;
    const {context,page,errors}=await open(390,o,"mb");
    await page.addInitScript(c=>localStorage.setItem("mbwx-mb",JSON.stringify(c)),{savedAt:t.getTime(),data});
    await page.route("**api.open-meteo.com**",r=>r.request().url().includes("marine-api")?r.fallback():r.abort());
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(()=>/updated/.test(document.getElementById("stamp").textContent));
    const r=await page.evaluate(()=>{const h=LAST.d.hourly,known=h.temp.map((v,i)=>v==null?null:i===0&&LAST.d.current.temperature_2m!=null?LAST.d.current.temperature_2m:v).filter(v=>v!=null);
      return{nan:/NaN/.test(document.getElementById("hourlySvg").innerHTML),marks:XP.hourly.D.marks,low:Math.round(Math.min(...known)),
        labels:[...document.querySelectorAll("#hourlySvg text")].map(e=>e.textContent),said:XP.hourly.D.read(5).said}});
    assert.equal(r.nan,false,"nothing in the hourly is drawn at NaN");
    assert.ok(r.marks.every(i=>i>=0),"no mark at -1: "+r.marks);
    assert.ok(r.labels.includes(r.low+"°"),`the real low ${r.low}° keeps its label: ${r.labels}`);
    assert.match(r.said,/temperature unavailable/);
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* a live paint drawn again after the top of the hour (a rotation between fetches) asks for the
       new hour's run, once an hour, so NOW and the now pill land back on the live reading */
    const when=new Date("2026-09-13T16:59:55-04:00");
    const {context,page,errors}=await open(390,{...base,code:1,popCurve:()=>5},"mb",when);
    let asks=0;page.on("request",r=>{const u=r.url();if(u.includes("api.open-meteo.com")&&!u.includes("marine-api"))asks++});
    await load(page);
    const a0=asks;
    await page.waitForFunction(()=>new Date().getHours()===17,null,{timeout:15000});
    await page.setViewportSize({width:700,height:900});await page.waitForTimeout(900);
    assert.equal(asks-a0,1,"the rotation after the hour asks for the new hour's run");
    await page.setViewportSize({width:390,height:900});await page.waitForTimeout(900);
    assert.equal(asks-a0,1,"and asks once an hour");
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* with motion on, a thumb creeping into a scroll from a chart still waiting to draw in is a
       scroll: it never shows a reading, so it never finishes that chart's entrance under it. The
       water came into view drawn, with no entrance, on the ordinary way up to it */
    const {context,page,errors,cdp}=await phone(390,coast,"mb",{motion:true});
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
    await page.waitForTimeout(3200);
    await page.evaluate(()=>{const b=document.getElementById("tideSvg").getBoundingClientRect();scrollTo(0,scrollY+b.top-innerHeight+b.height*.2)});
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>REVEAL.tide.state),"armed","the water waits at the foot of the screen");
    const b=await page.locator("#tideSvg").boundingBox(),x=b.x+b.width/2,y0=Math.min(790,b.y+b.height*.1);
    const t0=Date.now();
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y:y0}]});
    for(let j=0;j<30;j++){await page.waitForTimeout(4);const t=Date.now()-t0;
      await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:Math.max(5,y0-.00024*t*t)}]})}
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    const st=await page.evaluate(()=>[REVEAL.tide.state,!document.querySelector("#tideExplore .xp-peek").hidden]);
    assert.ok(st[0]!=="done"&&!st[1],"the push shows nothing and leaves the water's entrance to play: "+st);
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* a tapped reading lingers 2.2s and goes, even when a repaint lands inside the linger: a tap
       leaves :hover stuck on a phone, and that is no finger, mouse or key holding the chart. But it
       keeps the rest of its 2.2s through the repaint, which on every open is the live data landing
       a moment after the cache. The slider's spoken value goes back to the start with its value */
    const {context,page,errors,cdp}=await phone(390,coast,"mb");
    await load(page);
    for(const k of ["hourly","tide","year"]){
      const b=await inView(page,`#${k}Explore`);
      await touch(cdp,page,[[b.x+b.width*.6,b.y+b.height*.55]],{hold:40});
      await page.waitForTimeout(300);
      assert.equal((await xpState(page,k)).shown,true,`${k}: the tap reads`);
      const before=(await xpState(page,k)).t;
      await page.evaluate(()=>render(LAST.d,true));
      await page.waitForTimeout(700);
      const mid=await xpState(page,k);
      assert.ok(mid.shown&&mid.t===before,`${k}: a repaint 300ms after the tap keeps its reading, at the same moment`);
      await page.waitForTimeout(1600);
      const s=await xpState(page,k),v=await page.evaluate(k=>{const X=XP[k];return{value:+X.key.value,said:X.D.read(+X.key.value).said,start:X.D.start}},k);
      assert.equal(s.shown,false,`${k}: a repaint in the linger does not keep a tapped reading up`);
      assert.equal(v.value,v.start,`${k}: the slider is back at its start`);
      assert.equal(s.valuetext,v.said,`${k}: and its spoken value is the start's sentence`);
    }
    /* a lifted slide: the value and its sentence go back together */
    const t=await inView(page,"#tideExplore");
    await touch(cdp,page,across(t,t.y+t.height*.55,40,200,8));
    await page.waitForTimeout(2600);
    const ts=await xpState(page,"tide"),tv=await page.evaluate(()=>XP.tide.D.read(+XP.tide.key.value).said);
    assert.ok(!ts.shown&&ts.valuetext===tv,"after a slide's linger the spoken value is the start's: "+ts.valuetext);
    /* the keys: blur puts the sentence back with the value */
    await page.locator("#hourlyExplore .xp-key").focus();
    for(let j=0;j<7;j++)await page.keyboard.press("ArrowRight");
    await page.locator("#hourlyExplore .xp-key").blur();
    const hs=await xpState(page,"hourly"),hv=await page.evaluate(()=>XP.hourly.D.read(+XP.hourly.key.value).said);
    assert.equal(hs.valuetext,hv,"after blur the spoken value is the start's");
    /* a slow start to a vertical scroll is a scroll: a finger that has moved is not holding still */
    for(const k of ["hourly","tide","year"]){
      for(const pts of [(x,y)=>Array.from({length:41},(_,j)=>[x,y-j*2]),(x,y)=>[...Array.from({length:6},(_,j)=>[x,y-j*2]),...Array.from({length:12},(_,j)=>[x,y-10-(j+1)*16])]]){
        const b=await inView(page,`#${k}Explore`);let mid=false;
        await touch(cdp,page,pts(b.x+b.width/2,b.y+b.height/2),{each:async()=>{if((await xpState(page,k)).shown)mid=true}});
        await page.waitForTimeout(300);
        assert.ok(!mid&&!(await xpState(page,k)).shown,`${k}: a slow vertical scroll shows nothing`);
      }
      /* and a thumb creeping into a scroll, on the real clock (0, 1, 2, 4px a frame), never reads as
         still: each creep starts the hold's wait again */
      const b=await inView(page,`#${k}Explore`),x=b.x+b.width/2,y0=b.y+b.height*.7;
      await page.evaluate(k=>{window.__peeked=false;const p=XP[k].peek;window.__mo?.disconnect();
        window.__mo=new MutationObserver(()=>{if(!p.hidden)window.__peeked=true});window.__mo.observe(p,{attributes:true})},k);
      const t0=Date.now();
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y:y0}]});
      for(let j=0;j<30;j++){await page.waitForTimeout(4);const t=Date.now()-t0;
        await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:Math.max(5,y0-.00024*t*t)}]})}
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(()=>window.__peeked),false,`${k}: a scroll that starts slowly never flashes a reading`);
    }
    /* the hour labels under the hourly are its axis, and a tap on one reads that hour */
    {
      await page.waitForTimeout(1500);                  /* the push above leaves the page gliding */
      const l=await inView(page,"#hrLabels");
      await touch(cdp,page,[[l.x+l.width*.6,l.y+l.height/2]],{hold:40});
      await page.waitForTimeout(60);
      assert.equal((await xpState(page,"hourly")).shown,true,"a tap on the hour labels reads the hour");
      await page.waitForTimeout(2600);
    }
    /* a finger that stops a gliding page is stopping the page, and is not a tap on the chart. The
       finger has to land on the water while the page is still moving, so the flick is tried again
       if it glides past */
    await page.evaluate(()=>document.getElementById("tideExplore").addEventListener("pointerdown",()=>{window.__onTide=true},true));
    /* and however long it rests there: a thumb that stops a glide and rests 200ms is still stopping
       the page */
    for(const hold of [50,200]){
    let landed=false;
    for(let tries=0;tries<4&&!landed;tries++){
      await page.evaluate(()=>{const e=document.getElementById("tideExplore"),b=e.getBoundingClientRect();scrollTo(0,scrollY+b.top-innerHeight-60);window.__onTide=false});
      await page.waitForTimeout(200);
      const fl=[];for(let j=0;j<=5;j++)fl.push([200,700-j*80]);
      await touch(cdp,page,fl,{dt:8});
      for(let j=0;j<40;j++){
        const g=await page.evaluate(async()=>{const a=scrollY;await new Promise(r=>requestAnimationFrame(r));
          const b=document.getElementById("tideExplore").getBoundingClientRect(),y=b.top+b.height/2;
          return scrollY!==a&&y>b.height&&y<innerHeight-b.height?{x:b.left+b.width/2,y}:null});
        if(!g)continue;
        await touch(cdp,page,[[g.x,g.y]],{hold});
        landed=await page.evaluate(()=>window.__onTide);break;
      }
      await page.waitForTimeout(80);
      if(landed)assert.equal((await xpState(page,"tide")).shown,false,`a ${hold}ms press that stops the glide reads nothing`);
      else await page.waitForTimeout(2600);
    }
    assert.ok(landed,`the finger landed on the water while the page glided (${hold}ms)`);
    }
    await page.waitForTimeout(300);
    const still=await page.locator("#tideExplore").boundingBox();
    await touch(cdp,page,[[still.x+still.width/2,still.y+still.height/2]],{hold:50});
    await page.waitForTimeout(40);
    assert.equal((await xpState(page,"tide")).shown,true,"and a tap on a still page does");
    await page.waitForTimeout(2600);
    /* a repaint a moment after a finger lands keeps its press: the slide still reads, and in the
       week it still opens the day it ends on */
    for(const k of ["hourly","tide","week"]){
      const b=await inView(page,`#${k}Explore`),y=b.y+b.height*.55;
      await page.evaluate(()=>weekPick(0));
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:b.x+40,y}]});
      await page.waitForTimeout(30);
      await page.evaluate(()=>render(LAST.d,true));
      let last=-1,seen=0;
      for(let j=1;j<=20;j++){await page.waitForTimeout(16);await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:b.x+40+j*9,y}]});
        const s=await xpState(page,k);if(s.shown){seen++;assert.ok(s.i>=last,`${k}: the reading follows the finger`);last=s.i}}
      assert.ok(seen>=15,`${k}: a repaint as the finger lands does not lose the slide (${seen} of 20 moves read)`);
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      await page.waitForTimeout(60);
      if(k==="week")assert.ok(await page.evaluate(()=>XP.week.i>1&&document.querySelectorAll("#weekRows .wk-day")[XP.week.i].getAttribute("aria-expanded")==="true"),"and the week opens the day it ended on");
      await page.waitForTimeout(2600);
    }
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  {
    /* the week: a tap just after a slide is a tap, and the click a short slide leaves behind is
       still the slide's; a missing daily high is a dash with no ring */
    const {context,page,errors,cdp}=await phone(320,{...wetSunday,dailyTemps:(hi,lo,c)=>{wetSunday.dailyTemps(hi,lo,c);hi[3]=null}},"sp",{when:sunday});
    await load(page);
    const b=await inView(page,"#weekExplore"),n=await page.locator("#weekRows .wk-day").count(),cx=i=>b.x+(i+.5)*b.width/n,y=b.y+b.height*.55;
    const openDay=()=>page.evaluate(()=>[...document.querySelectorAll("#weekRows .wk-day")].findIndex(d=>d.getAttribute("aria-expanded")==="true"));
    const pts=[];for(let x=cx(1);x<=cx(2);x+=4)pts.push([x,y]);pts.push([cx(2),y]);
    await touch(cdp,page,pts);await page.waitForTimeout(250);
    assert.equal(await openDay(),2,"the slide opens its day");
    await touch(cdp,page,[[cx(4),y]],{hold:50});await page.waitForTimeout(80);
    assert.equal(await openDay(),4,"a tap 250ms after a slide opens the day it lands on");
    await page.waitForTimeout(700);
    await touch(cdp,page,[[cx(2)-6,y],[cx(2),y],[cx(2)+6,y]]);await page.waitForTimeout(250);
    assert.equal(await openDay(),2,"a short slide opens its day, and the click it leaves behind does not close it");
    await page.evaluate(()=>xpShow(XP.week,3));
    const s=await xpState(page,"week");
    assert.match(s.text,/^Wed 8\/5 – \//,"a missing high is a dash");
    assert.equal(s.rings.length,1,"and has no ring, only the low's");
    assert.deepEqual(errors,[]);await context.close();
    /* with a mouse: a press dragged off the week and let go outside is let go, so the pill does not
       stay up once the mouse leaves */
    for(const width of [390,900]){
      const m=await open(width,wetSunday,"sp",sunday);await load(m.page);
      const mb=await inView(m.page,"#weekExplore"),mcx=i=>mb.x+(i+.5)*mb.width/8,my=mb.y+mb.height*.55;
      await m.page.mouse.move(mcx(3),my);await m.page.mouse.down();
      for(let j=1;j<=6;j++)await m.page.mouse.move(mcx(3),my+j*(mb.height*.45+80)/6);
      await m.page.mouse.up();
      assert.equal(await m.page.evaluate(()=>XP.week.ptr),null,`${width}: the press let go outside is let go`);
      for(let x=mcx(1);x<=mcx(6);x+=10)await m.page.mouse.move(x,my);
      assert.equal(await m.page.evaluate(()=>XP.week.box.classList.contains("xp-drag")),false,"a hover is not a drag");
      await m.page.mouse.move(mb.x+mb.width+Math.min(20,(width-mb.width)/2-2),my);await m.page.mouse.move(mb.x+mb.width/2,mb.y-60);
      await m.page.waitForTimeout(60);
      assert.equal((await xpState(m.page,"week")).shown,false,`${width}: the pill goes when the mouse leaves`);
      assert.deepEqual(m.errors,[]);await m.context.close();
    }
    checks++;
  }
  {
    /* a chart that is not drawn has no spoken value: the loading shell, the farm's unavailable shell
       after the coast, and the water with no tide table */
    const {context,page,errors}=await open(390,coast,"mb");
    let release;const gate=new Promise(r=>release=r);
    await page.route("**api.open-meteo.com**",async r=>{if(r.request().url().includes("marine-api"))return r.fallback();await gate;r.fallback()});
    await page.goto(`http://localhost:${PORT}/`,{waitUntil:"domcontentloaded"});
    const off=()=>page.evaluate(()=>[...document.querySelectorAll(".xp-key")].filter(k=>k.disabled).map(k=>k.getAttribute("aria-valuetext")));
    assert.deepEqual(await off(),[null,null,null,null],"the loading shell speaks no reading");
    release();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
    await page.unroute("**api.open-meteo.com**");
    await page.route("**api.open-meteo.com**",r=>r.request().url().includes("marine-api")?r.fallback():r.abort());
    await page.evaluate(()=>{localStorage.removeItem("mbwx-sp");document.getElementById("locBtn").click()});
    await page.waitForFunction(()=>/unavailable/i.test(document.body.innerText));
    const shell=await off();
    assert.ok(shell.length>=3&&shell.every(v=>v==null),"the farm's unavailable shell speaks none of the coast's readings: "+JSON.stringify(shell));
    assert.deepEqual(errors,[]);await context.close();
    const t=await open(390,coast,"mb");
    await t.page.route("**tidesandcurrents.noaa.gov**",r=>r.request().url().includes("interval=hilo")?r.abort():r.fallback());
    await load(t.page);
    await t.page.waitForFunction(()=>/tide data unavailable/.test(document.getElementById("tideNote").textContent));
    assert.deepEqual(await t.page.evaluate(()=>{const k=document.querySelector("#tideExplore .xp-key");return[k.disabled,k.getAttribute("aria-valuetext")]}),[true,null],"no tide table, no spoken tide");
    assert.deepEqual(t.errors,[]);await t.context.close();checks++;
  }
  console.log(`${checks} interaction scenarios passed: matched chart heights, hourly and tide exploration, warnings, thunder coming at the farm, the farm's sections after the coast, the entrance across a cache-to-live paint and below the fold, offline recovery, and every line read by a real finger, the keys and a screen reader.`);
}finally{
  await browser.close();server.close();
}
