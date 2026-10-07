/**
 * Reproduce Tonight through the real refresh/cache/render path.
 * TZ=America/New_York PORCH_FONT_DIR=... PORCH_CHROME_PATH=... node tools/tonight.mjs
 * Optional PORCH_TONIGHT_RAW_DIR contains private mb/sp-raw-forecast.json captures.
 * PORCH_BASELINE_REF tests an older shell without changing the checkout; it must fail
 * the morning regression. Generated pictures and reports stay in ignored tools/shots.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import path from "node:path";
import {chromium} from "playwright";
import {ROOT,serve,stage,forecast} from "./fixtures.mjs";
const PORT=Number(process.env.PORCH_PORT||8990),FONT_DIR=process.env.PORCH_FONT_DIR||"";
const OUT=process.env.PORCH_TONIGHT_OUT||path.join(ROOT,"tools/shots/tonight");
const REF=process.env.PORCH_BASELINE_REF,ONLY=process.argv.slice(2);
mkdirSync(OUT,{recursive:true});
const files=["index.html","sw.js","manifest.json","tools/tonight.mjs"];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash("sha256").update(readFileSync(path.join(ROOT,f))).digest("hex")]));
const before=hashes(),results=[],failures=[];
const old=REF?execFileSync("git",["show",REF+":index.html"],{cwd:ROOT,encoding:"utf8"}):null;
const base={baseTemp:62,nowTemp:66,feels:66,rh:50,isDay:1,code:1,cloud:15,nowWind:4,nowDir:240,
  nowGust:8,nowUv:1,uvMax:4,windAmp:1,gustAmp:1,popCurve:()=>0,dailyPop:p=>p.fill(0),sunset:"18:46"};
const cases=[];
for(const loc of ["mb","sp"]){
  for(const period of ["morning","night"]){
    const when="2026-10-07T"+(period==="morning"?"07:40":"22:40")+":00-04:00";
    const now=new Date(when),o={...base,sunrise:loc==="mb"?"07:10":"07:25",isDay:period==="morning"?1:0,nowUv:period==="morning"?1:0};
    const raw=forecast(now,o,"America/New_York",loc);
    raw.hourly.temperature_2m.fill(60);raw.hourly.precipitation_probability.fill(0);raw.hourly.weather_code.fill(1);
    const last=raw.hourly.time.indexOf("2026-10-08T07:00");
    raw.hourly.temperature_2m[last]=48;
    raw.hourly.temperature_2m[last+1]=5;raw.hourly.weather_code[last+1]=95;raw.hourly.precipitation_probability[last+1]=99;
    raw.daily.temperature_2m_min.fill(20);raw.daily.precipitation_probability_max.fill(100);
    cases.push({name:loc+"-"+period,loc,when,o,raw,want:"Down to 48° tonight.",picture:true,cache:period==="morning"});
  }
  const primary=cases.find(c=>c.name===loc+"-morning");
  for(const kind of ["last-hour-thunder","missing-temp","missing-pop","missing-hour"]){
    const raw=structuredClone(primary.raw),i=raw.hourly.time.indexOf("2026-10-08T07:00");
    let want;
    if(kind==="last-hour-thunder"){raw.hourly.weather_code[i]=95;raw.hourly.precipitation_probability[i]=80;want="Thunder likely tonight, with a low of 48°."}
    if(kind==="missing-temp"){raw.hourly.temperature_2m[i]=null;want="Low unavailable tonight."}
    if(kind==="missing-pop"){raw.hourly.precipitation_probability[i]=null;want="Down to 48° tonight. Rain odds unavailable."}
    if(kind==="missing-hour"){for(const a of Object.values(raw.hourly))a.splice(i,1);want="Low unavailable tonight. Rain odds unavailable."}
    cases.push({...primary,name:loc+"-"+kind,raw,want,picture:false,cache:false});
  }
  const dir=process.env.PORCH_TONIGHT_RAW_DIR,file=dir&&path.join(dir,loc+"-raw-forecast.json");
  if(file&&existsSync(file))cases.push({...primary,name:loc+"-captured-morning",when:"2026-10-07T07:50:00-04:00",
    raw:JSON.parse(readFileSync(file,"utf8")),want:loc==="mb"?"Down to 54° tonight.":"Down to 52° tonight.",picture:true,cache:true});
}
const server=await serve(PORT,FONT_DIR);
const browser=await chromium.launch({executablePath:process.env.PORCH_CHROME_PATH});
try{
  for(const c of cases.filter(c=>!ONLY.length||ONLY.some(s=>c.name.includes(s)))){
    const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,
      timezoneId:"America/New_York",serviceWorkers:"block"});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    try{
      await stage(page,{now:new Date(c.when),loc:c.loc,o:c.o,fontDir:FONT_DIR,port:PORT});
      await page.route("**api.open-meteo.com**",r=>r.fulfill({json:c.raw}));
      if(old)await page.route("http://localhost:"+PORT+"/",r=>r.fulfill({contentType:"text/html",body:old}));
      await page.goto("http://localhost:"+PORT+"/");
      await page.waitForFunction(()=>typeof LAST!=="undefined"&&LAST&&document.getElementById("refreshBtn").getAttribute("aria-busy")==="false");
      await page.evaluate(()=>document.fonts.ready);
      const state=await page.evaluate(()=>({
        text:document.getElementById("eveLead").textContent,headline:document.getElementById("verdict").textContent,
        hours:LAST.d.hourly.time.length,first:LAST.d.hourly.time[0],last:LAST.d.hourly.time.at(-1),
        chartHours:+document.querySelector('input[aria-label="Next 24 hours, hour by hour"]').getAttribute("max")+1,
        cacheHours:JSON.parse(localStorage.getItem("mbwx-"+LOC.id)).data.hourly.time.length,
        overflow:document.documentElement.scrollWidth>innerWidth
      }));
      assert.equal(state.text,c.want,"Tonight after the real refresh");
      if(c.name==="mb-captured-morning")assert.equal(state.headline,"Cloudy, then sunny.","the actual morning sky changes earn a useful short headline");
      assert.equal(state.chartHours,24,"Next 24 hours still has exactly 24 readings");
      assert.ok(state.hours>24,"the provider's longer run survives refresh");
      assert.equal(state.cacheHours,state.hours,"the same full run survives the existing cache");
      assert.equal(state.overflow,false);
      if(c.picture){
        await page.evaluate(()=>finishReveal());
        await page.screenshot({path:path.join(OUT,c.name+"-header.png")});
        await page.locator("#eveCard").scrollIntoViewIfNeeded();await page.waitForTimeout(200);
        await page.screenshot({path:path.join(OUT,c.name+"-phone.png")});
        await page.locator("#eveCard").screenshot({path:path.join(OUT,c.name+"-tonight.png")});
      }
      if(c.cache){
        // Reopen the stored morning reading two hours later with upstream unavailable.
        await page.route("**api.open-meteo.com**",r=>r.abort());
        const cached=await page.evaluate(async()=>{
          const RD=Date,off=2*36e5;
          const F=function(...a){return a.length?new RD(...a):new RD(RD.now()+off)};
          F.now=()=>RD.now()+off;F.parse=RD.parse;F.UTC=RD.UTC;F.prototype=RD.prototype;window.Date=F;
          syncClock();const old=readCache(LOC.id),savedAt=old.savedAt;
          render(old.data,false,old.savedAt);await refresh();
          return{text:document.getElementById("eveLead").textContent,hours:LAST.d.hourly.time.length,
            unchangedAge:LAST.savedAt===savedAt,cached:!LAST.live};
        });
        assert.equal(cached.text,c.want,"a saved morning forecast reopened later retains Tonight");
        assert.equal(cached.hours,state.hours);assert.ok(cached.cached&&cached.unchangedAge);
        state.cacheReopen=cached;
      }
      assert.deepEqual(errors,[]);
      results.push({name:c.name,...state});console.log("PASS",c.name,JSON.stringify(state));
    }catch(e){failures.push({name:c.name,message:String(e.stack||e)});console.error("FAIL",c.name,e.message)}
    finally{await context.close()}
  }
}finally{
  await browser.close();await new Promise(r=>server.close(r));
  const after=hashes();if(JSON.stringify(before)!==JSON.stringify(after))failures.push({name:"source-unchanged",message:"Source changed during run"});
  writeFileSync(path.join(OUT,"results.json"),JSON.stringify({baseline:REF||null,before,after,results,failures},null,2));
}
console.log(results.length+" passed; "+failures.length+" failed.");
if(failures.length)process.exitCode=1;
