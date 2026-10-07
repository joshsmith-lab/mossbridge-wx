import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const OUT=path.resolve(process.argv[2]||'/private/tmp/porch-fish-preview'),URL=process.env.PORCH_FISH_URL||'http://127.0.0.1:8951';
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PORCH_CHROME_PATH});
const results=[];
try{
 for(const name of ['day','night','quiet','storm','coast','coast-night']){
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'America/New_York',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${URL}/${name}.html?focus=chart`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof LAST!=='undefined'&&LAST?.d,{timeout:10000});
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
  await page.evaluate(()=>{finishReveal();document.getAnimations().forEach(a=>{a.pause();if(String(a.animationName).startsWith('porchFish')){const t=a.effect.getTiming();a.currentTime=t.delay+t.duration+1440}});});
  const state=await page.evaluate(()=>({place:LOC.id,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    chartFish:document.querySelectorAll('#moonSvg .fish-bite').length,pondFish:document.querySelectorAll('#sceneSvg .fish-bite').length,
    moonLabel:document.getElementById('moonSvg').getAttribute('aria-label'),time:wallNow().toString(),
    activeWindows:LOC.fish?fishWindows(LAST.d.hourly,wallNow()).filter(w=>wallNow()>=w.start&&wallNow()<w.end).length:0,
    visibleFish:[...document.querySelectorAll('.bite-body')].filter(e=>+getComputedStyle(e).opacity>.9).length}));
  if(state.scrollWidth>state.width)errors.push('horizontal overflow');
  if(['day','night'].includes(name)&&state.pondFish!==1)errors.push('current fishing window needs one pond fish');
  if(['quiet','storm','coast','coast-night'].includes(name)&&state.pondFish!==0)errors.push('pond fish should be absent');
  if(name==='storm'&&state.chartFish!==0)errors.push('storm fishing markers should be absent');
  if(['day','night','quiet'].includes(name)&&!state.chartFish)errors.push('allowed chart windows need fish');
  if(state.visibleFish!==state.chartFish+state.pondFish)errors.push('fish should be visible at the top of their leap');
  await page.screenshot({path:path.join(OUT,`${name}-chart-phone.png`)});
  if(!name.startsWith('coast')){
    await page.locator('#moonSection').screenshot({path:path.join(OUT,`${name}-chart.png`)});
    await page.evaluate(()=>{const e=document.querySelector('#sceneSvg');scrollTo(0,Math.max(0,e.getBoundingClientRect().top+scrollY-245))});
    await page.waitForTimeout(200);
    await page.screenshot({path:path.join(OUT,`${name}-pond-phone.png`)});
    await page.locator('#sceneSvg').screenshot({path:path.join(OUT,`${name}-pond.png`)});
  }
  results.push({name,...state,errors});console.log(JSON.stringify(results.at(-1)));await context.close();
 }
 writeFileSync(path.join(OUT,'checks.json'),JSON.stringify(results,null,2));
}finally{await browser.close()}
if(results.some(r=>r.errors.length))process.exitCode=1;
