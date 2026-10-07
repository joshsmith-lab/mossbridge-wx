/* Build a local, animated design study. No production files are written. */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {forecast,marine,tides,SEVERE} from '../fixtures.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const OUT=path.resolve(process.argv[2]||'/private/tmp/porch-fish-preview');
mkdirSync(OUT,{recursive:true});mkdirSync(path.join(OUT,'f'),{recursive:true});
const font=process.env.PORCH_FONT_DIR;
if(!font)throw Error('PORCH_FONT_DIR is required for the real app fonts.');
for(const name of ['bricolage','spline'])copyFileSync(path.join(font,name+'.woff2'),path.join(OUT,'f',name+'.woff2'));
const original=readFileSync(path.join(ROOT,'index.html'),'utf8');
const art=readFileSync(path.join(HERE,'art.mjs'),'utf8').replaceAll('export ','');
const proposal=readFileSync(path.join(HERE,'prototype.js'),'utf8');
const motion=readFileSync(path.join(HERE,'motion.css'),'utf8');
const replace=(s,a,b)=>{if(!s.includes(a))throw Error('Missing preview anchor: '+a);return s.replace(a,b)};
const spec={
  day:{time:'2026-10-07T10:20:00-04:00',temp:65},
  night:{time:'2026-10-07T23:10:00-04:00',temp:57},
  quiet:{time:'2026-10-07T14:00:00-04:00',temp:74},
  storm:{time:'2026-10-07T10:20:00-04:00',temp:64,storm:true},
  coast:{time:'2026-10-07T10:20:00-04:00',temp:72,coast:true},
  'coast-night':{time:'2026-10-07T23:10:00-04:00',temp:64,coast:true}
};
for(const [name,cs] of Object.entries(spec)){
  const now=new Date(cs.time),night=name.includes('night'),loc=cs.coast?'mb':'sp';
  const o={baseTemp:cs.temp-4,nowTemp:cs.temp,feels:cs.temp,rh:55,isDay:night?0:1,code:cs.storm?95:night?0:1,
    cloud:cs.storm?96:night?8:18,nowWind:cs.storm?18:4,nowDir:285,nowGust:cs.storm?35:8,nowUv:night?0:3,
    uvMax:4.5,windAmp:2,gustAmp:3,popCurve:()=>cs.storm?90:5,dailyPop:p=>p.fill(cs.storm?80:5),
    sunrise:cs.coast?'07:10':'07:25',sunset:cs.coast?'18:47':'18:55'};
  let html=replace(original,'</style>',motion+'\n</style>');
  html=replace(html,'/* ── the scene: arc, sun / moon, marsh horizon ──────── */',art+'\nconst rigFish=makeRigFish({pBlob,pTaper,pDot});\nconst FISH_PALETTE=FISH_DAY;\n'+proposal+'\n/* ── the scene: arc, sun / moon, marsh horizon ──────── */');
  html=replace(html,'function renderScene(sunrise,sunset,now,weather,dark,tideDir){','function renderScene(sunrise,sunset,now,weather,dark,tideDir,fishWins=[]){');
  html=replace(html,'  const scene=renderScene(sunrise,sunset,now,c,dark,LOC.tide?tideTrend(d.tides):0);',
    '  const previewWindows=LOC.fish&&farmCard(LOC,h,c,dy,warning,storm,now,[]).fish?fishWindows(h,now):[];\n  const scene=renderScene(sunrise,sunset,now,c,dark,LOC.tide?tideTrend(d.tides):0,previewWindows);');
  html=replace(html,'if(!PRM&&!wet&&!storm&&solunarWindows(now).some(w=>now>=w.start&&now<=w.end))\n      pondFx+=ringAt(pcx-prx*.08,base+13,4.5,13,4)+ringAt(pcx+prx*.16,base+10,3.5,17,11);',
    'if(!PRM&&!wet&&!storm&&temp>=45&&fishWins.some(w=>now>=w.start&&now<w.end))\n      pondFx+=fishBite(pcx-prx*.08,base+13,.88,{...inkPal(FISH_PALETTE),water:dark?"#B7D6E1":"#426E80"},{pond:true,delay:(Date.now()/1000)%18});');
  // Fish get breathing room below the fishing-time labels; scales and times stay intact.
  const a=html.indexOf('function renderMoon('),b=html.indexOf('function yearTitle(',a);
  let moon=html.slice(a,b);
  moon=replace(moon,'const topY=26,botY=H-8','const topY=50,botY=H-8');
  moon=replace(moon,'    ${labels}\n','    ${!PRM?previewChartFish(wins,X,Y,now,nx,ny,css):""}\n    ${labels}\n');
  html=html.slice(0,a)+moon+html.slice(b);
  html=html.replace(/<link[^>]+(?:fonts\.google|rel="manifest"|rel="apple-touch-icon"|rel="icon")[^>]*>/g,'');
  html=replace(html,'</head>','<style>@font-face{font-family:"Bricolage Grotesque";src:url(f/bricolage.woff2);font-weight:200 800}@font-face{font-family:"Spline Sans Mono";src:url(f/spline.woff2);font-weight:300 700}</style></head>');
  html=replace(html,'if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});','/* Service workers are disabled in this local study. */');
  const fixtures={forecast:forecast(now,o,'America/New_York',loc),marine:marine(now,o,'America/New_York'),tides:tides(now),alerts:{features:cs.storm?SEVERE(now):[]}};
  const init=`<script>
    // Sample forecast only. This page never asks a live weather service for data.
    const data=${JSON.stringify(fixtures)};
    localStorage.clear();localStorage.setItem('mbwx-loc',${JSON.stringify(loc)});
    const RealDate=Date,offset=${now.getTime()}-Date.now();
    function MockDate(...args){return args.length?new RealDate(...args):new RealDate(RealDate.now()+offset)}
    MockDate.now=()=>RealDate.now()+offset;MockDate.parse=RealDate.parse;MockDate.UTC=RealDate.UTC;MockDate.prototype=RealDate.prototype;window.Date=MockDate;
    const oldFetch=window.fetch.bind(window);
    window.fetch=async(url,options)=>{
      const u=String(url);
      if(u.includes('marine-api.open-meteo.com'))return new Response(JSON.stringify(data.marine));
      if(u.includes('api.open-meteo.com'))return new Response(JSON.stringify(data.forecast));
      if(u.includes('tidesandcurrents.noaa.gov'))return new Response(JSON.stringify(data.tides));
      if(u.includes('api.weather.gov/alerts'))return new Response(JSON.stringify(data.alerts));
      if(u.includes('api.weather.gov/products'))return new Response(JSON.stringify({'@graph':[]}));
      if(u.startsWith('https:'))throw Error('External requests are off in this sample.');
      return oldFetch(url,options);
    };
  </script>`;
  html=replace(html,'<script>',init+'\n<script>');
  html=replace(html,'</body>',`<script>
    const focus=new URLSearchParams(location.search).get('focus')||'chart';
    const ready=setInterval(()=>{if(!LAST?.d)return;clearInterval(ready);finishReveal();
      const el=document.querySelector(focus==='pond'?'#sceneSvg':'#moonSection');
      if(!${!!cs.coast})scrollTo(0,Math.max(0,el.getBoundingClientRect().top+scrollY-(focus==='pond'?245:160)));
    },100);
  </script></body>`);
  writeFileSync(path.join(OUT,name+'.html'),html);
}
copyFileSync(path.join(HERE,'gallery.html'),path.join(OUT,'index.html'));
console.log(OUT);
