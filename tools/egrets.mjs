/** Oak egret phone mockups and perch checks. TZ=America/New_York node tools/egrets.mjs */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
import {ROOT,serve,stage} from './fixtures.mjs';
const PORT=Number(process.env.PORCH_PORT||8990),FONT_DIR=process.env.PORCH_FONT_DIR||'';
const OUT=process.env.PORCH_EGRET_OUT||path.join(ROOT,'tools/shots/egrets');
mkdirSync(OUT,{recursive:true});
const hash=()=>createHash('sha256').update(readFileSync(path.join(ROOT,'index.html'))).digest('hex');
const before=hash(),results=[],failures=[];
const o={baseTemp:70,nowTemp:74,feels:74,rh:55,isDay:1,code:1,cloud:18,nowWind:5,nowGust:8,nowDir:240,
  nowUv:4,uvMax:5,windAmp:2,gustAmp:2,popCurve:()=>0,dailyPop:p=>p.fill(0),sunrise:'07:12',sunset:'18:43'};
const cases=[
  {name:'coast-day',when:'2026-10-09T14:20:00',count:2},
  {name:'coast-golden',when:'2026-10-09T18:15:00',count:2},
  {name:'coast-night',when:'2026-10-09T22:00:00',count:2,o:{isDay:0,nowTemp:62,nowUv:0}},
  {name:'coast-one-bird',when:'2026-10-08T14:20:00',count:1},
  {name:'coast-empty-day',when:'2026-10-07T14:20:00',count:0},
  {name:'coast-windy',when:'2026-10-09T14:20:00',count:0,o:{nowWind:13,nowGust:25}},
  {name:'coast-rain',when:'2026-10-09T14:20:00',count:0,o:{code:63,cloud:95,popCurve:()=>80}},
  {name:'coast-storm',when:'2026-10-09T14:20:00',count:0,o:{code:95,cloud:95,popCurve:()=>80}},
  {name:'farm-day',loc:'sp',when:'2026-10-09T14:20:00',count:0},
  {name:'farm-night',loc:'sp',when:'2026-10-09T22:00:00',count:0,o:{isDay:0,nowTemp:62,nowUv:0}},
];
const server=await serve(PORT,FONT_DIR),browser=await chromium.launch({executablePath:process.env.PORCH_CHROME_PATH});
try{
 for(const c of cases)for(const width of c.name==='coast-day'?[320,393,760]:[393]){
  const context=await browser.newContext({viewport:{width,height:852},deviceScaleFactor:2,timezoneId:'America/New_York',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  try{
   await stage(page,{now:new Date(c.when),loc:c.loc||'mb',o:{...o,...c.o},fontDir:FONT_DIR,port:PORT});
   await page.goto('http://localhost:'+PORT+'/');
   await page.waitForFunction(()=>typeof LAST!=='undefined'&&LAST?.live);await page.evaluate(()=>document.fonts.ready);
   await page.waitForTimeout(2600);await page.evaluate(()=>finishReveal());
   const count=await page.locator('.oak-egret').count();assert.equal(count,c.count,c.name+' count');
   const perch=await page.evaluate(()=>{
    const oak=document.querySelector('[data-prop="live-oak"]');if(!oak)return [];
    const birds=[...oak.querySelectorAll('.oak-egret')],box=pathBox(propOak().map(p=>p.d));
    const wood=propOak().filter(p=>p.role==='wood').map(p=>new Path2D(p.d));
    const ctx=document.createElement('canvas').getContext('2d');ctx.lineWidth=1.05/1.12;
    return birds.map(b=>{
     const [x,y]=b.dataset.perch.split(',').map(Number),p=new DOMPoint(0,0).matrixTransform(b.getScreenCTM());
     const anchor=new DOMPoint(x,y).matrixTransform(b.parentNode.getScreenCTM());
     const bb=b.getBoundingClientRect(),local=b.getBBox(),m=b.transform.baseVal.consolidate().matrix;
     const a=new DOMPoint(local.x,local.y).matrixTransform(m),z=new DOMPoint(local.x+local.width,local.y+local.height).matrixTransform(m);
     const toes=[-1,1].map(tx=>new DOMPoint(tx,.3).matrixTransform(m));
     return {anchorError:Math.hypot(p.x-anchor.x,p.y-anchor.y),width:bb.width,height:bb.height,
       animations:b.getAnimations({subtree:true}).length,contained:b.closest('[data-prop="live-oak"]')===oak,
       contact:toes.every(t=>wood.some(w=>ctx.isPointInPath(w,t.x,t.y)||ctx.isPointInStroke(w,t.x,t.y))),
       inside:Math.min(a.x,z.x)>=box[0]&&Math.max(a.x,z.x)<=box[0]+box[2]&&Math.min(a.y,z.y)>=box[1]&&Math.max(a.y,z.y)<=box[1]+box[3]};
    });
   });
   for(const p of perch){assert.ok(p.anchorError<.1);assert.equal(p.animations,0);assert.ok(p.contained&&p.inside);assert.ok(p.contact,'toes touch the drawn wood');assert.ok(p.height>=7&&p.height<=22);}
   if(count){
    // The foot transform and branch anchor remain identical at both ends of the tree's sway.
    for(const t of [0,5000,10000]){
     const errors=await page.evaluate(t=>{const oak=document.querySelector('[data-prop="live-oak"]');for(const a of oak.getAnimations()) {a.pause();a.currentTime=t;}
      return [...oak.querySelectorAll('.oak-egret')].map(b=>{const [x,y]=b.dataset.perch.split(',').map(Number),p=new DOMPoint(0,0).matrixTransform(b.getScreenCTM()),q=new DOMPoint(x,y).matrixTransform(b.parentNode.getScreenCTM());return Math.hypot(p.x-q.x,p.y-q.y)});},t);
     assert.ok(errors.every(x=>x<.1),'feet stay with their branch through sway');
    }
    await page.evaluate(()=>{for(const a of document.querySelector('[data-prop="live-oak"]').getAnimations())a.play()});
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);
   if(width===393&&['coast-day','coast-golden','coast-night','farm-day','farm-night'].includes(c.name)){
    await page.evaluate(()=>document.getAnimations().forEach(a=>a.pause()));
    await page.screenshot({path:path.join(OUT,c.name+'-phone.png')});
    await page.locator('#sceneSvg').screenshot({path:path.join(OUT,c.name+'-scene.png')});
    if(c.name.startsWith('coast'))await page.locator('[data-prop="live-oak"]').screenshot({path:path.join(OUT,c.name+'-oak.png')});
   }
   results.push({name:c.name,width,count,perch});console.log('PASS',c.name,width,JSON.stringify(perch));
  }catch(e){failures.push({name:c.name,width,error:String(e.stack||e)});console.error('FAIL',c.name,width,e.message)}finally{await context.close()}
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
const after=hash();if(before!==after)failures.push({name:'source-changed'});
writeFileSync(path.join(OUT,'results.json'),JSON.stringify({before,after,results,failures},null,2));
console.log(results.length+' passed; '+failures.length+' failed.');if(failures.length)process.exitCode=1;
