/* Injected only into generated local previews, never the published shell. */
function fishBite(x,y,s,pal,{delay=0,pond=false,tilt=0,active=true}={}){
  const id=`fishClip${++inkUid}`;
  const fish=inkRig(rigFish(),pal,{s,line:.8,heavy:.35,shade:1.3,lit:.65,light:[-.5,-1]});
  const water=pal.water||pal.ink;
  return `<g class="fish-bite ${active?'':'resting'}" data-fish-place="${pond?'pond':'chart'}" data-anchor="${x} ${y}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${tilt.toFixed(2)})" style="--bite-delay:-${delay.toFixed(2)}s;--bite-water:${water}" aria-hidden="true">
    <defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="-35" y="-40" width="70" height="41"/></clipPath></defs>
    <g clip-path="url(#${id})"><g class="bite-body"><g transform="scale(${s})">${fish}</g></g></g>
    <ellipse class="bite-ring" rx="9" ry="1.8"/>
    <g class="bite-drops"><path d="M -4 0 Q -7 -3 -7 -6 Q -3 -5 -4 0 M 0 -1 Q -1 -6 1 -9 Q 3 -5 0 -1 M 4 0 Q 5 -5 8 -5 Q 8 -2 4 0"/></g>
  </g>`;
}
function previewChartFish(wins,X,Y,now,nx,ny,css){
  const night=document.documentElement.dataset.theme==='dark';
  const pal={...FISH_PALETTE,water:night?'#A5C6D5':css.water};
  if(night)Object.assign(pal,{body:'#A1B391',mark:'#E2DDC0',fin:'#BC9966',ink:'#172633',lit:'#FFF3D0'});
  return wins.map((w,i)=>{
    const t=(w.start.getTime()+w.end.getTime())/2;
    const x=X(t),y=Y(moonPos(new Date(t)).alt*180/Math.PI);
    const slope=(Y(moonPos(new Date(t+6e4)).alt*180/Math.PI)-Y(moonPos(new Date(t-6e4)).alt*180/Math.PI))/(X(t+6e4)-X(t-6e4));
    /* Keep the live moon clear: a nearby fish waits further into the same band. */
    const far=t+Math.min(22*6e4,(w.end-t)*.7),fx=Math.abs(x-nx)<23?X(far):x;
    const fy=fx===x?y:Y(moonPos(new Date(far)).alt*180/Math.PI);
    if(Math.abs(fx-nx)<16&&Math.abs(fy-ny)<16)return '';
    return fishBite(fx,fy,.70,pal,{tilt:Math.atan(slope)*180/Math.PI,delay:(Date.now()/1000+i*5)%18});
  }).join('');
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  if(event.data?.type==='replay-fish'){
    document.getAnimations().filter(a=>String(a.animationName).startsWith('porchFish')).forEach(a=>{const t=a.effect.getTiming();a.currentTime=t.delay+t.duration;a.play()});
  }
  if(event.data?.type==='focus-fish'){
    const target=document.querySelector(event.data.view==='pond'?'#sceneSvg':'#moonSection');
    if(target)scrollTo({top:Math.max(0,target.getBoundingClientRect().top+scrollY-(event.data.view==='pond'?250:160)),behavior:'smooth'});
  }
});
