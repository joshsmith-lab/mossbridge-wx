/**
 * The almanac's fish, in the chart and the pond, against fixed upstream data.
 * TZ=America/New_York PORCH_FONT_DIR=/path/to/fonts node tools/fishing.mjs
 * PORCH_CHROME_PATH and PORCH_PORT work as in the other visual harnesses.
 * Pictures and the machine-readable report go into ignored tools/shots/fishing/.
 * The real Date clock continues to run, including across a fishing-window edge.
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium } from "playwright";
import { ROOT, serve, stage, SEVERE } from "./fixtures.mjs";

const PORT=Number(process.env.PORCH_PORT||8811),FONT_DIR=process.env.PORCH_FONT_DIR||"";
const OUT=process.env.PORCH_FISH_OUT||path.join(ROOT,"tools","shots","fishing");
const ONLY=process.argv.slice(2),wanted=name=>!ONLY.length||ONLY.some(q=>name.includes(q));
mkdirSync(OUT,{recursive:true});
const hashes=Object.fromEntries(["index.html","sw.js","manifest.json","tools/fishing.mjs"].map(f=>
  [f,createHash("sha256").update(readFileSync(path.join(ROOT,f))).digest("hex")]));
const base={baseTemp:61,nowTemp:65,feels:65,rh:55,isDay:1,code:1,cloud:15,
  nowWind:4,nowDir:240,nowGust:7,nowUv:3,uvMax:4,windAmp:1,gustAmp:2,
  sunrise:"07:25",sunset:"18:55",popCurve:()=>5,dailyPop:p=>p.fill(10)};
const day="2026-10-07T10:20:00-04:00",night="2026-10-07T23:10:00-04:00";
const nightO={...base,baseTemp:53,nowTemp:57,feels:57,isDay:0,code:0,cloud:8,nowUv:0};
const CASES=[
  {name:"farm-day-active",loc:"sp",when:day,o:base,pond:1,chart:true,picture:true},
  {name:"farm-night-active",loc:"sp",when:night,o:nightO,pond:1,chart:true,picture:true},
  {name:"farm-between-windows",loc:"sp",when:"2026-10-07T14:00:00-04:00",o:base,pond:0,chart:true},
  {name:"farm-storm",loc:"sp",when:day,o:{...base,code:95,cloud:96,popCurve:()=>85},pond:0,chart:false},
  {name:"farm-warning",loc:"sp",when:day,o:base,warning:true,pond:0,chart:false},
  {name:"farm-cold",loc:"sp",when:day,o:{...base,baseTemp:44,nowTemp:44,feels:44},pond:0,chart:true},
  {name:"farm-45-degrees",loc:"sp",when:day,o:{...base,baseTemp:45,nowTemp:45,feels:45},pond:1,chart:true},
  {name:"farm-rain",loc:"sp",when:day,o:{...base,code:61,cloud:95,popCurve:()=>80},pond:0,chart:true},
  {name:"farm-ice",loc:"sp",when:night,o:{...nightO,code:66,cloud:95,popCurve:()=>80},pond:0,chart:false},
  {name:"coast-day",loc:"mb",when:day,o:base,pond:0,chart:false,picture:true},
  {name:"coast-night",loc:"mb",when:night,o:nightO,pond:0,chart:false,picture:true},
  {name:"farm-night-downpour",loc:"sp",when:"2026-05-12T22:40:00-04:00",pond:0,
    o:{baseTemp:62,nowTemp:61,feels:61,rh:96,isDay:0,code:82,cloud:97,nowWind:15,nowDir:210,
      nowGust:26,nowUv:0,uvMax:5,windAmp:12,gustAmp:22,sunrise:"06:14",sunset:"20:26",
      popCurve:()=>92,dailyPop:p=>p.fill(90)}},
];
/* Same busy rain picture with known lighter gusts throughout the hourly run:
   all otherwise safe almanac windows remain, exercising the largest fish count. */
CASES.push({...CASES.at(-1),name:"farm-night-downpour-clear-windows",chart:true,
  o:{...CASES.at(-1).o,nowGust:20,gustAmp:0}});
CASES.push({...CASES.at(-1),name:"farm-october-downpour-clear-windows",when:"2026-10-07T21:00:00-04:00",
  o:{...CASES.at(-1).o,sunrise:"07:25",sunset:"18:55"}});
CASES.push({...CASES.at(-1),name:"farm-october-downpour-clear-windows-wide",width:760,budget:true});
CASES.push({...CASES.at(-1),name:"farm-october-downpour-clear-windows-tall",width:900,height:1500,noScroll:true});
const results=[],failures=[];
const server=await serve(PORT,FONT_DIR);
const browser=await chromium.launch(process.env.PORCH_CHROME_PATH?{executablePath:process.env.PORCH_CHROME_PATH}:{});
const pond=".fish-bite[data-fish-place=pond]",chart="#moonSvg .fish-bite";
async function open(c,width=c.width||Number(process.env.PORCH_FISH_WIDTH||393)){
  const context=await browser.newContext({viewport:{width,height:c.height||852},deviceScaleFactor:2,
    timezoneId:"America/New_York",serviceWorkers:"block"});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  const now=new Date(c.when);
  await stage(page,{now,loc:c.loc,o:c.o,fontDir:FONT_DIR,port:PORT});
  if(c.warning)await page.route("**api.weather.gov/alerts**",r=>r.fulfill({json:{features:SEVERE(now)}}));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(()=>document.getElementById("stamp").textContent.includes("live"));
  await page.evaluate(()=>document.fonts.ready);
  // Match scene.mjs: app/scene entrance effects are not ambient animation load.
  await page.waitForTimeout(1500);
  return {context,page,errors};
}
async function check(name,fn){
  const boundarySetup=name==="find-real-window"&&(wanted("open-page-window-start")||wanted("open-page-window-end"));
  if(!wanted(name)&&!boundarySetup)return;
  try{const detail=await fn();results.push({name,ok:true,...detail});console.log("PASS",name,JSON.stringify(detail||{}));}
  catch(e){failures.push({name,message:e.stack||String(e)});console.error("FAIL",name,e.message);}
}
const count=async page=>page.evaluate(()=>{
  const running=document.getAnimations().filter(a=>a.playState==="running");
  return {total:running.length,names:running.reduce((o,a)=>(o[a.animationName||a.id]=(o[a.animationName||a.id]||0)+1,o),{})};
});
async function pose(page,fraction=.08){
  await page.evaluate(f=>{
    // Only the pose walker aligns the fish. Budget checks use their real
    // staggered clock, and the boundary checks never call this helper.
    document.getAnimations().forEach(a=>a.pause());
    for(const a of document.getAnimations())if(String(a.animationName).startsWith("porchFish")){
      const t=a.effect.getTiming();a.currentTime=t.delay+t.duration*(1+f);
    }
  },fraction);
  await page.waitForTimeout(40);
}
async function burstBudget(page){
  return page.evaluate(()=>{
    const original=Date.now,base=Math.floor(original()/18000)*18000,samples=[];
    // Include the short overlap at 3.75s, not just convenient whole seconds.
    try{for(const s of [0,.74,1.44,3.75,3.9,6.75,8.8,11.75,13.8,16.75,17.9]){
      Date.now=()=>base+s*1000;fishMotion();
      const a=document.getAnimations().filter(a=>a.playState==="running");
      samples.push({phase:s,total:a.length,fish:a.filter(a=>String(a.animationName).startsWith("porchFish")).length});
    }}finally{Date.now=original;fishMotion();}
    return samples;
  });
}
async function inView(page,selector){
  await page.evaluate(selector=>{const e=document.querySelector(selector),b=e.getBoundingClientRect();
    scrollTo(0,scrollY+b.top-(innerHeight-b.height)/2);
  },selector);
  await page.waitForTimeout(100);
}
async function collisions(page){
  return page.evaluate(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}};
    const hit=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
    const svg=document.getElementById("moonSvg"),bounds=box(svg),labels=[...svg.querySelectorAll("text")].map(e=>({text:e.textContent,box:box(e)}));
    const disc=svg.querySelector('circle[r="8.4"]'),moon=disc&&box(disc),issues=[];
    const fish=[...svg.querySelectorAll(".bite-body")].filter(e=>+getComputedStyle(e).opacity>.1);
    fish.forEach((e,i)=>{const b=box(e);
      for(const l of labels)if(hit(b,l.box))issues.push({fish:i,label:l.text});
      if(moon&&hit(b,moon))issues.push({fish:i,moon:true,fishBox:b,moonBox:moon});
      if(b.x<bounds.x||b.right>bounds.right||b.y<bounds.y||b.bottom>bounds.bottom)issues.push({fish:i,outside:true});
    });
    return {fish:fish.length,issues,overflow:document.documentElement.scrollWidth>innerWidth};
  });
}
async function capture(page,name){
  await page.evaluate(()=>scrollTo(0,0));
  await page.waitForTimeout(100);await pose(page);
  await page.screenshot({path:path.join(OUT,`${name}-phone.png`)});
  await page.screenshot({path:path.join(OUT,`${name}.png`),fullPage:true});
  await page.locator("#sceneSvg").screenshot({path:path.join(OUT,`${name}-scene.png`)});
  if(await page.locator(chart).count()){
    await inView(page,"#moonSvg");await pose(page);
    await page.locator("#moonSection").screenshot({path:path.join(OUT,`${name}-moon.png`)});
    for(const [label,fraction]of[["rise",.055],["crest",.08],["splash",.14],["quiet",.3]]){
      await inView(page,"#sceneSvg");
      await pose(page,fraction);
      await page.locator("#sceneSvg").screenshot({path:path.join(OUT,`${name}-${label}.png`)});
    }
  }
}
try{
  for(const c of CASES)await check(c.name,async()=>{
    const {context,page,errors}=await open(c);
    try{
      await page.evaluate(()=>finishReveal());
      const found={pond:await page.locator(pond).count(),chart:await page.locator(chart).count()};
      assert.equal(found.pond,c.pond,"pond fish matches the current window and weather");
      if(c.chart!==undefined)assert.equal(found.chart>0,c.chart,"chart fish matches the safe almanac windows");
      const animations=await count(page);
      assert.ok(animations.total<=120,`animation ceiling: ${animations.total} > 120`);
      let chartAnimations=null;
      let burstSamples=null;
      let layouts=null;
      if(found.chart){
        if(!c.noScroll)await inView(page,"#moonSvg");
        else assert.ok(await page.evaluate(()=>document.getElementById("sceneSvg").getBoundingClientRect().bottom>0
          &&document.getElementById("moonSvg").getBoundingClientRect().top<innerHeight),"tall viewport shows the header and moon together");
        chartAnimations=await count(page);
        assert.ok(chartAnimations.total<=120,`animation ceiling while reading the moon: ${chartAnimations.total} > 120`);
        if(c.budget){
          // Measure the natural page first, before the separate controlled sweep.
          const cdp=await context.newCDPSession(page);await cdp.send("Performance.enable");
          const metric=async()=>Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m=>[m.name,m.value]));
          const before=await metric();await page.waitForTimeout(6100);const after=await metric();
          layouts=after.LayoutCount-before.LayoutCount;
          assert.ok(layouts<=2,`chart fish should idle without layout work: ${layouts} layouts in 6 seconds`);
          await cdp.detach();
          burstSamples=await burstBudget(page);
          assert.ok(burstSamples.some(s=>s.fish>0),"budget sweep includes actual fish bursts");
          assert.ok(burstSamples.every(s=>s.total<=120),"the whole staggered cycle respects the animation ceiling: "+JSON.stringify(burstSamples));
        }
        await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);
      }
      if(c.picture)await capture(page,c.name);
      assert.deepEqual(errors,[]);
      return {...found,animations,chartAnimations,burstSamples,layouts};
    }finally{await context.close();}
  });

  for(const width of [320,393,760])for(const c of CASES.slice(0,3))await check(`${c.name}-layout-${width}`,async()=>{
    const {context,page,errors}=await open(c,width);
    try{
      await page.evaluate(()=>finishReveal());
      await inView(page,"#moonSvg");
      const poses=[];
      for(const f of [.055,.08,.10]){
        await pose(page,f);const state=await collisions(page);poses.push(state);
        assert.ok(state.fish>0,"the step actually shows the fish");
        assert.deepEqual(state.issues,[],"fish stay off labels, the live moon and the frame");
        assert.equal(state.overflow,false,"the page has no horizontal overflow");
      }
      await pose(page);
      await page.locator("#moonSection").screenshot({path:path.join(OUT,`${c.name}-${width}-moon.png`)});
      assert.deepEqual(errors,[]);return {poses};
    }finally{await context.close();}
  });

  await check("moon-entrance-and-explorer",async()=>{
    const {context,page,errors}=await open(CASES[0]);
    try{
      await pose(page);
      const hidden=await page.evaluate(()=>[...document.querySelectorAll("#moonSvg .bite-body")].every(e=>{
        let opacity=1;for(let p=e;p&&p instanceof Element;p=p.parentElement){const s=getComputedStyle(p);opacity*=+s.opacity;if(s.display==="none"||s.visibility==="hidden")return true;}
        return opacity<.01;
      }));
      assert.equal(hidden,true,"a waiting moon chart cannot show fish ahead of its line");
      await page.locator("#moonSvg").scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>REVEAL.moon.state==="running");
      await page.locator("#moonExplore .xp-key").focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.evaluate(()=>REVEAL.moon.state),"done","reading the chart finishes its entrance");
      assert.equal(await page.evaluate(()=>XP.moon.peek.hidden),false,"the moon explorer reads through the fish");
      await page.evaluate(()=>finishReveal());
      const before=(await count(page)).total;
      await page.keyboard.press("ArrowRight");
      assert.equal((await count(page)).total,before,"stepping the explorer adds no motion");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      await pose(page);
      assert.ok((await collisions(page)).fish>0,"fish remain after the entrance and exploration");
      assert.deepEqual(errors,[]);return {animations:before};
    }finally{await context.close();}
  });

  for(const loc of ["sp","mb"])await check(`header-parks-and-resumes-${loc}`,async()=>{
    const c={...CASES[0],loc},name=loc==="sp"?"deerGraze":"heronScan";
    const {context,page,errors}=await open(c);
    try{
      await page.evaluate(()=>finishReveal());
      const start=await page.evaluate(name=>{
        const a=document.getAnimations().find(a=>a.animationName===name);
        if(!a)return null;
        window.__fishHeaderAnimation=a;
        const t=a.effect.getTiming();return {state:a.playState,at:performance.now(),active:a.currentTime-t.delay,duration:t.duration};
      },name);
      assert.equal(start?.state,"running",`${name} runs while its scene is visible`);
      await inView(page,"#yearSvg");
      const held=await page.evaluate(()=>({state:__fishHeaderAnimation.playState,time:__fishHeaderAnimation.currentTime}));
      assert.equal(held.state,"paused","the wholly offscreen header parks its motion");
      await page.waitForTimeout(650);
      assert.ok(Math.abs(await page.evaluate(()=>__fishHeaderAnimation.currentTime)-held.time)<1,"the parked gesture stays still");
      await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(120);
      const back=await page.evaluate(name=>{
        const a=document.getAnimations().find(a=>a.animationName===name),t=a?.effect.getTiming();
        return a?{state:a.playState,at:performance.now(),active:a.currentTime-t.delay}:null;
      },name);
      assert.equal(back?.state,"running","the visible header resumes");
      const error=((back.active-start.active-(back.at-start.at))%start.duration+start.duration)%start.duration;
      const phaseError=Math.min(error,start.duration-error);
      assert.ok(phaseError<100,`the gesture resumes at elapsed phase, not its old or starting pose: ${phaseError}ms`);
      assert.deepEqual(errors,[]);return {name,phaseErrorMs:phaseError};
    }finally{await context.close();}
  });

  /* Discover a real upcoming window, then open the actual page just before each
     boundary. No render(), refresh(), visibility event or frozen browser clock
     is used to move it across: the production boundary timer has to do the work. */
  let window;
  await check("find-real-window",async()=>{
    const {context,page,errors}=await open(CASES[0]);
    try{
      window=await page.evaluate(()=>{
        const now=wallNow(),w=fishWindows(LAST.d.hourly,now).find(w=>w.start>now);
        return w?{start:w.start.getTime(),end:w.end.getTime()}:null;
      });
      assert.ok(window&&window.end>window.start,"fixture has a real upcoming almanac window");
      assert.deepEqual(errors,[]);return window;
    }finally{await context.close();}
  });
  if(window)for(const edge of ["start","end"])await check(`open-page-window-${edge}`,async()=>{
    const at=window[edge],c={...CASES[0],when:new Date(at-6000).toISOString()};
    const {context,page,errors}=await open(c);
    try{
      assert.equal(await page.locator(pond).count(),edge==="start"?0:1,`pond state before ${edge}`);
      await page.waitForFunction(({selector,want})=>document.querySelectorAll(selector).length===want,
        {selector:pond,want:edge==="start"?1:0},{timeout:13000});
      const crossed=await page.evaluate(()=>wallNow().getTime());
      assert.ok(crossed>=at,`the ${edge} change must not happen early`);
      assert.ok(crossed-at<7000,`the ${edge} change should follow its boundary promptly`);
      assert.deepEqual(errors,[]);return {edge:new Date(at).toISOString(),afterMs:crossed-at};
    }finally{await context.close();}
  });
}finally{
  await browser.close();await new Promise(r=>server.close(r));
  const hashesAtEnd=Object.fromEntries(Object.keys(hashes).map(f=>
    [f,createHash("sha256").update(readFileSync(path.join(ROOT,f))).digest("hex")]));
  const changed=Object.keys(hashes).filter(f=>hashes[f]!==hashesAtEnd[f]);
  if(changed.length)failures.push({name:"source-unchanged",message:"Changed during this run: "+changed.join(", ")});
  writeFileSync(path.join(OUT,"results.json"),JSON.stringify({hashes,hashesAtEnd,results,failures},null,2)+"\n");
}
console.log(`${results.length} passed; ${failures.length} failed. Pictures: ${OUT}`);
if(failures.length)process.exitCode=1;
