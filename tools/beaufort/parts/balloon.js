/* ── Beaufort, October: the red balloon ─────────────────────────────────────────────────
   One red party balloon on a string, tied to a rail post on the walkway by the dock house. It is
   Pennywise's balloon from "It" ("they all float down here"), creepy only to the ones who know it:
   nothing in it is a face, a clown or a drop of blood. It is a balloon somebody tied to the dock.

   What has to survive on a phone is a small red ball on a pale line over the dock, with a darker
   nub of a knot under it and a white fleck of gloss on it. The rest is for the close-up: the
   classic latex shape (round over a short taper into the neck), the tied knot and its flared lip,
   the gathers at the neck, the bounce light low on the shadow side, and the string wrapped round
   the post and tied off in a bow.

   Drawn at ten units to the scene unit (BFT_BALLOON_U), the way the flags and the faces in the oak
   and the loft are, so the kit's tenth-of-a-unit rounding cannot step the knot or the bow. The
   scene draws it at .1. y=0 is the top of the rail post it is tied to (the dock's walkway post
   `top`, where the post's rounded cap starts), x=0 the post's axis. The string is wrapped round the
   post just under its cap, above the top rail, and runs about 13.6 scene units to the knot; the
   balloon's middle rides about 16.6 over the post in a calm.

   It answers the wind the way a tethered balloon does. In a calm it stands nearly straight up, the
   string with a little slack in it. The harder it blows the further it leans downwind (dir +1
   toward +x, -1 toward -x), the string drawn taut, bellied a little by the wind on it (flatter at
   the post, steeper at the balloon), and the balloon tipped to follow its string. The lean is the
   sustained wind's; the gusts are the motion's (bftBalloonMotion). The geometry is mirrored, never
   flipped, so the gloss and the lit edge stay on the side the light is on.

   It moves at two joints, transforms only: the string and the balloon swing together about the
   tie on the post (bft-balloon), and the balloon nods on its knot (bft-balloon-nod), on a beat that
   does not divide the swing's, so the two never fall into step. */
INK.bftBalloon={
  /* a bright, slightly scarlet red, so the night's blue takes it to a deep red and not to a plum */
  body:"#DB2128",knot:"#A3141C",lip:"#C11A22",sheen:"#F07A70",crease:"#8C0F18",glint:"#FFFFFF",
  /* the string: a pale cotton line, with a little of the sky's dark ink under it (stringInk), the
     way the cobweb's silk is drawn, so it reads on the bright sky and on the dark water alike */
  string:"#F4F0E6",stringInk:"#2A1B33",
  ink:"#2A1B33",shade:"#4A0C24",lit:"#FFE6B8",shadeOp:.32,litOp:.5};
/* the ink a thing this small wants: the flags' light line, a narrow crescent */
const BFT_BALLOON_O={line:.62,heavy:.3,shade:.85,lit:.5};
const BFT_BALLOON_U=10;
/* the string's length from the tie to the knot, in drawing units, and where it is tied: just under
   the post's rounded cap, above the walkway's top rail (whose top edge is about 3.9 down) */
const BFT_BALLOON_LEN=136;
const BFT_BALLOON_TIE=[0,2];
const bftBalloonClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bftBalloonR2=v=>Math.round(v*100)/100;

/* the balloon in its own frame: the string's end (the foot of the knot) at the origin, the balloon
   standing up its own axis (-y). A classic round latex balloon: a round crown, widest a third of
   the way down, then a long taper into a short neck. 31 wide and 39 tall over the neck */
const BFT_BALLOON_BODY=(()=>{
  const R=[[1.15,-5.2],[1.9,-6.7],[4.4,-8.5],[8.8,-11.6],[12.9,-16.4],[15.3,-22.4],[15.9,-28.8],[14.6,-35],[11.2,-40],[6,-43],[0,-43.9]];
  return[...R,...R.slice(0,-1).reverse().map(([x,y])=>[-x,y])];
})();
/* the middle of the round part and its radius, for the gloss, the bounce light and the scene's
   clearances */
const BFT_BALLOON_C=[0,-28.2],BFT_BALLOON_R=15.6;
/* the storybook's licence: a party balloon is about a foot across, a unit and a third here, and drawn
   true it would be a pink speck. At this size it is 3.6 units across (4.3px on a 390 phone), about two
   thirds of the dock's little pumpkin, so it reads as a red ball on a line at a glance */
const BFT_BALLOON_SIZE=1.12;

/* the lean from the vertical, in degrees, for a sustained wind in mph: a hair off upright in a calm,
   25° at 8 mph, 40° at 22, and never past 46°, so with its swing it always stands clear over the
   dock house's roof when it leans that way (at 50° and a gust's push it sat on the hip) */
const bftBalloonLean=mph=>2+44*(1-Math.exp(-Math.max(0,+mph||0)/11));

/* the string's centreline from the tie up to the knot, as points [x, y], and the angle from the
   vertical it leaves the knot at (the balloon follows it). slack is the calm's lazy S, gone by 10
   mph; belly is the wind's bend, the string leaving the post a few degrees flatter than it meets
   the balloon */
function bftBalloonString(mph,dir=1,len=BFT_BALLOON_LEN){
  const m=Math.max(0,+mph||0),d=dir<0?-1:1,th=bftBalloonLean(m);
  const slack=bftBalloonClamp(1-m/10,0,1)*7,belly=bftBalloonClamp(m/10,0,1)*6;
  const phi=s=>th+belly*(1-2*s)+slack*Math.sin(2*Math.PI*s);
  const N=36,P=[[BFT_BALLOON_TIE[0],BFT_BALLOON_TIE[1]]];
  let x=P[0][0],y=P[0][1];
  for(let i=0;i<N;i++){const a=phi((i+.5)/N)*Math.PI/180;x+=d*Math.sin(a)*len/N;y-=Math.cos(a)*len/N;P.push([x,y])}
  return{pts:P,end:[x,y],tip:d*phi(1),lean:th};
}

/* where everything is, in drawing units, for one wind: the tie, the knot, the balloon's tilt and
   its middle and radius. bftBalloonReach gives the balloon's middle and radius in scene units off
   the post's top, so the scene can keep it off the dock house's roof, the flag and the palmettos */
function bftBalloonGeo(mph,dir=1){
  const S=bftBalloonString(mph,dir),a=S.tip*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),[kx,ky]=S.end;
  const z=BFT_BALLOON_SIZE,toW=([x,y])=>[kx+z*(x*ca-y*sa),ky+z*(x*sa+y*ca)];
  return{tie:BFT_BALLOON_TIE,knot:S.end,tilt:S.tip,lean:S.lean,string:S.pts,toW,centre:toW(BFT_BALLOON_C),r:BFT_BALLOON_R*z};
}
const bftBalloonReach=(mph,dir=1)=>{const G=bftBalloonGeo(mph,dir),U=BFT_BALLOON_U;
  return{x:bftBalloonR2(G.centre[0]/U),y:bftBalloonR2(G.centre[1]/U),r:bftBalloonR2(G.r/U),knot:G.knot.map(v=>bftBalloonR2(v/U))}};
/* where it is tied in the scene: the first walkway post landward of the dock house, in dock units
   (the post's x and its top, where y=0 of the rig goes). The dock's own posts when its part is in the
   same script (a function declaration is hoisted, so the order the parts are loaded in does not
   matter), else the same seeded draw the dock makes for that post */
const bftBalloonPost=(len=95)=>{
  if(typeof bftDockWalkPosts==="function"){const p=bftDockWalkPosts(len)[0];return{x:p.x,y:p.top}}
  const r=mulberry(7500);return{x:+(36.6+(r()-.5)*.3).toFixed(2),y:-5.6+(r()-.5)*.5}};
const BFT_BALLOON_AT=bftBalloonPost();
/* the promise the placement makes, checked from a calm to a 45 mph gale either way, at both ends of
   the swing (bftBalloonStyle's push and lift): the balloon, with half a unit to spare, and its string
   stay off the dock house's tin roof and its ridge cap and off the flag's staff on the ridge, in dock
   units (the roof and the staff as dock.js draws them). Returns a list of what failed */
function bftBalloonCheck(at=BFT_BALLOON_AT){
  const U=BFT_BALLOON_U,errs=[];
  const roof=[[-2.6,-9.9],[28.6,-9.9],[18.9,-14.6],[18.9,-15.15],[7.1,-15.15],[7.1,-14.6]];
  const inPoly=(P,x,y)=>{let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const[a,b]=P[i],[e,d]=P[j];if((b>y)!==(d>y)&&x<(e-a)*(y-b)/(d-b)+a)c=!c}return c};
  const segD=(px,py,[ax,ay],[bx,by])=>{const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(px-ax-t*dx,py-ay-t*dy)};
  const roofD=(x,y)=>inPoly(roof,x,y)?0:Math.min(...roof.map((p,i)=>segD(x,y,p,roof[(i+1)%roof.length])));
  const staffD=(x,y)=>segD(x,y,[13,-15.15],[13,-27.3])-.3;
  for(const dir of[1,-1])for(const mph of[0,4,8,12,16,22,30,45]){
    const M=bftBalloonMotion(mph,mph*1.5),G=bftBalloonGeo(mph,dir),calm=mph<3;
    for(const sw of[dir*M.sway*(calm?1:.6),-dir*M.sway]){
      const a=sw*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),[tx,ty]=G.tie;
      const P=([x,y])=>[at.x+(tx+(x-tx)*ca-(y-ty)*sa)/U,at.y+(ty+(x-tx)*sa+(y-ty)*ca)/U];
      const [cx,cy]=P(G.centre),r=G.r/U+.5,tag=`${mph} mph toward ${dir>0?"+x":"-x"}, swung ${sw.toFixed(1)}°`;
      if(roofD(cx,cy)<r)errs.push(`${tag}: the balloon is on the dock house's roof`);
      if(staffD(cx,cy)<r)errs.push(`${tag}: the balloon is on the flag's staff`);
      const S=G.string.slice(4).map(P);
      if(S.some(([x,y])=>roofD(x,y)<.2))errs.push(`${tag}: the string crosses the roof`);
    }
  }
  return errs;
}

/* an ellipse as a closed path, turned by rot degrees about its middle */
const bftBalloonEll=(cx,cy,rx,ry,rot,role,x)=>{
  const a=rot*Math.PI/180,c=Math.cos(a),s=Math.sin(a),P=[];
  for(let i=0;i<14;i++){const t=i/14*Math.PI*2,u=Math.cos(t)*rx,v=Math.sin(t)*ry;P.push([cx+u*c-v*s,cy+u*s+v*c])}
  return pBlob(P,role,x)};

/**
 * The balloon on its string, tied to the post. mph is the sustained wind (the lean), dir the way it
 * blows (+1 toward +x). Options:
 *   light:  [x, y] toward the light in screen space (lightAt), so the gloss sits on the lit side;
 *           default the upper left
 *   night:  0 to 1, how far the night has come on: the gloss shrinks to the moon's small cold
 *           point. The colours are the scene's to tone; nothing here glows
 *   sway, nod: style attributes for the two joints (bftBalloonStyle), or nothing for a still balloon
 * Returns layers for inkRig, back to front: the swinging string and balloon, then the bow on the post.
 */
function rigBftBalloon(mph=0,dir=1,o={}){
  o=o||{};
  const G=bftBalloonGeo(mph,dir),toW=G.toW,T=G.tie,K=G.knot,d=dir<0?-1:1;
  const W=pts=>pts.map(p=>{const q=toW(p);return p.length>2?[q[0],q[1],p[2]]:q});
  const night=bftBalloonClamp(+o.night||0,0,1);
  /* the light, as a unit vector in screen space; the gloss sits toward it on the round part */
  let[lx,ly]=Array.isArray(o.light)?o.light:[-.65,-1];
  {const n=Math.hypot(lx,ly)||1;lx/=n;ly/=n;if(ly>.2){ly=.2;const m=Math.hypot(lx,ly)||1;lx/=m;ly/=m}}
  const [cx,cy]=G.centre,R=G.r;
  /* the string: the pale line, a fine shadow of ink beside it on the side away from the light. It
     is sampled every few units so the taper's spline follows the lean's curve */
  const sp=G.string.filter((p,i,a)=>i%4===0||i===a.length-1);
  const shadowSide=sp.map((p,i)=>{const a=sp[Math.max(0,i-1)],b=sp[Math.min(sp.length-1,i+1)];let nx=-(b[1]-a[1]),ny=b[0]-a[0];
    const n=Math.hypot(nx,ny)||1;nx/=n;ny/=n;if(nx*-lx+ny*-ly<0){nx=-nx;ny=-ny}return[p[0]+nx*1.5,p[1]+ny*1.5,3]});
  const string=[
    pTaper(shadowSide,"stringInk",{capStart:false,capEnd:false},{noSil:true,op:.58}),
    pTaper(sp.map(([x,y])=>[x,y,3]),"string",{capStart:false,capEnd:false},{noSil:true})];
  /* the balloon: its body (the neck runs down into the knot), the knot and its flared lip, the
     gathers at the neck, the bounce light low on the shadow side, and the gloss */
  const body=pBlob(W(BFT_BALLOON_BODY),"body");
  const knot=pBlob(W([[-1.15,-5.6],[1.15,-5.6],[1.7,-3.6],[3.3,-.9],[3.5,.15],[1.6,.55],[0,.3],[-1.6,.55],[-3.5,.15],[-3.3,-.9],[-1.7,-3.6]]),"knot");
  const lip=pBlob(W([[-3.6,-.5],[-1.8,-1.3],[0,-1.1],[1.8,-1.3],[3.6,-.5],[3.4,.6],[1.4,.95],[-1.4,.95],[-3.4,.6]]),"lip");
  /* the string tied round the neck just over the lip, a turn of it showing across the knot */
  const tie=pTaper(W([[-2.7,-2.1,1.25],[-1.2,-1.55,1.35],[0,-1.45,1.4],[1.2,-1.55,1.35],[2.7,-2.1,1.25]]),"string",{capStart:false,capEnd:false},{noSil:true,op:.95});
  const creases=[pTaper(W([[.5,-5.6,.7],[1.5,-8.6,.65],[3.3,-11.6,.2]]),"crease",{},{noSil:true,op:.45}),
    pTaper(W([[-.5,-5.6,.7],[-1.4,-8.4,.6],[-2.9,-11,.2]]),"crease",{},{noSil:true,op:.4})];
  /* the bounce light: a soft crescent inside the rim, low on the side away from the light, where
     the shadow crescent falls, so it shows as the reflected light a glossy ball carries there */
  const ba=Math.atan2(-ly,-lx),bounce=[];
  for(let i=0;i<=8;i++){const t=i/8,a=ba+(t-.5)*1.6,rr=R-2.1;bounce.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,.2+2.8*Math.sin(Math.PI*t)])}
  const sheen=pTaper(bounce,"sheen",{},{noSil:true,op:.36});
  /* the gloss: a long highlight across the round part toward the light, its length along the
     surface, and a small second fleck under it. Under the moon it is one small point */
  const gk=1-.45*night,ga=Math.atan2(ly,lx),gx=cx+Math.cos(ga)*R*.52,gy=cy+Math.sin(ga)*R*.52;
  const gloss=[bftBalloonEll(gx,gy,2.5*gk,5.6*gk,ga*180/Math.PI,"glint",{noSil:true,op:+(.9-.25*night).toFixed(2)})];
  if(night<.5){const g2=ga-.8,r2=R*.6;gloss.push(pDot(cx+Math.cos(g2)*r2,cy+Math.sin(g2)*r2,1.15,"glint",{noSil:true,op:.75}))}
  /* the bow on the post: the string wrapped round it (a band that dips toward us across the post's
     round face), the knot on its face, two loops and two short tails. The long end leaves the knot
     upward, so the bow sits over the string's foot */
  const[tx,ty]=T;
  const bow=[
    pTaper([[tx-9.4,ty-.9,1.9],[tx-4.5,ty+.35,2],[tx,ty+.75,2.1],[tx+4.5,ty+.35,2],[tx+9.4,ty-.9,1.9]],"string",{capStart:false,capEnd:false}),
    pTaper([[tx+.4,ty+.4,1.3],[tx-2.2,ty-1.4,1.4],[tx-5.2,ty-1.9,1.3],[tx-6.2,ty-.2,1.2],[tx-4.6,ty+1.2,1.3],[tx-1.6,ty+.9,1.3]],"string",{capStart:false,capEnd:false}),
    pTaper([[tx+.6,ty+.4,1.3],[tx+3,ty-1.7,1.4],[tx+5.8,ty-1.8,1.3],[tx+6.5,ty-.1,1.2],[tx+4.8,ty+1.3,1.3],[tx+1.8,ty+1.1,1.3]],"string",{capStart:false,capEnd:false}),
    pTaper([[tx-.6,ty+1.4,1.3],[tx-1.8,ty+4.4,1.1],[tx-3.1,ty+7.4,.9]],"string",{capStart:false}),
    pTaper([[tx+.8,ty+1.4,1.3],[tx+2,ty+4.8,1.1],[tx+2.6,ty+8.2,.9]],"string",{capStart:false}),
    pDot(tx+.1,ty+.7,1.5,"string")];
  return[
    {open:`<g class="bft-balloon"${o.sway?` style="${o.sway}"`:""}>`,pivot:T,layers:[
      {parts:string},
      {open:`<g class="bft-balloon-nod"${o.nod?` style="${o.nod}"`:""}>`,pivot:K,layers:[
        {parts:[body,...creases,sheen,knot,lip,tie,...gloss]}]}]},
    {parts:bow}];
}

/* ── the motion ─────────────────────────────────────────────────────────────────────────
   The swing about the tie: in a calm a slow drift of a couple of degrees either way (the bob of a
   balloon in still air); the further the gusts run over the wind, the wider and the quicker, so a
   gusty day jerks it about and a steady breeze only leans it. In wind the swing is lopsided the way
   a gust works it: pushed over a little further (six tenths of the swing), then lifting back the
   whole swing toward upright in the lull, so its lowest reach stays clear of the roof beside it
   (bftBalloonCheck). The nod is the balloon tipping on its knot behind the swing, once the gusts
   reach 6 mph; in still air the slow swing is the whole bob, and the calm nights, when the bats and
   the witch are out, carry one animation for it and not two. Both are rotations on the joints' own
   pivots, and the keyframes lurch and settle rather than run a sine, because a tethered balloon is
   pushed and then falls back. */
function bftBalloonMotion(mph,gustMph){
  const m=Math.max(0,+mph||0),g=Math.max(m,+gustMph||0);
  return{sway:bftBalloonR2(bftBalloonClamp(2+(g-m)*.32+m*.07,2,7)),dur:bftBalloonR2(bftBalloonClamp(7.2-g*.17,1.7,7.2)),
    nod:bftBalloonR2(bftBalloonClamp(3+(g-m)*.3,3,9)),nodOn:g>=6};
}
/* the style attributes for the two joints, phased off the wall clock so a repaint carries on where
   it was. The scene leaves them off under reduced motion, and the balloon holds still at its lean */
function bftBalloonStyle(mph,gustMph,dir=1,now=Date.now()){
  const M=bftBalloonMotion(mph,gustMph),nd=bftBalloonR2(M.dur*.71),t=now/1000,d=dir<0?-1:1;
  /* --bp the push (downwind, further over), --bl the lift (back toward upright); clockwise is +x */
  const calm=Math.max(0,+mph||0)<3,bp=bftBalloonR2(d*M.sway*(calm?1:.6)),bl=bftBalloonR2(-d*M.sway);
  const box="transform-box:view-box;transform-origin:0 0";
  return{
    sway:`${box};--bp:${bp}deg;--bl:${bl}deg;animation:bftBalloonSway ${M.dur}s ease-in-out -${(t%M.dur).toFixed(2)}s infinite`,
    nod:M.nodOn?`${box};--bn:${M.nod}deg;animation:bftBalloonNod ${nd}s ease-in-out -${((t+1.3)%nd).toFixed(2)}s infinite`:""};
}
/* the keyframes, for the page's stylesheet */
const BFT_BALLOON_CSS=`@keyframes bftBalloonSway{0%,100%{transform:rotate(var(--bl,-2deg))}34%{transform:rotate(var(--bp,2deg))}52%{transform:rotate(calc(var(--bp,2deg) * .3))}70%{transform:rotate(calc(var(--bp,2deg) * .65))}}`
  +`@keyframes bftBalloonNod{0%,100%{transform:rotate(var(--bn,3deg))}45%{transform:rotate(calc(var(--bn,3deg) * -1))}70%{transform:rotate(calc(var(--bn,3deg) * -.4))}}`;

/* ── the looks ─────────────────────────────────────────────────────────────────────────
   The rail post it is tied to, for the look only (the scene has its own): the post with its rounded
   cap, the walkway's top and mid rails in front of it, and the deck, in the dock's colours, lit
   the way the look lights the drawing, with a hairline that stays a hairline at every scale */
const bftBalloonPostSvg=(lt)=>{
  const hx=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),mx=(a,b,t)=>"#"+hx(a).map((v,i)=>Math.round(v+(hx(b)[i]-v)*t).toString(16).padStart(2,"0")).join("");
  const tn=c=>{let t=c;if(lt&&lt.warm)t=mx(t,lt.warm,.3*(lt.gold||0));if(lt&&lt.night)t=mx(t,"#15223D",.62*lt.night);return t};
  const ink=lt&&lt.night?"#0A1020":"#2A1B33",st=`stroke="${ink}" stroke-width=".7" vector-effect="non-scaling-stroke"`;
  return `<path d="M -9 0 A 9 9 0 0 1 9 0 L 9.6 66 L -9.6 66 Z" fill="${tn("#7B6C5C")}" ${st}/>`
    +`<rect x="-70" y="3.9" width="170" height="7.2" fill="${tn("#BAAC94")}" ${st}/>`
    +`<rect x="-70" y="28.9" width="170" height="5.2" fill="${tn("#BAAC94")}" ${st}/>`
    +`<rect x="-70" y="56" width="170" height="8" fill="${tn("#B4A58D")}" ${st}/>`
    +`<rect x="-70" y="64" width="170" height="14" fill="${tn("#837463")}" ${st}/>`;
};
const BFT_BALLOON_STATES={calm:{mph:0},breeze:{mph:8},windy:{mph:22},
  "windy-west":{mph:22,dir:-1},night:{mph:4,night:1,light:[.5,-1]}};
LOOK.balloon={pal:INK.bftBalloon,box:[-140,-205,300,290],s:.1,dist:.04,o:BFT_BALLOON_O,ground:false,
  states:BFT_BALLOON_STATES,
  draw:st=>rigBftBalloon(st.mph??0,st.dir??1,st),
  /* the post, and the placement's promise: anything bftBalloonCheck finds is printed in red over the
     panel, so a change to the lean or the swing that puts the balloon on the roof is seen here */
  extra:(st,lt)=>bftBalloonPostSvg(lt)+bftBalloonCheck().slice(0,6).map((e,i)=>`<text x="-136" y="${-190+i*9}" font-size="7" fill="#C00">${e}</text>`).join(""),
  css:BFT_BALLOON_CSS};
/* the balloon alone, close, for its knot, its gloss and its bounce light */
LOOK["balloon-head"]={pal:INK.bftBalloon,box:[-24,-188,48,60],s:.1,dist:.04,o:BFT_BALLOON_O,ground:false,
  states:{calm:{mph:0},night:{mph:0,night:1,light:[.5,-1]}},
  draw:st=>rigBftBalloon(st.mph??0,st.dir??1,st)};
/* the bow on the post, close */
LOOK["balloon-bow"]={pal:INK.bftBalloon,box:[-16,-12,32,30],s:.1,dist:.04,o:BFT_BALLOON_O,ground:false,
  states:{calm:{mph:0}},
  draw:st=>rigBftBalloon(st.mph??0,st.dir??1,st),
  extra:(st,lt)=>bftBalloonPostSvg(lt)};
