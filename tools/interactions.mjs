/**
 * Interaction regression checks, with fixed weather and no live data dependency.
 * TZ=America/New_York PORCH_FONT_DIR=/path/to/fonts node tools/interactions.mjs
 * Uses the same optional PORCH_CHROME_PATH as the visual harnesses.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serve, stage, SEVERE, forecast, tides, marine, LOC_TZ, FONT_CSS } from "./fixtures.mjs";
import { STORMS, alertsFrom, wssiAnswer } from "./storm-fixtures.mjs";
import { corpus } from "./storm-corpus.mjs";

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
/* a paint lands in stages: the stamp goes live with the header, then the hours a frame on, the week
   three after that and the rest three after that, so a chart measured at the stamp is the cache's or
   nothing (the tide measured 58px tall). PAINT settles when the latest paint's last stage has drawn,
   and a frame on everything it wrote has been laid out */
const painted=page=>page.evaluate(async()=>{await PAINT;await new Promise(r=>requestAnimationFrame(r))});
/* every frame's storm card, headline and strip, logged when one of them changes (window.__log) */
const STORM_FRAMES=()=>{window.__log=[];const look=()=>{const s=document.getElementById("stormSection"),st=document.getElementById("stamp");
  if(s&&st){const e={stamp:st.textContent,card:!s.hidden,v:document.getElementById("verdict").textContent,strip:document.querySelector("#alertStrip.on .alert-head")?.textContent||""};
    const l=window.__log[window.__log.length-1];if(!l||l.card!==e.card||l.v!==e.v||l.strip!==e.strip||l.stamp!==e.stamp)window.__log.push({t:Math.round(performance.now()),...e})}
  requestAnimationFrame(look)};requestAnimationFrame(look)};
const load=async page=>{
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
  await page.evaluate(()=>document.fonts.ready);
  await painted(page);
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
/* the week's points run CHART_IN in from each content edge like every other line, and each day's
   column is centred under its point, so a finger goes where the chart puts the day */
const weekAt=async(page,b)=>{const f=await page.evaluate(()=>XP.week.D.x.map(x=>x/XP.week.D.W));return i=>b.x+f[i]*b.width};
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
    assert.match(await fishing(),/fishing times: none clear, weather warning\.$/);
    /* and the moon's note says why there are none, beside the phase (Josh, October 10 2026) */
    assert.match(await page.locator("#moonNote").innerText(),/(^| · )weather warning$/);
    await page.locator("#alertStrip").click();
    assert.match(await page.locator(".alert-body").innerText(),/Move to an interior room/);
    assert.equal(await page.locator("#alertStrip").getAttribute("aria-expanded"),"true");
    features=features.map(f=>({properties:{...f.properties,ends:new Date(now.getTime()-60000).toISOString()}}));
    await page.evaluate(()=>refresh());await painted(page);
    assert.equal(await page.locator("#alertStrip").isVisible(),false);
    /* and when it has ended an ordinary day is the moon and its fishing times, and no card: never a green go */
    assert.doesNotMatch(await fishing(),/none clear/);
    assert.doesNotMatch(await page.locator("#moonNote").innerText(),/warning/,"a time drawn again needs no reason");
    assert.equal(await page.locator("#sayCard").isVisible(),false);
    assert.match(await page.locator("#moonSection .eyebrow b").innerText(),/^ALMANAC FISHING TIMES/);
    assert.deepEqual(errors,[]);await context.close();checks++;
  }
  for(const [loc,width,o] of [["mb",390,coast],["sp",320,{...base,code:1,popCurve:()=>5}]]){
    /* The warning strip enters once per open. A phone with saved weather paints the cache with the
       warning in it, and the live forecast lands a moment later with the same warning. The strip
       used to be written from scratch on that paint and on every one after it (a resize, a
       foreground, a re-render), so a strip opened on the cache came in again under the reader.
       It stays put now, open or not, and the words change in place when the warning is extended.
       It still enters when a different alert takes the lead, goes when the alert ends, and enters
       when the next one arrives. Motion is on, because the entrance is what is being counted. */
    const asAlerts=f=>f.map(({properties:p})=>({event:p.event,severity:p.severity,ends:p.ends,expires:p.expires,desc:p.description||"",inst:p.instruction||""}));
    const t=new Date(now.getTime()-20*6e4);
    let features=SEVERE(now);
    const m=await phone(width,o,loc,{motion:true,gate:true,when:now,
      cache:{k:"mbwx-"+loc,v:{savedAt:t.getTime(),data:{...cachePayload(t,o,loc),alerts:asAlerts(features)}}}});
    await m.page.route("**api.weather.gov/alerts**",route=>route.fulfill({json:{features}}));
    await m.page.addInitScript(()=>{
      window.__in={alertIn:0,briefIn:0};window.__writes=[];
      addEventListener("animationstart",e=>{if(e.target.closest?.("#alertStrip")&&e.animationName in __in)__in[e.animationName]++},true);
      window.__watch=()=>new MutationObserver(ms=>__writes.push(...ms.map(x=>x.type+":"+(x.attributeName||x.target.nodeName))))
        .observe(document.getElementById("alertStrip"),{attributes:true,childList:true,characterData:true,subtree:true});
    });
    const p=m.page,frames=n=>p.evaluate(n=>new Promise(r=>{const f=()=>--n?requestAnimationFrame(f):r();requestAnimationFrame(f)}),n);
    const state=()=>p.evaluate(()=>{const el=document.getElementById("alertStrip");
      return{...__in,writes:__writes.length,on:el.classList.contains("on"),open:el.getAttribute("aria-expanded"),
        head:el.querySelector(".alert-head")?.textContent||"",body:window.__body?window.__body===el.querySelector(".alert-body"):null}});
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(()=>document.getElementById("stamp").textContent.startsWith("updated")&&document.getElementById("alertStrip").classList.contains("on"));
    await p.waitForTimeout(700);
    assert.equal((await state()).alertIn,1,`${loc}: the strip enters on the cached paint`);
    /* open it while the cache is still the reading, and watch it from here */
    await p.locator("#alertStrip").click();
    await p.waitForTimeout(400);
    await p.evaluate(()=>{window.__body=document.querySelector("#alertStrip .alert-body");__watch()});
    const still=async(why)=>{
      const s=await state();
      assert.equal(s.briefIn,1,`${loc}: the open strip's body does not come in again on ${why}`);
      assert.equal(s.alertIn,1,`${loc}: the strip does not enter again on ${why}`);
      assert.equal(s.body,true,`${loc}: the open strip keeps its body on ${why}`);
      assert.equal(s.open,"true",`${loc}: and stays open on ${why}`);
      return s;
    };
    m.release();
    await p.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
    await frames(24);
    assert.equal((await still("the live paint")).writes,0,`${loc}: the same warning writes nothing to the strip on the live paint`);
    await p.evaluate(()=>render(LAST.d,LAST.live,LAST.savedAt));await frames(24);
    await p.setViewportSize({width:width+60,height:800});await p.waitForTimeout(300);await frames(24);
    await p.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));await p.waitForTimeout(300);await frames(24);
    assert.equal((await still("a re-render, a resize and a foreground")).writes,0,`${loc}: and nothing on a re-render, a resize or a foreground`);
    /* the warning extended: the words change in place, and nothing enters */
    const later=new Date(now.getTime()+90*6e4);
    features=features.map(f=>({properties:{...f.properties,ends:later.toISOString()}}));
    await p.evaluate(()=>refresh());await frames(24);
    const ext=await still("the warning being extended");
    assert.ok(ext.head.includes(await p.evaluate(t=>clock12(new Date(t)),later.getTime())),`${loc}: the strip says the new end: ${ext.head}`);
    /* a different alert takes the lead: the strip enters again, with its words */
    features=[{properties:{...SEVERE(now)[0].properties,event:"Tornado Warning",severity:"Extreme"}},...features];
    await p.evaluate(()=>refresh());await frames(24);
    let s=await state();
    assert.equal(s.alertIn,2,`${loc}: a different alert taking the lead enters`);
    assert.match(s.head,/^Tornado Warning/);assert.match(s.head,/ ·\u00A0\+1\u00A0more/,"the dot rides with the words after it");
    /* it ends: the strip goes. The next one enters */
    features=[];
    await p.evaluate(()=>refresh());await frames(24);
    assert.equal(await p.locator("#alertStrip").isVisible(),false,`${loc}: an ended alert takes the strip down`);
    features=SEVERE(now);
    await p.evaluate(()=>refresh());await frames(24);
    s=await state();
    assert.ok(s.on&&s.alertIn===3,`${loc}: the next alert to arrive enters: `+JSON.stringify(s));
    assert.equal(s.open,"false","and arrives closed");
    /* and it goes when it ends, with nothing touched: the Weather Service still lists it, ended */
    const soon=await p.evaluate(()=>Date.now()+2500);
    features=features.map(f=>({properties:{...f.properties,ends:new Date(soon).toISOString()}}));
    await p.evaluate(()=>refresh());await frames(24);
    assert.equal(await p.locator("#alertStrip").isVisible(),true);
    await p.waitForTimeout(4200);await frames(24);
    assert.equal(await p.locator("#alertStrip").isVisible(),false,`${loc}: the strip goes when the alert ends, with the app left open`);
    assert.deepEqual(m.errors,[]);await m.context.close();checks++;
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
    /* and on the very next frame nothing of the coast's is left under the farm's name: the cached
       paint lands in stages, and until its last stage the coast's week, its water and Wilmington's
       year sat there (about 70 to 130ms) */
    const first=await page.evaluate(()=>new Promise(r=>{document.getElementById("locBtn").click();requestAnimationFrame(()=>{const $=id=>document.getElementById(id);
      r({tide:getComputedStyle($("tideSection")).display,moon:$("moonSection").hidden,year:$("yearTitle").textContent,
        week:$("weekSvg").childElementCount===0||$("weekSvg").classList.contains("rv-pre"),tideSvg:$("tideSvg").childElementCount,alert:$("alertStrip").classList.contains("on")})})}));
    assert.equal(first.tide,"none","the coast's water is gone on the switch's first frame");
    assert.equal(first.moon,false,"the farm's moon is up on the switch's first frame");
    assert.match(first.year,/Shady Spring/,"the year is the farm's on the switch's first frame");
    assert.ok(first.week,"the coast's week is not drawn under the farm's name");
    assert.equal(first.tideSvg,0);
    /* the new place's shell names the farm's airport in the hover text before any paint lands */
    assert.match(await page.locator("#yearTitle").getAttribute("title"),/Beckley airport/,"the shell's hover text is the farm's airport");
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.startsWith("updated"));await painted(page);
    assert.equal(await page.locator("#moonSection").isVisible(),true,"the cached farm paint has its moon");
    assert.match(await page.locator("#yearTitle").innerText(),/SHADY SPRING/);
    assert.match(await page.locator("#yearTitle").getAttribute("title"),/Beckley airport/);
    assert.equal(await page.locator("#tideSection").isVisible(),false);
    release();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(page);
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
    await page.evaluate(()=>document.fonts.ready);await painted(page);
    /* how much of each drawing is on screen, measured in the page */
    await page.addScriptTag({content:"window.__vis=id=>{const b=document.getElementById(id).getBoundingClientRect();return b.height>0?(Math.min(b.bottom,innerHeight)-Math.max(b.top,0))/b.height:0}"});
    const before=await page.evaluate(()=>{const b=document.getElementById("weekSvg").getBoundingClientRect();
      scrollTo(0,b.top+scrollY-innerHeight+.34*b.height);
      return{strip:document.getElementById("nowcast").classList.contains("on"),verdict:document.getElementById("verdict").offsetHeight,week:__vis("weekSvg")}});
    await page.waitForTimeout(200);
    assert.ok(before.strip&&before.week>.3&&before.week<.6&&await page.evaluate(()=>REVEAL.week.seen&&REVEAL.week.state==="armed"),
      "the cache paints the strip and puts the week at the fold, still to be drawn: "+JSON.stringify(before));
    release();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(page);
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
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(page);
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
    await page.waitForFunction(()=>document.getElementById("stamp").textContent==="unavailable");await painted(page);
    assert.match(await page.locator("#verdict").innerText(),/Tap the timestamp to try again/);
    assert.equal(await page.locator("#refreshBtn").getAttribute("aria-busy"),"false");
    assert.equal(await page.locator(".skel").count(),0,"failed loading must end its skeleton animation");
    assert.equal(await page.locator(".live-dot").isVisible(),false,"no live pulse without a reading");
    offline=false;await page.locator("#refreshBtn").click();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(page);
    assert.equal(await page.locator("#bigTemp").innerText(),"67°");
    assert.equal(await page.locator(".live-dot").isVisible(),true);
    offline=true;await page.evaluate(()=>refresh());await painted(page);
    assert.match(await page.locator("#stamp").innerText(),/updated/i);
    assert.equal(await page.locator("#bigTemp").innerText(),"67°");
    offline=false;await page.evaluate(()=>window.dispatchEvent(new Event("online")));
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(page);
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
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll(".xp-key")].map(k=>k.disabled)),[true,true,true,true,true],"no slider before a reading (the storm card's is off on an ordinary day too)");
    release();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(page);
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
    const b=await inView(page,"#weekExplore"),n=await page.locator("#weekRows .wk-day").count(),cx=await weekAt(page,b),y=b.y+b.height*.55;
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
    const mb=await inView(m.page,"#weekExplore"),mcx=await weekAt(m.page,mb),my=mb.y+mb.height*.55;
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
    /* the water two feet over the table: at now the pill is the table plus the gap, the skiff on the
       curve is the mark there with "+2 ft" beside it and no ring, and an hour on is the table's */
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
    assert.equal(exp.markY,null,"no mark is drawn at the real water: the tag says the gap");
    assert.equal(s.rings.length,0,"the skiff is the mark at now");
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
    await page.evaluate(()=>render(LAST.d,true));await painted(page);
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
    await page.waitForFunction(()=>/updated/.test(document.getElementById("stamp").textContent));await painted(page);
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
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(page);
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
    await page.waitForFunction(()=>/updated/.test(document.getElementById("stamp").textContent));await painted(page);
    const r=await page.evaluate(()=>{const h=LAST.d.hourly,known=h.temp.map((v,i)=>v==null?null:i===0&&LAST.d.current.temperature_2m!=null?LAST.d.current.temperature_2m:v).filter(v=>v!=null);
      return{nan:/NaN/.test(document.getElementById("hourlySvg").innerHTML),marks:XP.hourly.D.marks,low:Math.round(Math.min(...known)),
        labels:[...document.querySelectorAll("#hourlySvg text")].map(e=>e.textContent),said:XP.hourly.D.read(5).said}});
    assert.equal(r.nan,false,"nothing in the hourly is drawn at NaN");
    assert.ok(r.marks.every(i=>i>=0),"no mark at -1: "+r.marks);
    assert.ok(r.labels.includes(r.low+"°"),`the real low ${r.low}° keeps its label: ${r.labels}`);
    assert.match(r.said,/temperature unavailable/);
    /* The Tonight card reads the same run: a missing night hour is neither zero nor permission
       to call the rest of a partial night its low. */
    const eve0=await page.evaluate(()=>{const d=structuredClone(LAST.d),h=d.hourly,set=new Date(d.daily.sunset[0]),rise=new Date(d.daily.sunrise[1]);
      const night=h.time.map((t,i)=>i).filter(i=>new Date(h.time[i])>=set&&new Date(h.time[i])<=rise);
      h.temp[night[2]]=null;render(d,false,LAST.savedAt);
      const low=Math.round(Math.min(...night.filter(i=>h.temp[i]!=null).map(i=>+h.temp[i])));
      return{n:night.length,low}});
    await painted(page);
    const eve={...eve0,text:await page.evaluate(()=>document.getElementById("eveLead").textContent)};
    assert.ok(eve.n>3,"the run reaches into the night");
    assert.doesNotMatch(eve.text,/Low\u00A00°/,"a missing night hour is not a zero: "+eve.text);
    assert.match(eve.text,/Low unavailable/,`the incomplete night has no claimed low: ${eve.text}`);
    /* past the last known hour there is no neighbour: the line and its fill stop there rather than
       holding flat a temperature the run does not carry, and with one known hour there is no line */
    await page.evaluate(()=>{const d=structuredClone(LAST.d),h=d.hourly,n=h.temp.length;h.temp=h.temp.map((t,i)=>i>=n-8?null:t);
      window.__tail=d;render(d,false,LAST.savedAt)});
    await painted(page);
    const tail=await page.evaluate(()=>{const d=window.__tail,h=d.hourly,n=h.temp.length,xs=el=>(el.getAttribute("d").match(/-?\d+(?:\.\d+)?/g)||[]).map(Number).filter((_,j)=>j%2===0);
      const svg=document.getElementById("hourlySvg"),last=XP.hourly.D.x[n-9];
      const r={last,line:Math.max(...xs(svg.querySelector(".tline"))),clip:Math.max(...xs(svg.querySelector("#hourlyArea path"))),nan:/NaN/.test(svg.innerHTML)};
      h.temp=h.temp.map((t,i)=>i===0?t:null);render(d,false,LAST.savedAt);return r});
    await painted(page);
    tail.one=await page.evaluate(()=>document.getElementById("hourlySvg").querySelector(".tline").getAttribute("d"));
    assert.equal(tail.nan,false,"nothing is drawn at NaN past the run's temperatures");
    assert.ok(tail.line<=tail.last+.5&&tail.clip<=tail.last+.5,`the line (${tail.line}) and its fill (${tail.clip}) stop at the last known hour (${tail.last})`);
    assert.equal(tail.one,"","one known hour draws no line");
    /* the week too: a missing high runs its line between the known days and prints no "0°" */
    await page.evaluate(()=>{const d=structuredClone(LAST.d);d.daily.temperature_2m_max[3]=null;render(d,false,LAST.savedAt)});
    await painted(page);
    const wk=await page.evaluate(()=>{
      const svg=document.getElementById("weekSvg"),H=svg.viewBox.baseVal.height,ys=(svg.querySelector(".tline").getAttribute("d").match(/-?\d+(?:\.\d+)?/g)||[]).map(Number).filter((_,j)=>j%2);
      return{labels:[...svg.querySelectorAll("text")].map(e=>e.textContent),nan:/NaN/.test(svg.innerHTML),lo:Math.max(...ys),H}});
    assert.equal(wk.nan,false,"nothing in the week is drawn at NaN");
    assert.ok(!wk.labels.includes("0°"),"a missing high is not 0°: "+wk.labels);
    assert.ok(wk.lo<wk.H-12,`the high line stays on the chart (${wk.lo} under ${wk.H-12})`);
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
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(page);
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
    /* a press ends wherever the finger comes up. Until a slide captures it a press has only the
       browser's hold on the node pressed, and a repaint replaces that node (an hour label, a month
       letter), so a lift a few pixels under the chart never reached it and the reading stayed up
       for good. And a tap may settle as far as the browser's own tap does: a firm press whose pad
       rolls 7px and rests reads on the hold and at the lift, as the week opens its day for it */
    for(const [loc,width] of [["mb",390],["sp",320]]){
      const {context,page,errors,cdp}=await phone(width,coast,loc);
      await load(page);
      for(const [k,sel] of [["hourly","#hrLabels span:nth-child(4)"],["year","#yearMonths span:nth-child(6)"]]){
        const b=await inView(page,`#${k}Explore`),l=await page.locator(sel).boundingBox(),x=l.x+l.width/2;
        await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y:l.y+l.height/2}]});
        await page.waitForTimeout(30);
        await page.evaluate(()=>render(LAST.d,LAST.live,LAST.savedAt));
        await page.waitForTimeout(16);
        await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:b.y+b.height+3}]});
        await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
        await page.waitForTimeout(2800);
        await page.evaluate(()=>render(LAST.d,LAST.live,LAST.savedAt));
        const s=await xpState(page,k),ptr=await page.evaluate(k=>XP[k].ptr,k);
        assert.ok(ptr==null&&!s.shown,`${k} at ${width}: a press whose node a repaint replaced ends at a lift off the chart (ptr ${ptr}, pill ${s.text})`);
      }
      for(const k of loc==="mb"?["hourly","tide"]:["moon","year"]){
        const b=await inView(page,`#${k}Explore`),x=b.x+b.width*.5,y=b.y+b.height*.45;
        let held=false;
        await touch(cdp,page,[[x,y],[x,y+2.8],[x,y+5.6],[x,y+7]],{end:false});
        await page.waitForTimeout(600);held=(await xpState(page,k)).shown;
        await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
        await page.waitForTimeout(60);
        assert.ok(held&&(await xpState(page,k)).shown,`${k} at ${width}: a press that settles 7px reads on the hold and at the lift`);
        await page.waitForTimeout(2600);
        await touch(cdp,page,[[x,y],[x,y+3],[x,y+6],[x,y+8]],{dt:30});
        await page.waitForTimeout(60);
        assert.equal((await xpState(page,k)).shown,true,`${k} at ${width}: a quick tap that drifts 8px reads`);
        await page.waitForTimeout(2600);
      }
      assert.deepEqual(errors,[]);await context.close();checks++;
    }
  }
  {
    /* the week: a tap just after a slide is a tap, and the click a short slide leaves behind is
       still the slide's; a missing daily high is a dash with no ring */
    const {context,page,errors,cdp}=await phone(320,{...wetSunday,dailyTemps:(hi,lo,c)=>{wetSunday.dailyTemps(hi,lo,c);hi[3]=null}},"sp",{when:sunday});
    await load(page);
    const b=await inView(page,"#weekExplore"),cx=await weekAt(page,b),y=b.y+b.height*.55;
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
      const mb=await inView(m.page,"#weekExplore"),mcx=await weekAt(m.page,mb),my=mb.y+mb.height*.55;
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
    assert.deepEqual(await off(),[null,null,null,null,null],"the loading shell speaks no reading");
    release();
    await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(page);
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
  {
    /* A first open in a storm whose card waits on the beach zone: Debby's tropical storm warning was the
       beach's alone, so the house's own alerts raise nothing and the card is the lane's. The lane starts
       beside the forecast. In time, the card is part of the first frame and the hours under it never
       move. Late (past STORM_WAIT), the card comes in with the reader's view held: scrolled down to the
       week, nothing on screen moves; scrolled partway, with the header's foot 150px down the screen,
       the hours under it hold still (anchored on the header, they jumped by the card); at the top, the
       sky and the headline stay where they are. And the storm is cached with the forecast, so the next
       open shows the card on its cached paint */
    const deb=STORMS["debby-flood-coast"],at=new Date(deb.when);
    for(const [delay,scroll] of [[1200,false],[5200,true],[5200,"partial"],[5200,false]]){
      const m=await phone(390,{...deb.o,storm:deb.name},deb.loc,{when:at});
      let landed;const lane=new Promise(r=>landed=r);
      await m.page.route(/alerts\/active\?zone=/,async r=>{await new Promise(res=>setTimeout(res,delay));landed();await r.fallback()});
      await m.page.addInitScript(()=>{window.__first=null;const look=()=>{const st=document.getElementById("stamp");
        if(!window.__first&&st&&st.textContent.includes("live")){const h=document.querySelector("#hourlyExplore").closest("section");
          window.__first={card:!document.getElementById("stormSection").hidden,hours:h.getBoundingClientRect().top-document.getElementById("sky").getBoundingClientRect().bottom,verdict:document.getElementById("verdict").textContent}}
        if(!window.__first)requestAnimationFrame(look)};requestAnimationFrame(look)});
      const p=m.page,top=sel=>p.evaluate(s=>document.querySelector(s).getBoundingClientRect().top,sel);
      await p.goto(`http://localhost:${PORT}/`);
      await p.waitForFunction(()=>window.__first);await painted(p);
      const first=await p.evaluate(()=>window.__first);
      if(delay<3000){
        assert.equal(first.card,true,"a lane in time is part of the first frame");
        assert.match(first.verdict,/^Tropical Storm Debby is closest Thursday morning\.$/);
        /* the strip and the rain-soon bars still land with the last stage, inside the header, as they
           always have; between the header and the hours nothing moves after the first frame */
        assert.equal(await p.evaluate(()=>document.querySelector("#hourlyExplore").closest("section").getBoundingClientRect().top-document.getElementById("sky").getBoundingClientRect().bottom),first.hours,"and the hours never move under it");
        /* the next open, offline: the storm was cached with the forecast, and the cached paint shows it */
        const q=await m.context.newPage();
        await stage(q,{now:at,loc:deb.loc,o:{...deb.o,storm:deb.name},fontDir:FONT_DIR,port:PORT});
        await q.route("**api.open-meteo.com**",r=>r.abort());await q.route("**api.weather.gov/**",r=>r.abort());
        await q.goto(`http://localhost:${PORT}/`);
        await q.waitForFunction(()=>/updated|ago/.test(document.getElementById("stamp").textContent));
        await q.evaluate(async()=>{await PAINT});
        assert.equal(await q.evaluate(()=>!document.getElementById("stormSection").hidden&&document.getElementById("stormTitle").textContent),"Tropical Storm Debby","the cached paint shows the card");
        assert.equal(await q.locator("#stormWarns").innerText(),"TROPICAL STORM WARNING AT THE BEACH");
        await q.close();
      }else{
        assert.equal(first.card,false,"a lane past STORM_WAIT is not waited for");
        if(scroll==="partial")await p.evaluate(()=>scrollTo(0,document.getElementById("sky").getBoundingClientRect().bottom+scrollY-150));
        else if(scroll)await p.evaluate(()=>scrollTo(0,document.getElementById("weekRows").getBoundingClientRect().top+scrollY-120));
        await p.waitForTimeout(80);
        const before={week:await top("#weekRows"),hours:await top("#hourlyExplore"),sky:await p.evaluate(()=>document.getElementById("sky").getBoundingClientRect().bottom),strip:await top("#alertStrip"),y:await p.evaluate(()=>scrollY)};
        if(scroll==="partial")assert.ok(Math.abs(before.sky-150)<2,`the header's foot is 150px down the screen: ${before.sky}`);
        await lane;
        await p.waitForFunction(()=>!document.getElementById("stormSection").hidden);await painted(p);await p.waitForTimeout(60);
        const card=await p.evaluate(()=>document.getElementById("stormSection").getBoundingClientRect().height);
        if(scroll==="partial"){
          /* the hours the reader is looking at hold still, and the part of the sky above them goes up */
          assert.ok(Math.abs(await top("#hourlyExplore")-before.hours)<1,`scrolled partway, the hours under the late card hold still: ${before.hours} then ${await top("#hourlyExplore")}`);
          assert.ok(Math.abs(await top("#weekRows")-before.week)<1,"and so does the week under them");
          assert.ok(await p.evaluate(()=>scrollY)-before.y>card*.8,"the page scrolled by the card");
        }else if(scroll){
          assert.ok(Math.abs(await top("#weekRows")-before.week)<1,`scrolled down, the late card moves nothing on screen: ${before.week} then ${await top("#weekRows")}`);
          /* the headline above changed to the storm's too, so the page scrolled by the card and that */
          const dy=await p.evaluate(()=>scrollY)-before.y;
          assert.ok(dy>card*.8&&dy<card*1.5,`the page scrolled once, by about the card's height, not twice: ${dy} for a card of ${card}`);
        }else{
          /* at the top the page does not scroll and the sky stays where it is: what moves is under the
             card, and the storm's statement leaving the strip (the card takes it in) */
          assert.equal(await top("#alertStrip"),before.strip,"at the top the sky stays where it is");
          assert.equal(await p.evaluate(()=>scrollY),0);
          assert.match((await p.locator("#alertStrip .alert-head").innerText()).replace(/ /g," "),/^FLOOD WATCH · UNTIL 8:00 AM FRI$/,"the card takes in the storm's statement, and the house's Flood Watch keeps its words");
        }
        assert.match(await p.locator("#verdict").innerText(),/^Tropical Storm Debby is closest Thursday morning\.$/,"and the page says the storm once it is in");
      }
      assert.deepEqual(m.errors,[]);await m.context.close();checks++;
    }
  }
  {
    /* A renewed beach warning (October 10 2026). Debby's tropical storm warning is the beach's alone, and
       its expiry is only when the next advisory is due: with the app left open, the strip's timer asks for
       the forecast a second after it, and by then the Weather Service has renewed it. The advisories are
       slower than the forecast. Painted on the cached beach, the card came down and the headline went back
       to "Raining now.", and both came back when the advisories landed. Every frame is watched */
    const deb=STORMS["debby-flood-coast"],at=new Date(deb.when);
    const beachTill=e=>deb.beach.map(f=>(f.properties.parameters.VTEC||[]).some(v=>/\.TR\.W\./.test(v))?{...f,properties:{...f.properties,expires:e.toISOString()}}:f);
    const m=await phone(390,{...deb.o,storm:deb.name},deb.loc,{when:at});
    let asked=0;
    await m.page.route(/alerts\/active\?zone=/,r=>{asked++;r.fulfill({json:{features:beachTill(asked===1?new Date(+at+9000):new Date(+at+6*36e5))}})});
    await m.page.route(/products\/types\/TCP/,async r=>{if(asked>1)await new Promise(res=>setTimeout(res,1500));await r.fallback()});
    await m.page.addInitScript(()=>{window.__log=[];const look=()=>{const sec=document.getElementById("stormSection"),v=document.getElementById("verdict");
      if(sec&&v)window.__log.push({hidden:sec.hidden,v:v.textContent,live:/live/.test(document.getElementById("stamp")?.textContent||"")});requestAnimationFrame(look)};requestAnimationFrame(look)});
    const p=m.page;
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(()=>!document.getElementById("stormSection").hidden);
    /* the expiry passes, the forecast is asked for again, the renewed beach lands, then the advisories */
    await p.waitForFunction(()=>window.__log.length&&performance.now()>0,null,{timeout:2000});
    await p.waitForTimeout(13500);
    await painted(p);
    assert.ok(asked>=2,`the strip's timer asked again at the beach's expiry: ${asked}`);
    const log=await p.evaluate(()=>window.__log),from=log.findIndex(x=>!x.hidden);
    assert.ok(from>=0&&log.length-from>200,"watched every frame: "+log.length);
    assert.ok(log.slice(from).every(x=>!x.hidden),"the card never comes down across its warning's renewal");
    assert.ok(log.slice(from).every(x=>/^Tropical Storm Debby is closest Thursday morning\.$/.test(x.v)),"and the headline never leaves the storm: "+[...new Set(log.slice(from).map(x=>x.v))].join(" | "));
    assert.equal(await p.evaluate(()=>STORM_NOW&&STORM_NOW.tier),"storm");
    assert.deepEqual(m.errors,[]);await m.context.close();checks++;
  }
  {
    /* A first open with the advisories slow (3.7s, past STORM_WAIT) and the beach zone fast: the beach's
       answer is in hand, so the card is in the first frame, said as the beach's warning, and only its title
       changes when the advisories land. It was painted without it, then pushed the hours down after their
       pen had started */
    const deb=STORMS["debby-flood-coast"],at=new Date(deb.when);
    const m=await phone(390,{...deb.o,storm:deb.name},deb.loc,{when:at});
    await m.page.route(/products\/types\/TCP/,async r=>{await new Promise(res=>setTimeout(res,3700));await r.fallback()});
    await m.page.addInitScript(()=>{window.__first=null;const look=()=>{const st=document.getElementById("stamp");
      if(!window.__first&&st&&st.textContent.includes("live"))window.__first={card:!document.getElementById("stormSection").hidden,title:document.getElementById("stormTitle").textContent,verdict:document.getElementById("verdict").textContent,
        hours:document.querySelector("#hourlyExplore").getBoundingClientRect().top};
      if(window.__first)(window.__hid||=[]).push(document.getElementById("stormSection").hidden);
      requestAnimationFrame(look)};requestAnimationFrame(look)});
    const p=m.page;
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(()=>window.__first);
    const first=await p.evaluate(()=>window.__first);
    assert.equal(first.card,true,"the beach's warning is in the first frame");
    assert.match(first.verdict,/^Tropical Storm Warning at the beach\.$/,"said as the beach's, before the advisories name it");
    await p.waitForFunction(()=>document.getElementById("stormTitle").textContent==="Tropical Storm Debby",null,{timeout:8000});await painted(p);
    assert.match(await p.locator("#verdict").innerText(),/^Tropical Storm Debby is closest Thursday morning\.$/);
    assert.ok(await p.evaluate(()=>window.__hid.length>30&&window.__hid.every(h=>!h)),"and the card stays up while the advisories land: only its words change");
    assert.deepEqual(m.errors,[]);await m.context.close();checks++;
  }
  {
    /* A card that grows under a reader whose screen starts inside it. Florence's house Hurricane Warning
       puts the card up on the first paint, titled "Hurricane Warning", with the advisories late (past
       STORM_WAIT); when they land it becomes "Hurricane Florence" with its note and its closest point, and
       grows. The view held on the card's own top, off the screen, and moved the hours under the reader */
    const flo=STORMS["florence-coast"],at=new Date(flo.when);
    for(const width of [320,390]){
      const m=await phone(width,{...flo.o,storm:flo.name},"mb",{when:at});
      let go;const gate=new Promise(r=>go=r);
      await m.page.route(/products\/types\/TCP/,async r=>{await Promise.race([gate,new Promise(res=>setTimeout(res,4200))]);await r.fallback()});
      const p=m.page,top=sel=>p.evaluate(s=>document.querySelector(s).getBoundingClientRect().top,sel);
      await p.goto(`http://localhost:${PORT}/`);
      await p.waitForFunction(()=>!document.getElementById("stormSection").hidden&&document.getElementById("stamp").textContent.includes("live"));await painted(p);
      assert.equal(await p.locator("#stormTitle").innerText(),"HURRICANE WARNING","the house's warning puts the card up before the advisories");
      const h0=await p.evaluate(()=>document.getElementById("stormSection").getBoundingClientRect().height);
      await p.evaluate(()=>scrollTo(0,document.getElementById("stormSection").getBoundingClientRect().top+scrollY+100));
      await p.waitForTimeout(60);
      assert.ok(Math.abs(await top("#stormSection")+100)<2,"the card's top is 100px above the screen");
      const before=await top("#hourlyExplore");
      go();
      await p.waitForFunction(()=>document.getElementById("stormTitle").textContent==="Hurricane Florence",null,{timeout:8000});await painted(p);await p.waitForTimeout(60);
      const h1=await p.evaluate(()=>document.getElementById("stormSection").getBoundingClientRect().height);
      assert.ok(h1-h0>2,`the card grew when the advisories landed: ${h0} then ${h1}`);
      assert.ok(Math.abs(await top("#hourlyExplore")-before)<1,`at ${width} the hours under the reader hold still: ${before} then ${await top("#hourlyExplore")}`);
      assert.deepEqual(m.errors,[]);await m.context.close();checks++;
    }
  }
  {
    /* A Tornado Warning issued under Florence's Hurricane Warning is minutes away: it takes the strip on
       its own, enters, and keeps its own words and instruction, and it is never folded into the card.
       When it ends the strip goes back to the hurricane, which leads it while the card is up */
    const flo=STORMS["florence-coast"],at=new Date(flo.when);
    const tor={properties:{id:"urn:fixture:TORILM",event:"Tornado Warning",severity:"Extreme",certainty:"Observed",urgency:"Immediate",
      sent:"2018-09-13T11:40:00-04:00",onset:"2018-09-13T11:40:00-04:00",ends:"2018-09-13T12:15:00-04:00",expires:"2018-09-13T12:15:00-04:00",
      description:"* WHAT...A tornado moving ashore from a waterspout.\n\n* WHERE...Porters Neck and Ogden.",
      instruction:"TAKE COVER NOW! Move to a basement or an interior room on the lowest floor of a sturdy building.",
      parameters:{VTEC:["/O.NEW.KILM.TO.W.0031.180913T1540Z-180913T1615Z/"],AWIPSidentifier:["TORILM"],tornadoDetection:["RADAR INDICATED"]}}};
    let torn=true;
    const m=await phone(390,{...flo.o,storm:flo.name},"mb",{when:at,motion:true});
    await m.page.route(/alerts\/active\?point=/,r=>r.fulfill({json:{features:torn?[...flo.point,tor]:flo.point}}));
    await m.page.addInitScript(()=>{window.__in=0;addEventListener("animationstart",e=>{if(e.animationName==="alertIn"&&e.target.id==="alertStrip")__in++},true)});
    const p=m.page,head=async()=>(await p.locator("#alertStrip .alert-head").innerText()).replace(/ /g," ");
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(p);
    assert.equal(await head(),"TORNADO WARNING · UNTIL 12:15 PM · +3 MORE","the tornado leads the strip over the hurricane");
    await p.locator("#alertStrip").click();
    const body=await p.locator("#alertStrip .alert-body").innerText();
    assert.match(body,/TAKE COVER NOW!/i,"with its own instruction");
    assert.match(body,/also active: Hurricane Warning, Storm Surge Warning, Flash Flood Watch/i);
    assert.equal(await p.locator("#stormTitle").innerText(),"HURRICANE FLORENCE","the card is the storm's");
    assert.equal(await p.locator("#stormWarns").innerText(),"HURRICANE WARNING · STORM SURGE WARNING","and the tornado is not folded into it");
    assert.match(await p.locator("#stormSay").innerText(),/^Now is the time to shelter from life-threatening wind\./);
    const entered=await p.evaluate(()=>__in);
    torn=false;await p.evaluate(()=>refresh());await painted(p);await p.waitForTimeout(100);
    assert.equal(await head(),"HURRICANE WARNING · +2 MORE","once it ends the hurricane leads again");
    assert.ok(await p.evaluate(()=>__in)>entered,"and the strip enters for it");
    assert.deepEqual(m.errors,[]);await m.context.close();checks++;
  }
  {
    /* Debby's own timings (October 10 2026). Refreshed at 11:40, the beach's tropical storm warning runs
       out at 7 pm, and the strip's timer asks for the forecast then, 7h20m on, when the cache can no longer
       vouch for itself (past its six hours). The page's own reading for this place stands in for it: the
       stale beach is waited for, and the paint keeps the page's storms until the advisories land. With the
       beach fast and slow (1.5 s) and the advisories slower still (2.5 s), every frame is watched: the card
       never comes down, and its title and the headline stay the storm's. With only the cache to go on, the
       title went to "4–8 inches of rain at the beach", or the card came down under "Raining now." And with
       the beach slower than STORM_WAIT (4.5 s) or failing outright: the page's own beach, fetched 7h21m
       before and a minute past its expiry, still stands, because the window is the warning's own expiry plus
       six hours and not the fetch's age. It came down under "Raining now." until the next refresh */
    const deb=STORMS["debby-flood-coast"],at=new Date(deb.when);
    const renewed=deb.beach.map(f=>(f.properties.parameters.VTEC||[]).some(v=>/\.TR\.W\./.test(v))?{...f,properties:{...f.properties,expires:"2024-08-08T01:00:00-04:00"}}:f);
    for(const beachMs of [0,1500,4500,"fail"]){
      const m=await phone(390,{...deb.o,storm:deb.name},deb.loc,{when:at});
      let later=false;
      await m.page.route(/alerts\/active\?zone=/,async r=>{if(later&&beachMs==="fail")return r.fulfill({status:503,json:{title:"Service Unavailable"}});
        if(later)await new Promise(res=>setTimeout(res,beachMs));r.fulfill({json:{features:later?renewed:deb.beach}})});
      await m.page.route(/products\/types\/TCP/,async r=>{if(later)await new Promise(res=>setTimeout(res,2500));await r.fallback()});
      const p=m.page;
      await p.goto(`http://localhost:${PORT}/`);
      await p.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live")&&!document.getElementById("stormSection").hidden);await painted(p);
      assert.equal(await p.evaluate(()=>Math.min(...stormDue(LAST.d,STORM_NOW,Date.now()).map(a=>Date.parse(a.ends||a.expires)))),Date.parse("2024-08-07T19:00:00-04:00"),"the beach's warning is due at 7 pm");
      /* 7h21m on, on the page's own clock, the way the strip's timer finds it */
      await p.evaluate(()=>{const RD=Date,base=RD.now,jump=7*36e5+21*6e4;const F=function(...a){return a.length?new RD(...a):new RD(base()+jump)};
        F.now=()=>base()+jump;F.parse=RD.parse;F.UTC=RD.UTC;F.prototype=RD.prototype;window.Date=F});
      assert.equal(await p.evaluate(()=>readCache(LOC.id)),null,"the cache can no longer vouch");
      await p.evaluate(()=>{window.__log=[];const look=()=>{window.__log.push({card:!document.getElementById("stormSection").hidden,title:document.getElementById("stormTitle").textContent,
        v:document.getElementById("verdict").textContent});requestAnimationFrame(look)};requestAnimationFrame(look)});
      later=true;
      await p.evaluate(()=>refresh());
      await p.waitForTimeout(beachMs===4500?6400:3600);await painted(p);
      const log=await p.evaluate(()=>window.__log);
      assert.ok(log.length>100,`watched every frame: ${log.length}`);
      assert.ok(log.every(x=>x.card),`beach ${beachMs}ms: the card never comes down`);
      assert.deepEqual([...new Set(log.map(x=>x.title))],["Tropical Storm Debby"],`beach ${beachMs}ms: the title stays the storm's`);
      assert.ok(log.every(x=>/^Tropical Storm Debby is closest /.test(x.v)),`beach ${beachMs}ms: and so does the headline: ${[...new Set(log.map(x=>x.v))].join(" | ")}`);
      assert.equal(await p.evaluate(()=>STORM_NOW.alerts.find(a=>a.where==="beach")&&LAST.d.beach.find(a=>/Tropical Storm Warning/.test(a.event)).expires),
        beachMs==="fail"?"2024-08-07T19:00:00-04:00":"2024-08-08T01:00:00-04:00",beachMs==="fail"?"the beach failed: the page's own warning, a minute past its expiry, still stands":"the renewed warning, in the reading");
      assert.deepEqual(m.errors,[]);await m.context.close();checks++;
    }
    /* A cold open on a cache two hours old, whose beach warning reached its expiry an hour ago and has been
       renewed upstream (the beach answers in 1.5 s). The cached warning still stands until the live answer
       decides, so the card is in the cached frame, and the hours never move once their pen has started.
       Painted as ended, the cached frame said "Raining now. Keep the rain gear close." under a tropical
       storm, and the card landed on the running pen 371px down. Once with the cache's own fetch times, and
       once with a cache written before they were kept, which has only its own age */
    for(const old of [false,true]){
      const m=await phone(390,{...deb.o,storm:deb.name},deb.loc,{when:at,motion:true});
      let ms=0;
      await m.page.route(/alerts\/active\?zone=/,async r=>{await new Promise(res=>setTimeout(res,ms));r.fulfill({json:{features:renewed}})});
      const p=m.page;
      await p.goto(`http://localhost:${PORT}/`);
      await p.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(p);
      await p.evaluate(old=>{const k=cacheKey(LOC.id),c=JSON.parse(localStorage.getItem(k)),t0=Date.now();c.savedAt=t0-2*36e5;
        if(old)delete c.data.seen;else c.data.seen={point:t0-2*36e5,beach:t0-2*36e5};
        for(const a of c.data.beach||[])if(/Tropical Storm Warning/.test(a.event))a.expires=new Date(t0-36e5).toISOString();
        localStorage.setItem(k,JSON.stringify(c))},old);
      await p.addInitScript(()=>{window.__log=[];const look=()=>{const s=document.getElementById("stormSection"),st=document.getElementById("stamp"),h=document.querySelector("#hourlyExplore");
        if(s&&st&&h&&typeof REVEAL!=="undefined")window.__log.push({stamp:st.textContent,card:!s.hidden,pen:REVEAL.hourly.state,v:document.getElementById("verdict").textContent,hours:h.getBoundingClientRect().top+scrollY});
        requestAnimationFrame(look)};requestAnimationFrame(look)});
      /* tall enough that the hours are on screen under the card, so their pen plays on the cached paint */
      await p.setViewportSize({width:390,height:1500});
      ms=1500;
      await p.reload();
      await p.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"),null,{timeout:8000});await p.waitForTimeout(1500);
      const log=await p.evaluate(()=>window.__log),tag=old?"an older cache":"the cache";
      const cached=log.filter(x=>/ago/.test(x.stamp));
      assert.ok(cached.length>5&&cached.every(x=>x.card),`${tag}: the card is in the cached frame: ${JSON.stringify(cached.slice(0,2))}`);
      assert.ok(log.every(x=>!/rain gear/i.test(x.v)),`${tag}: never "Raining now." under the storm`);
      const from=log.findIndex(x=>x.pen==="running"||x.pen==="done");
      assert.ok(from>=0&&from<log.findIndex(x=>/live/.test(x.stamp)),`${tag}: the pen started on the cached paint, before the beach answered`);
      assert.ok(log.slice(from).every(x=>Math.abs(x.hours-log[from].hours)<1),`${tag}: and the hours never move after it starts: ${[...new Set(log.slice(from).map(x=>Math.round(x.hours)))].join(" → ")}`);
      assert.ok(log.filter(x=>/live/.test(x.stamp)).every(x=>x.card),`${tag}: the live paint keeps it`);
      assert.deepEqual(m.errors,[]);await m.context.close();checks++;
    }
  }
  {
    /* The latch on the page (October 11 2026). RLX's January 5 2025 warning raised the farm's card with WPC's
       index at Major. One refresh then has the point's alerts fail (api.weather.gov times out under storm
       load): that paint is on the last good list, carried, so the card stays up, and it never rewrites the
       latch or the last index. The next refresh has the same warning back with the index stepped down to Moderate, and the card
       stays up. It came down for the rest of the warning. Then a cold open the next morning, with the cache
       a day old (readCache will not vouch for it), a CON update and the index at Moderate: the latch is read
       out of the cache entry whatever its age, and the card is up from the first live paint */
    const sif=STORMS["snow-ice-farm"],at=new Date(sif.when);
    let mode="ok",level=["MODERATE","MAJOR","WINTER WEATHER AREA"];
    const m=await phone(390,{...sif.o,storm:sif.name},sif.loc,{when:at});
    await m.page.route(/alerts\/active\?point=/,r=>mode==="fail"?r.fulfill({status:503,json:{title:"Service Unavailable"}}):r.fulfill({json:{features:sif.point}}));
    await m.page.route(/mapservices\.weather\.noaa\.gov/,r=>r.fulfill({json:wssiAnswer(level,"2025-01-05T06:00:00Z")}));
    const p=m.page,state=()=>p.evaluate(()=>({card:!document.getElementById("stormSection").hidden,why:STORM_NOW?.why||"",held:JSON.stringify(STORM_HELD.sp||null),
      dheld:JSON.stringify(LAST?.d?.held||null),wssi:LAST?.d?.wssi?.impact||null,alerts:Array.isArray(LAST?.d?.alerts),carried:!!LAST?.d?.seen?.carried}));
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(p);await p.waitForTimeout(400);await painted(p);
    const s1=await state();
    assert.ok(s1.card&&/^F3: a winter storm warning/.test(s1.why),`the card, at Major: ${JSON.stringify(s1)}`);
    assert.match(s1.held,/"KRLX\.WS\.W\.2":\{"rule":"F3"/);
    mode="fail";await p.evaluate(()=>refresh());await p.waitForTimeout(1200);await painted(p);
    const s2=await state();
    assert.deepEqual([s2.alerts,s2.carried,s2.card],[true,true,true],"the point's alerts failed: the paint is on the last good list, carried, and the card stays up: "+JSON.stringify(s2));
    assert.deepEqual([s2.held,s2.dheld,s2.wssi],[s1.held,s1.held,"MAJOR"],"a paint with no fresh point list leaves the latch and the last index as they were");
    assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem("mbwx-sp")).data.held&&JSON.stringify(JSON.parse(localStorage.getItem("mbwx-sp")).data.held)),s1.held,"and so does its cache");
    mode="ok";level=["MODERATE","MODERATE",null];await p.evaluate(()=>refresh());await p.waitForTimeout(1500);await painted(p);
    const s3=await state();
    assert.equal(s3.wssi,"MODERATE","the index stepped down");
    assert.ok(s3.card&&/^F3: held while the same warning stands/.test(s3.why),`Major, a failed fetch, then the same warning at Moderate: the card stays up: ${JSON.stringify(s3)}`);
    assert.deepEqual(m.errors,[]);
    /* the next morning, a cold open */
    const con=corpus().find(e=>e.issued==="2025-01-06T06:12:00Z"&&e.zone==="WVZ516"),next=new Date("2025-01-06T07:00:00-05:00");
    const q=await m.context.newPage(),qerr=[];q.on("pageerror",e=>qerr.push(String(e)));
    await stage(q,{now:next,loc:sif.loc,o:{...sif.o,storm:sif.name},fontDir:FONT_DIR,port:PORT});
    await q.route(/alerts\/active\?point=/,r=>r.fulfill({json:{features:alertsFrom(con.product,con.zone)}}));
    await q.route(/mapservices\.weather\.noaa\.gov/,r=>r.fulfill({json:wssiAnswer(["MODERATE","MODERATE",null],"2025-01-06T06:00:00Z")}));
    await q.addInitScript(()=>{window.__first=null;
      document.addEventListener("DOMContentLoaded",()=>{window.__open={vouched:readCache("sp")!==null,held:JSON.stringify(JSON.parse(localStorage.getItem("mbwx-sp")||"null")?.data?.held||null)}});
      const look=()=>{const st=document.getElementById("stamp");
      if(!window.__first&&st&&st.textContent.includes("live"))window.__first={card:!document.getElementById("stormSection").hidden};
      if(!window.__first)requestAnimationFrame(look)};requestAnimationFrame(look)});
    await q.goto(`http://localhost:${PORT}/`);
    await q.waitForFunction(()=>window.__first);await painted(q);await q.waitForTimeout(1500);await painted(q);
    const first=await q.evaluate(()=>window.__first);
    const opened=await q.evaluate(()=>window.__open);
    assert.deepEqual([opened.vouched,opened.held],[false,s3.held],"the cache is yesterday's, which readCache will not vouch for, and it holds the latch");
    assert.equal(first.card,true,"a cold open the next morning: the card is up from the first live paint");
    const qs=await q.evaluate(()=>({card:!document.getElementById("stormSection").hidden,why:STORM_NOW?.why||"",wssi:LAST.d.wssi?.impact,title:document.getElementById("stormTitle").textContent}));
    assert.ok(qs.card&&/^F3: held while the same warning stands/.test(qs.why)&&qs.wssi==="MODERATE",`and stays up with the CON update and the index at Moderate: ${JSON.stringify(qs)}`);
    assert.deepEqual(qerr,[]);await m.context.close();checks++;
  }
  {
    /* WPC's index is the judge only of the list it was asked for (October 11 2026). The farm's warning ran
       tonight only and the index had Major on Day 3, so no card. The office then extends it into Day 3, and the
       newer cycle has Day 3 at Moderate, 1.5 seconds behind the refresh: the refresh's first paint paired the
       extended warning with the last refresh's Day-3 Major, raised the card and latched it, and the Moderate
       never took it down. Then the next morning's cold open: a new warning, WS.W.3, on what was yesterday's
       Day 2, which yesterday's index had at Major, and today's index at Moderate four seconds behind (slower
       than STORM_WAIT). Every frame is watched, and none has the card */
    const sif=STORMS["snow-ice-farm"],f0=sif.point[0];
    const feature=(vtec,ends,extra={})=>({...f0,properties:{...f0.properties,...extra,ends,expires:ends,parameters:{...f0.properties.parameters,VTEC:[vtec]}}});
    const A=feature("/O.NEW.KRLX.WS.W.0002.250105T1700Z-250106T0500Z/","2025-01-06T00:00:00-05:00",{id:"urn:int:A"});
    const A2=feature("/O.EXT.KRLX.WS.W.0002.250105T1700Z-250108T1100Z/","2025-01-08T06:00:00-05:00",{id:"urn:int:A2",messageType:"Update",sent:"2025-01-05T15:50:00-05:00"});
    const W3=feature("/O.NEW.KRLX.WS.W.0003.250106T1700Z-250107T1100Z/","2025-01-07T06:00:00-05:00",{id:"urn:int:W3",sent:"2025-01-06T06:00:00-05:00",onset:"2025-01-06T12:00:00-05:00"});
    const net={point:[A],level:["MODERATE","MODERATE","MAJOR"],cycle:"2025-01-05T06:00:00Z",delay:0};
    const wire=async page=>{
      await page.route(/alerts\/active\?point=/,r=>r.fulfill({json:{features:net.point}}));
      await page.route(/mapservices\.weather\.noaa\.gov/,async r=>{const l=net.level,c=net.cycle,d=net.delay;if(d)await new Promise(k=>setTimeout(k,d));r.fulfill({json:wssiAnswer(l,c)})});
      await page.addInitScript(STORM_FRAMES)};
    const cardless=async(page,tag)=>{const log=await page.evaluate(()=>window.__log);
      assert.ok(log.length&&log.every(x=>!x.card),`${tag}: no frame has the card: ${JSON.stringify(log.filter(x=>x.card).slice(0,2))}`);
      assert.equal(await page.evaluate(()=>JSON.stringify(STORM_HELD.sp||{})),"{}",`${tag}: nothing latched`)};
    const m=await phone(390,{...sif.o,storm:sif.name},sif.loc,{when:new Date("2025-01-05T10:00:00-05:00")});
    await wire(m.page);const p=m.page;
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(p);await p.waitForTimeout(400);await painted(p);
    await cardless(p,"tonight's warning beside a Day-3 Major");
    Object.assign(net,{point:[A2],level:["MODERATE","MODERATE","MODERATE"],cycle:"2025-01-05T18:00:00Z",delay:1500});
    await p.evaluate(()=>{window.__log=[];refresh()});await p.waitForTimeout(3300);await painted(p);
    await cardless(p,"an in-app refresh after the warning is extended into Day 3, the new cycle at Moderate 1.5 s behind");
    assert.deepEqual(await p.evaluate(()=>LAST.d.wssi.days.map(d=>d.impact)),["MODERATE","MODERATE","MODERATE"],"the new cycle landed");
    assert.deepEqual(m.errors,[]);await m.context.close();
    /* the next morning's cold open */
    Object.assign(net,{point:[A],level:["MODERATE","MAJOR",null],cycle:"2025-01-05T06:00:00Z",delay:0});
    const y=await phone(390,{...sif.o,storm:sif.name},sif.loc,{when:new Date("2025-01-05T10:00:00-05:00")});
    await wire(y.page);
    await y.page.goto(`http://localhost:${PORT}/`);
    await y.page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(y.page);await y.page.waitForTimeout(400);await painted(y.page);
    await cardless(y.page,"tonight's warning beside a Day-2 Major");
    Object.assign(net,{point:[W3],level:["MODERATE","MODERATE",null],cycle:"2025-01-06T06:00:00Z",delay:4000});
    const q=await y.context.newPage(),qerr=[];q.on("pageerror",e=>qerr.push(String(e)));
    await stage(q,{now:new Date("2025-01-06T07:00:00-05:00"),loc:sif.loc,o:{...sif.o,storm:sif.name},fontDir:FONT_DIR,port:PORT});
    await wire(q);
    await q.goto(`http://localhost:${PORT}/`);
    await q.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await q.waitForTimeout(5000);await painted(q);
    await cardless(q,"the next morning's cold open, yesterday's Day-2 Major beside a new WS.W.3 and today's Moderate 4 s behind");
    assert.equal(await q.evaluate(()=>LAST.d.wssi.days.map(d=>d.impact).join()),"MODERATE,MODERATE","today's index landed");
    assert.deepEqual([...y.errors,...qerr],[]);await y.context.close();checks++;
  }
  {
    /* A failed point request keeps the card, the strip and the storm's headline (October 11 2026). The paint is
       on the last good list this place had, carried (`seen.carried`), read against now like any list: one
       timed-out request under storm load took all three down, and the family reads a card gone as the storm
       over. At the farm (RLX's January 5 2025 warning at Major) and at the coast (Florence a day from landfall),
       each with an advisory that ends 14 seconds in, while the point is still failing: the strip's timer asks
       again a second after its end, the point fails again, and the advisory comes down with the card still up */
    for(const [name,width] of [["snow-ice-farm",320],["florence-coast",390]]){
      const sc=STORMS[name],at=new Date(sc.when),coastal=sc.loc==="mb";
      const brief=new Date(at.getTime()+14e3).toISOString();
      const extra={...sc.point[0],properties:{...sc.point[0].properties,id:"urn:int:brief",event:coastal?"Coastal Flood Advisory":"Wind Advisory",severity:"Minor",ends:brief,expires:brief,
        parameters:{...sc.point[0].properties.parameters,VTEC:[coastal?"/O.NEW.KILM.CF.Y.0031.000000T0000Z-180913T1600Z/":"/O.NEW.KRLX.WI.Y.0004.000000T0000Z-250105T1100Z/"]}}};
      let mode="ok";
      const m=await phone(width,{...sc.o,storm:sc.name},sc.loc,{when:at});
      await m.page.route(/alerts\/active\?point=/,r=>mode==="fail"?r.fulfill({status:503,json:{title:"Service Unavailable"}}):r.fulfill({json:{features:[...sc.point,extra]}}));
      await m.page.addInitScript(STORM_FRAMES);
      const p=m.page;
      await p.goto(`http://localhost:${PORT}/`);
      await p.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(p);await p.waitForTimeout(500);await painted(p);
      const look=()=>p.evaluate(()=>({card:!document.getElementById("stormSection").hidden,v:document.getElementById("verdict").textContent,
        strip:document.querySelector("#alertStrip.on .alert-head")?.textContent||"",carried:!!LAST?.d?.seen?.carried}));
      const before=await look(),more=x=>+((x.match(/\+(\d+)\u00A0more/)||[0,0])[1]);
      assert.ok(before.card&&more(before.strip)>=1,`${name}: the card, and the strip with the advisory: ${JSON.stringify(before)}`);
      mode="fail";
      await p.evaluate(()=>{window.__log=[];refresh()});await p.waitForTimeout(1500);await painted(p);
      const log=await p.evaluate(()=>window.__log),after=await look();
      assert.ok(log.every(x=>x.card&&x.v===before.v&&x.strip===before.strip),`${name}: through the failed request the card, the strip and the headline never change: ${JSON.stringify(log)}`);
      assert.ok(after.carried,`${name}: painted on the last good list, carried`);
      /* the advisory's end passes with the point still failing */
      await p.waitForFunction(b=>Date.now()>Date.parse(b)+1200,brief,{timeout:20000});await p.waitForTimeout(1500);await painted(p);
      const ended=await look();
      assert.ok(ended.card&&ended.carried&&ended.v===before.v&&more(ended.strip)===more(before.strip)-1&&ended.strip.split(" ·")[0]===before.strip.split(" ·")[0],
        `${name}: the advisory that ended during the outage comes down, and the card, the warning and the headline stay: ${JSON.stringify(ended)}`);
      assert.deepEqual(m.errors,[]);await m.context.close();checks++;
    }
  }
  {
    /* The storm's sentences on the page (October 11 2026). A warning issued ahead of its start: NOW on its chart
       reads the warning from noon, the pill and the spoken value, the way the headline does, and no longer "no
       hours from the Weather Service". Left open in front past noon, the strip's timer asks again a second after
       the warning's VTEC begin, and the headline turns to under way. And read after midnight on its last day the
       headline ends on one period: "until 6 a.m.." */
    const sif=STORMS["snow-ice-farm"];
    const m=await phone(390,{...sif.o,storm:sif.name},sif.loc,{when:new Date("2025-01-05T11:59:50-05:00")});
    const p=m.page;
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));await painted(p);
    const now0=await p.evaluate(()=>{const r=XP.storm.D.read(0);return{parts:r.parts.map(x=>x[0]),said:r.said,v:document.getElementById("verdict").textContent}});
    assert.deepEqual([now0.parts,now0.said,now0.v],[["now","Winter Storm Warning from 12p"],"Now, Winter Storm Warning from noon","Winter storm from noon until 6 a.m. Tuesday."],JSON.stringify(now0));
    const key=p.locator("#stormExplore .xp-key");await key.focus();await p.keyboard.press("End");await p.keyboard.press("Home");
    const st0=await xpState(p,"storm");
    assert.deepEqual([st0.text,st0.valuetext],["now Winter Storm Warning from 12p","Now, Winter Storm Warning from noon"],"the pill and the slider's spoken value at NOW");
    await p.keyboard.press("Escape");await key.blur();
    await p.waitForFunction(()=>Date.now()>Date.parse("2025-01-05T12:00:02-05:00"),null,{timeout:20000});
    await p.waitForFunction(()=>document.getElementById("verdict").textContent==="Winter storm until 6 a.m. Tuesday.",null,{timeout:8000});await painted(p);
    const now1=await p.evaluate(()=>XP.storm.D.read(0).parts.map(x=>x[0]));
    assert.deepEqual(now1,["now","Winter Storm Warning"],"at noon, with nothing touched, the headline and NOW turn to under way");
    assert.deepEqual(m.errors,[]);await m.context.close();
    const n=await phone(390,{...sif.o,storm:sif.name},sif.loc,{when:new Date("2025-01-07T00:30:00-05:00")});
    await load(n.page);
    assert.equal(await n.page.evaluate(()=>STORM_NOW?.tier),"storm");
    assert.equal(await n.page.locator("#verdict").textContent(),"Winter storm until 6 a.m.","after midnight on its last day, one period");
    assert.deepEqual(n.errors,[]);await n.context.close();checks++;
  }
  {
    /* The quoted title is fitted again when the fonts land (October 11 2026). On a real phone the fonts come
       with display=swap and the service worker does not keep them, so the card can paint in the fallback face
       and be fitted there; Bricolage then reflowed the sentence to a line more, and nothing fitted it again.
       Here Bricolage is held back until the card has painted, with swap: the title is fitted on the paint, and once more
       when the face lands, and then it obeys the rule (three lines at most, 18px at the least) and is what a
       fit from scratch gives */
    const sif=STORMS["snow-ice-farm"],at=new Date(sif.when);
    const m=await phone(390,{...sif.o,storm:sif.name},sif.loc,{when:at});
    let fontAt=0,release;const gate=new Promise(r=>release=r);
    await m.page.route(/fonts\.googleapis\.com/,r=>r.fulfill({contentType:"text/css",body:FONT_CSS(PORT).replace(/font-display:block/g,"font-display:swap")}));
    await m.page.route(/\/f\/bricolage\.woff2/,async r=>{await gate;fontAt=Date.now();r.fallback()});
    await m.page.addInitScript(()=>{window.__fits=[];addEventListener("DOMContentLoaded",()=>{const f=window.stormTitleFit;
      window.stormTitleFit=(...a)=>{window.__fits.push({at:performance.now(),face:document.fonts.check('650 26px "Bricolage Grotesque"')});return f(...a)}})});
    const p=m.page,title=()=>p.evaluate(()=>{const t=document.getElementById("stormTitle"),cs=getComputedStyle(t);
      return{text:t.textContent,px:parseFloat(cs.fontSize),lines:Math.round(t.getBoundingClientRect().height/parseFloat(cs.lineHeight)),full:!document.getElementById("stormFull").hidden}});
    /* not to "load", which waits for the held face */
    await p.goto(`http://localhost:${PORT}/`,{waitUntil:"domcontentloaded"});
    await p.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live")&&!document.getElementById("stormSection").hidden);await painted(p);
    assert.equal(await p.evaluate(()=>document.fonts.check('650 26px "Bricolage Grotesque"')),false,"the card painted before the display face landed");
    assert.ok(await p.evaluate(()=>window.__fits.length>0&&window.__fits.every(f=>!f.face)),"and its title was fitted in the fallback face");
    release();
    await p.waitForFunction(()=>document.fonts.check('650 26px "Bricolage Grotesque"'),null,{timeout:8000});
    await p.waitForTimeout(300);
    const fits=await p.evaluate(()=>window.__fits);
    assert.ok(fits.some(f=>f.face),`the title was fitted again once the face had landed: ${JSON.stringify(fits)}`);
    const after=await title();
    assert.ok(after.lines<=3&&after.px>=18,`and it keeps to three lines at 18px or more: ${JSON.stringify(after)}`);
    await p.evaluate(()=>stormTitleFit());
    assert.deepEqual(await title(),after,"and it is what a fit from scratch in that face gives");
    assert.ok(fontAt>0);
    assert.deepEqual(m.errors,[]);await m.context.close();checks++;
  }
  console.log(`${checks} interaction scenarios passed: matched chart heights, hourly and tide exploration, warnings, thunder coming at the farm, the farm's sections after the coast, the entrance across a cache-to-live paint and below the fold, offline recovery, a storm card on a cold open, with the beach fast and the advisories slow, through a renewed beach warning (and 7h20m on, with the cache aged out and the beach fast, slow, slower than STORM_WAIT and failing) and growing under a reader inside it, the farm's card held through a failed alerts fetch and a cold open the next morning, WPC's index raising only the warnings it was asked for (an extended warning on a refresh, a new one on a cold open), the card, the strip and the headline kept through a failed alerts request at both places with an advisory ending during it, NOW and the headline on a warning issued ahead of its start and turning at noon, one period after midnight, its quoted title fitted again when the fonts land, on a two-hour-old cache whose beach warning has passed its expiry, and a tornado under a hurricane, and every line read by a real finger, the keys and a screen reader.`);
}finally{
  await browser.close();server.close();
}
