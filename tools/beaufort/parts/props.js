/* ── Beaufort: three small things ────────────────────────────────────────────────────
   The Bengals' tiger-striped crab-pot buoy off the dock (propBftBuoy), the hand-painted boiled
   peanut sign (propBftSign), and a bottlenose dolphin rolling in the Beaufort River
   (rigBftDolphin). The buoy and the sign are drawn at ten units to the scene unit, the way the
   faces in the oak and the loft are, so the kit's tenth-of-a-unit rounding never steps an edge
   on something three units wide; the scene draws them at .1. The dolphin is drawn in scene units.

   What meets the water is drawn whole and cut by the surface, the way the farm's chart fish is
   (fishBite): a static clip keeps the part above y=0, and a static fade keeps a faint copy of the
   part below it. The clip edge takes no ink, so nothing sits on a ruled dark base, and whatever
   moves inside the clip (the buoy's bob, the dolphin's roll) slides through the surface while the
   surface stays where it is. Neither the clip nor the fade is ever animated. */
const BFT_PROPS_UTIL=(()=>{
  /* Catmull-Rom through pts, sampled densely: the same curve inkSpline and taper() draw */
  const cr=(p0,p1,p2,p3,t)=>{const t2=t*t,t3=t2*t;return .5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3)};
  const curve=(pts,closed=false,per=8)=>{
    const P=closed?[pts[pts.length-1],...pts,pts[0],pts[1]]:[pts[0],...pts,pts[pts.length-1]],S=[];
    for(let i=1;i<P.length-2;i++){const[a,b,c,e]=[P[i-1],P[i],P[i+1],P[i+2]];
      for(let j=0;j<per;j++){const t=j/per;S.push([cr(a[0],b[0],c[0],e[0],t),cr(a[1],b[1],c[1],e[1],t)])}}
    if(!closed)S.push(pts[pts.length-1].slice(0,2));
    return S};
  /* a brush stroke as a polygon (pts are [x,y,width]) */
  const strokePoly=(pts,per=6)=>{
    const C=curve(pts.map(p=>[p[0],p[1]]),false,per),n=pts.length-1,L=[],R=[];
    C.forEach((p,i)=>{const u=i/(C.length-1)*n,k=Math.min(n-1,Math.floor(u)),w=pts[k][2]+(pts[k+1][2]-pts[k][2])*(u-k);
      const a=C[Math.max(0,i-1)],b=C[Math.min(C.length-1,i+1)],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1,dx=(b[0]-a[0])/l,dy=(b[1]-a[1])/l;
      L.push([p[0]-dy*w/2,p[1]+dx*w/2]);R.push([p[0]+dy*w/2,p[1]-dx*w/2])});
    return[...L,...R.reverse()]};
  /* the pieces of a closed polygon on one side of the water (y=0), each closed straight along
     the surface. Used only to find where a body crosses the surface, for the foam */
  const cut=(poly,above=true,level=0)=>{
    if(level)return cut(poly.map(p=>[p[0],p[1]-level]),above).map(q=>q.map(p=>[p[0],p[1]+level]));
    const ins=p=>above?p[1]<=0:p[1]>=0,n=poly.length,s=poly.findIndex(p=>!ins(p));
    if(s<0)return[poly];
    const out=[];let cur=null;
    for(let k=0;k<n;k++){const a=poly[(s+k)%n],b=poly[(s+k+1)%n],ia=ins(a),ib=ins(b);
      if(ia)cur.push(a);
      if(ia!==ib){const t=a[1]/(a[1]-b[1]),x=[a[0]+(b[0]-a[0])*t,0];
        if(!ia)cur=[x];else{cur.push(x);out.push(cur);cur=null}}}
    return out.filter(p=>p.length>2)};
  /* keep a polygon inside a convex one (Sutherland-Hodgman), so a stripe never runs off the float */
  const inside=(poly,clip)=>{
    let A=0;clip.forEach((p,i)=>{const q=clip[(i+1)%clip.length];A+=p[0]*q[1]-q[0]*p[1]});const sg=A>0?1:-1;
    let out=poly;
    for(let i=0;i<clip.length&&out.length;i++){const a=clip[i],b=clip[(i+1)%clip.length],inp=out;out=[];
      const side=p=>sg*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))>=0;
      for(let j=0;j<inp.length;j++){const p=inp[j],q=inp[(j+1)%inp.length],sp=side(p),sq=side(q);
        if(sp)out.push(p);
        if(sp!==sq){const d1=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]),d2=(b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]),t=d1/(d1-d2);
          out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t])}}}
    return out};
  /* written to a hundredth: these outlines are dense polylines, and at a tenth they step */
  const f2=v=>Math.round(v*100)/100,path=poly=>"M "+poly.map(p=>`${f2(p[0])} ${f2(p[1])}`).join(" L ")+" Z";
  const rot=(deg,cx=0,cy=0)=>{const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return([x,y,...r])=>[cx+(x-cx)*c-(y-cy)*s,cy+(x-cx)*s+(y-cy)*c,...r]};
  /* several outlines as one fill: one <path>, every subpath wound the same way, so where they
     overlap the fill does not double and one opacity covers the whole shape with no seams */
  const area=poly=>{let A=0;poly.forEach((p,i)=>{const q=poly[(i+1)%poly.length];A+=p[0]*q[1]-q[0]*p[1]});return A};
  const union=polys=>polys.map(p=>path(area(p)>0?p:p.slice().reverse())).join(" ");
  /* a silhouette of no size. A unit made only of foam or a faint copy under the water has no
     silhouette, and inkUnit then writes its masks a negative box, which the browser logs as an
     error. A zero-radius dot gives it a box and draws nothing: no area, and a zero-length stroke
     with the default butt cap paints nothing */
  const anchor=(x=0,y=0)=>pDot(x,y,0,"anchor");
  /* the surface, as an opening tag for a layer's `open`: what is inside stays above y=0 (x0..x1,
     up to y0). Its defs are inside the group so the one tag carries them */
  const above=(id,x0,x1,y0)=>`<g clip-path="url(#${id})"><defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="${x0}" y="${y0}" width="${x1-x0}" height="${-y0}"/></clipPath></defs>`;
  /* and under it: what is inside shows only below y=0, fading out by `depth`, because the river
     is tidal and the colour of tea */
  const below=(id,x0,x1,depth)=>`<g mask="url(#${id})"><defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${depth}"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#8a8a8a"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="${id}" maskUnits="userSpaceOnUse" x="${x0}" y="0" width="${x1-x0}" height="${depth}"><rect x="${x0}" y="0" width="${x1-x0}" height="${depth}" fill="url(#${id}g)"/></mask></defs>`;
  return{curve,strokePoly,cut,inside,path,rot,union,anchor,above,below};
})();

/* ── (a) The Bengal tiger nod: a crab-pot buoy ──────────────────────────────────────
   Every crabber in the Lowcountry paints his buoys in his own colours, so one painted like a
   Bengal tiger, bobbing off the dock, is the school's nod without a logo in sight. A foam float,
   straight sided with a round foot and a round dome of a top, a weathered grey stick through it,
   orange with the tiger's stripes: three across the part that shows, coming in thick off
   alternate sides and running to a point, with more orange than black. It floats with about a
   third of itself under and leans down-current on its line.
   Drawn at ten units to the scene unit: the float is 34 wide and 50 long (3.4 by 5), the stick
   stands 2 more out of its crown. y=0 is the water surface, x=0 the float's axis at the
   waterline. `lean` is in degrees, the top toward +x. The float is drawn whole and the surface
   cuts it, so the bob can move it and its waterline stays on the water. */
INK.bftBuoy={body:"#F2661E",band:"#1C181F",stick:"#8A857A",cap:"#BDB6A8",collar:"#6A645C",under:"#D9631A",underBand:"#4C2A1C",lip:"#F4F8F4",ink:"#2A1B33",shade:"#6A2A30",lit:"#FFE7B0",shadeOp:.3,litOp:.55};
const propBftBuoy=({lean=7,draft=.34,id}={})=>{
  const U=BFT_PROPS_UTIL,W=17,W0=15,HC=31,HT=50,RC=5,RT=3,vw=HT*draft,uid=id||`bftBuoy${++inkUid}`;
  /* the float in its own frame: u across, v up its axis from the flat foot. A bullet: narrowest at
     the foot, swelling to its shoulder, then a round dome to the crown the stick comes out of. The
     right side from the foot's corner up and round to the crown, then the left side back down */
  const side=[];
  for(let i=0;i<=8;i++){const a=Math.PI/2*i/8;side.push([W0-RC+RC*Math.sin(a),RC-RC*Math.cos(a)])}
  for(let v=RC+2;v<HC;v+=2)side.push([W0+(W-W0)*Math.sin(Math.PI/2*(v-RC)/(HC-RC)),v]);
  for(let i=0;i<=16;i++){const a=Math.PI/2*i/16;side.push([RT+(W-RT)*Math.cos(a),HC+(HT-HC)*Math.sin(a)])}
  const F=[...side,...side.slice().reverse().map(([u,v])=>[-u,v])];
  const R=U.rot(lean),toW=([u,v,...w])=>R([u,-(v-vw),...w]);
  const float=F.map(toW);
  /* the tiger's stripes, in the float's frame. Each comes in off an edge at its thickest, where
     it wraps round out of sight, and runs across to a sharp point with a little lift at the end,
     sagging in the middle because we look down on the float. Three over the water, one under */
  const sag=([u,v,w])=>[u,v-2*(1-Math.min(1,(u/W)**2)),w];
  const S=[
    [[19,41.8,6.4],[11,43,5.6],[3,43.6,3.6],[-3.5,43.2,1.4],[-7.5,44.4,.2]],
    [[-19,33.4,6.8],[-10,32.4,6],[-1,32.8,4],[5.5,34,1.6],[10,36,.2]],
    [[19,24.2,6.6],[10,23,5.8],[1,23.4,3.8],[-5.5,24.6,1.5],[-10,26.4,.2]],
    [[-19,11.4,6.2],[-9,10.4,5.2],[0,11,3.4],[6,12.4,1.4],[10,14.2,.2]]].map(s=>s.map(sag));
  const stripes=S.map(s=>U.inside(U.strokePoly(s,5),F).map(toW)).filter(p=>p.length>2);
  /* the stick: weathered grey wood through the float's axis, its top cut square and paler */
  const stick=U.strokePoly([[0,-15,3.4],[0,20,3.6],[0,HT,3.6],[.15,HT+12,3.5],[.25,HT+21,3.4]]).map(toW);
  const top=U.strokePoly([[.22,HT+19,3.5],[.25,HT+21,3.4]]).map(toW);
  /* the collar the stick is wedged through, a dark ring on the crown */
  const collar=U.strokePoly([[-3.8,HT-1.5,1.3],[-1.6,HT-.7,1.9],[1.6,HT-.7,1.9],[3.8,HT-1.5,1.3]],4).map(toW);
  /* where it sits in the water, on the water and not on the bob, so the float slides through it:
     the near waterline as a thin bright arc across the float's front (a round float's near
     waterline dips toward us), and a short ripple off either side */
  const wl=U.cut(float,true).flatMap(p=>p.filter(q=>Math.abs(q[1])<.01).map(q=>q[0])),x0=Math.min(...wl),x1=Math.max(...wl);
  const arc=[0,.12,.3,.5,.7,.88,1].map(t=>[x0+(x1-x0)*t,.15+1.1*Math.sin(Math.PI*t),t>0&&t<1?1.5-.5*Math.abs(t-.45):.3]);
  const lip=[part(U.path(U.strokePoly(arc,4)),"lip",{noSil:true,op:.75}),
    part(U.path(U.strokePoly([[x0-.6,.5,.2],[x0-3,.9,1.2],[x0-6.5,1.1,.2]],4)),"lip",{noSil:true,op:.5}),
    part(U.path(U.strokePoly([[x1+.6,.5,.2],[x1+3.4,.8,1.1],[x1+7,1.0,.2]],4)),"lip",{noSil:true,op:.5})];
  return[
    /* under the surface: the float and its stick as one warm shape, the stripe under it, fading */
    {open:U.below(uid+"u",-60,60,34),pivot:[0,0],layers:[
      {open:`<g class="bft-buoy-bob bft-buoy-under">`,pivot:[0,0],layers:[
        {parts:[part(U.union([stick,float]),"under",{noSil:true,op:.62}),...stripes.map(p=>part(U.path(p),"underBand",{noSil:true,op:.4})),U.anchor()]}]}]},
    /* over it: the inked float, its stripes and the stick */
    {open:U.above(uid+"a",-60,60,-120),pivot:[0,0],layers:[
      {open:`<g class="bft-buoy-bob">`,pivot:[0,0],layers:[
        {parts:[part(U.path(stick),"stick"),part(U.path(top),"cap",{noSil:true}),part(U.path(float),"body"),...stripes.map(p=>part(U.path(p),"band")),part(U.path(collar),"collar",{noSil:true})]}]}]},
    {parts:[...lip,U.anchor()]}]};
LOOK.buoy={pal:INK.bftBuoy,box:[-34,-82,72,118],s:.1,dist:.12,
  o:{line:.5,heavy:.25,shade:.7,lit:.45},
  states:{rest:{lean:7},slack:{lean:2},ebb:{lean:-16}},
  draw:st=>propBftBuoy(st)};

/* ── (b) The boiled peanut sign ─────────────────────────────────────────────────────
   A plywood board on two stakes driven into the bank, painted white and lettered by hand in red:
   BOILED / P-NUTS and an arrow. What reads at phone size is the shape every roadside stand in
   the Lowcountry has, a white board on two legs with red marks on it; close up it reads the
   words. The letters are a sign painter's brush: heavy where the brush is pulled down, thin
   across, swelling as it lands and lifting off at the end, each letter its own size and lean
   (seeded, so they never reshuffle), the second line crowding as the painter runs out of board
   before the arrow, and one letter has dripped. Drawn at ten units to the scene unit: the board
   is 140 by 70 (14 by 7), standing on y=0, centred on x=0. `dir` is the way the arrow points
   (the words never mirror). It is scenery and makes no claim: no pot, no steam. */
INK.bftSign={board:"#F3ECDD",edge:"#B08E64",grain:"#DCD0B6",stake:"#8E6D4A",paint:"#C8302A",nail:"#7E7064",
  ink:"#2A1B33",shade:"#4A3450",lit:"#FFF0C4",shadeOp:.28,litOp:.5};
const BFT_SIGN_GLYPHS={
  /* strokes in cap heights: x across, y up from the baseline. The way a sign painter pulls them:
     stems and bowls downward, crossbars left to right */
  B:{w:.56,s:[[[0,1],[0,0]],[[0,.99],[.32,1],[.5,.88],[.48,.66],[.3,.55],[.02,.54]],[[.04,.55],[.38,.55],[.56,.4],[.54,.14],[.34,.01],[.02,0]]]},
  O:{w:.64,s:[[[.36,1],[.1,.88],[0,.5],[.08,.12],[.32,0],[.56,.1],[.64,.48],[.56,.86],[.34,1],[.22,.95]]]},
  I:{w:.08,s:[[[.04,1],[.04,0]]]},
  L:{w:.46,s:[[[0,1],[0,.02]],[[-.02,.02],[.46,0]]]},
  E:{w:.46,s:[[[0,1],[0,0]],[[-.02,.99],[.46,1]],[[0,.52],[.36,.53]],[[-.02,.01],[.48,0]]]},
  D:{w:.58,s:[[[0,1],[0,0]],[[0,.99],[.28,.98],[.52,.8],[.58,.5],[.52,.2],[.28,.02],[0,0]]]},
  P:{w:.52,s:[[[0,1],[0,0]],[[0,.99],[.32,1],[.52,.86],[.52,.62],[.32,.49],[.02,.48]]]},
  "-":{w:.3,s:[[[0,.46],[.3,.48]]]},
  N:{w:.6,s:[[[0,1],[0,0]],[[0,1],[.6,0]],[[.6,0],[.6,1]]]},
  U:{w:.56,s:[[[0,1],[0,.32],[.08,.08],[.28,0],[.48,.08],[.56,.32],[.56,1]]]},
  T:{w:.56,s:[[[0,1],[.56,1.01]],[[.28,1],[.28,0]]]},
  S:{w:.5,s:[[[.48,.86],[.34,.99],[.14,.98],[.02,.84],[.06,.64],[.26,.53],[.46,.4],[.5,.19],[.38,.03],[.16,0],[0,.12]]]},
  ">":{w:.82,s:[[[0,.5],[.78,.5]],[[.46,.84],[.82,.5]],[[.82,.5],[.46,.16]]]},
};
const propBftSign=({dir=1,seed=7}={})=>{
  const U=BFT_PROPS_UTIL,r=mulberry(seed),j=a=>(r()-.5)*2*a,noSil={noSil:true};
  /* the sign stands a degree off true, and the board was nailed on another degree off that */
  const lean=U.rot(-1.2),tilt=U.rot(1,0,-97),B=p=>lean(tilt(p));
  const stake=(x,top,w)=>pTaper([[x,3,w],[x+.4,-60,w],[x+.6,top,w*.96]].map(lean),"stake",{capEnd:false,capStart:false});
  const stakes=[stake(-47,-142,5.4),stake(46,-139,5.4)];
  /* the board: plywood, cut by hand, a corner knocked off, and its edge showing along the foot
     and the right side because it stands a little to our left */
  const bd=[[-70,-132],[-30,-132.6],[20,-132.2],[66,-132.8],[69.4,-129.4],[70,-96],[69.6,-62.2],[30,-61.6],[-20,-62],[-69.6,-62.4],[-70.2,-96]];
  const board=part(U.path(bd.map(B)),"board"),edge=part(U.path(bd.map(([x,y])=>B([x+1.8,y+2.6]))),"edge");
  const grain=[-120,-108,-91,-77].map(y=>part(U.path(U.strokePoly([[-66,y+j(1),.2],[-30,y+j(1.4),1],[10,y+j(1.4),1.2],[45,y+j(1.4),.9],[66,y+j(1),.2]].map(B))),"grain",{noSil:true,op:.6}));
  /* the nails sit in the margins, where the stakes are behind the board, so none reads as a
     stop or a colon among the letters */
  const nails=[[-46.4,-127.8],[-46.2,-66.2],[46.6,-128.2],[46.8,-66.6]].map(([x,y])=>pDot(...B([x,y]),1.1,"nail"));
  /* the lettering. Each letter is drawn its own size (about 8% either way), lean and height off
     a wobbling baseline. The brush is heavy where it is pulled down and thin where it runs
     across, swells a little as it lands and lifts off at the end of the stroke. `crowd` tightens
     the letters and shrinks them a touch toward the end of the line */
  const letters=[],at={};
  const brush=(pts,H)=>{const n=pts.length,o=[];
    for(let i=0;i<n;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(n-1,i+1)],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1,vy=Math.abs(b[1]-a[1])/l,t=i/Math.max(1,n-1);
      o.push([...B(pts[i]),H*.152*(.76+.4*vy)*(1.05+.1*Math.sin(Math.PI*t)-.28*t*t*t)])}
    return o};
  const set=(text,H,track,crowd)=>{const n=text.length;let x=0;const out=[];
    [...text].forEach((ch,i)=>{const g=BFT_SIGN_GLYPHS[ch],k=crowd*i/Math.max(1,n-1),h=H*(1+j(.08))*(1-.07*k);
      out.push({ch,g,x,h});x+=(g?g.w*h:H*.3)+(g?track*(1-.45*k):0)});
    const last=out[out.length-1];return{out,w:last.x+(last.g?last.g.w*last.h:0)}};
  const word=(text,cx,base,H,track,crowd=0)=>{const{out,w}=set(text,H,track,crowd),x0=cx-w/2;
    for(const{ch,g,x,h}of out){if(!g)continue;
      const sl=j(.06),by=base+j(2),flip=ch===">"&&dir<0,xx=x0+x;
      at[ch]={x:xx,by,h};
      for(const st of g.s){
        const pts=st.map(([u,v])=>{const uu=flip?g.w-u:u;return[xx+(uu+v*sl)*h+j(.5),by-v*h+j(.5)]});
        letters.push(pTaper(brush(pts,H),"paint",{},noSil))}}};
  word("BOILED",-2,-101,24,6.4);
  word(dir>0?"P-NUTS >":"> P-NUTS",dir>0?-1:1,-70,20.5,5.6,.8);
  /* one drip, where the brush went on heavy at the foot of the D's bowl: a thin run and a bead */
  {const d=at.D,x=d.x+.3*d.h,y=d.by+.5;
    letters.push(pTaper([[x,y-1,2.4],[x+.2,y+3,1.2],[x+.3,y+6.4,1],[x+.3,y+7.6,2.1]].map(B),"paint",{},noSil))}
  return[{parts:stakes},{parts:[edge,board,...grain,...nails,...letters]}]};
LOOK["peanut-sign"]={pal:INK.bftSign,box:[-80,-150,160,158],s:.1,dist:.04,ground:false,
  o:{line:.6,heavy:.3,shade:.8,lit:.5},
  states:{right:{dir:1},left:{dir:-1}},
  draw:st=>propBftSign(st),
  extra:()=>`<ellipse cx="0" cy="1" rx="62" ry="4" fill="#2A1B33" opacity=".18"/>`};

/* ── (c) Dealer's choice: a bottlenose dolphin rolling in the Beaufort River ────────────────
   They are everywhere in the river, and what you see from the bank is the roll. A roll happens at
   one spot on the water: the dolphin's path humps up through the surface and its body slides
   along that hump, head first, so the melon and the blowhole come up and it breathes, then the
   arched back with the swept-back fin, then the tail stock humps over and slides under.
   So the body is bent once, to the curve of that hump, and the roll is that one bent body turning
   about the hump's own centre, under the water: one rotation, no frames to step through. The head
   is bent less than the back, so it stands up out of the curve as it rises; the tail is bent more,
   so the flukes stay under and only the tail stock humps over as it goes. The surface (a static
   clip) cuts it, and the clip's edge takes no ink.
   Facing -x (swimming that way); y=0 is the surface; x=0 the top of the hump.
   The body is drawn in its own frame (snout at x=0, the frame line along y=0, 36 long), scaled
   by z about the surface. What has to read on a phone: a grey dome of a back with a small fin
   that curves back off its crest (a shark's is a tall triangle that cuts along), and on the rise
   the round melon over a short beak, which no shark has. The pale throat, the smile, the eye and
   the blowhole are for the close-up. */
INK.bftDolphin={body:"#6E7C88",fin:"#6E7C88",far:"#5A6672",belly:"#D6DAD4",detail:"#3B444E",eye:"#15181E",under:"#3A5866",foam:"#F2F6F5",blow:"#FFFFFF",
  ink:"#22202C",shade:"#2B3350",lit:"#FFF1D2",shadeOp:.32,litOp:.55};
const BFT_DOLPHIN={
  /* the body in its own frame: the back from the beak's tip to the flukes, then the flukes seen
     from the side (a thin blade, never a fish's fork), then the belly back to the beak. The tail
     stock is deep, the keel a bottlenose has, so it humps over as a ridge and not a sausage */
  back:[[0,0],[.5,-.38],[1.4,-.62],[2.3,-.76],[2.9,-1.06],[3.5,-1.72],[4.3,-2.52],[5.4,-3.08],[7,-3.44],[9.5,-3.74],[12,-3.88],[14.5,-3.82],[17,-3.56],[19.5,-3.16],[22,-2.8],[24.5,-2.54],[27,-2.2],[29,-1.72],[30.6,-1.2]],
  fluke:[[32,-1.0],[34,-1.12],[36.1,-1.52],[36.5,-1.22],[35.3,-.3],[33.4,.36],[31.6,.64]],
  belly:[[30.6,.8],[29,1.22],[27,1.6],[24.5,1.88],[22,2.2],[19.5,2.6],[17,3.02],[14.5,3.26],[12,3.32],[9.5,3.12],[7.5,2.72],[5.5,2.04],[4,1.38],[2.8,.88],[1.5,.56],[.4,.32]],
  /* falcate and small, built below on the back itself: a convex leading edge that leaves the
     back in a short fillet and stands up at about 44 degrees (so it never carries the back's own
     curve on up into a shark's ramp), bending back to a tip swept past the trailing root, the
     trailing edge hollowed under it and running back into the back. About 3.4 over its base, 9%
     of the body, on a base 5.7 long. Its foot runs inside the body, which is painted over it, so
     the two are one silhouette with no spur at either root */
  fin:null,
  flipper:[[7.4,1.9],[9.2,2.9],[11.2,4.4],[12.7,5.4],[13.1,5.1],[11.8,3.7],[10.4,2.1]],
  /* the pale throat and belly, up the flank behind the flipper and fading toward the tail */
  pale:[[.6,.24],[2.2,.36],[3.8,.62],[5.6,.86],[8,.84],[10.5,.9],[13,1.2],[15.2,1.0],[17.6,.84],[20,1.2],[23,1.5],[25.4,1.42],[25,1.62],[22,2.0],[19.5,2.54],[17,2.96],[14.5,3.2],[12,3.26],[9.5,3.06],[7.5,2.66],[5.5,1.98],[4,1.32],[2.8,.82],[1.5,.5]],
  eye:[6.1,-.36],blowhole:[8.9,-3.68],
  /* drawn this much larger than its frame: 42 long nose to flukes */
  z:1.18,
  /* the bend, held through the whole roll: the frame line's curvature per unit along it (k from
     station 10 to tail[0], easing to kHead ahead of station 7 and to kTail by tail[1]), the
     station at the top of the hump at rest (just ahead of the fin, so the dome's crest shows in
     front of it), and how far the back clears the water there, in scene units: the dome stands
     about 1.5 times the fin's height */
  bend:{top:15.4,out:5.8,k:1/10,kHead:.02,kTail:.16,tail:[22,26]},
  /* the roll, in degrees about the hump's centre (clockwise positive, as CSS rotate()). rise:
     the head up, tilted back, the blowhole out; arch: the back and the fin over the top; dive:
     the fin tipped forward going under and the tail stock humped over. from and to are where it
     is all under the surface, worked out below */
  roll:{rise:78,arch:0,dive:-70,from:0,to:0},
};
/* the fin, built on the back as the body draws it (the same Catmull-Rom), so its leading edge
   leaves the back along it: its height over the back runs from nothing, tangent at the root, up
   at about 44 degrees, and bends back to the tip */
BFT_DOLPHIN.fin=(()=>{const C=BFT_PROPS_UTIL.curve(BFT_DOLPHIN.back,false,24),back=x=>{for(let i=1;i<C.length;i++)if(C[i][0]>=x)return C[i-1][1]+(C[i][1]-C[i-1][1])*(x-C[i-1][0])/(C[i][0]-C[i-1][0]);return C[C.length-1][1]};
  const lead=[[0,0],[.03,.03],[.06,.11],[.1,.3],[.15,.62],[.22,1.08],[.32,1.65],[.45,2.25],[.6,2.8],[.75,3.12],[.88,3.28],[1,3.34]].map(([u,h])=>{const x=14+6.7*u;return[+x.toFixed(3),+(back(x)-h).toFixed(3)]});
  return[[12.4,back(12.4)+.12],...lead,[20.25,-6.06],[19.75,-5.62],[19.4,-5.05],[19.3,-4.4],[19.55,-3.75],[20.05,-3.27],[20.8,-2.9],[21.7,-2.52],[21.2,-1.6],[16.4,-2.2],[12.6,-3.0]]})();
/* the bend as a placing function: the frame line's curvature integrated out from the top station
   to both ends, and every point of the frame ([x, y], y off the frame line) carried along the
   line's normal into the water's units, scaled by z about the surface. Its .centre is the centre
   of the hump's curve, where the roll turns */
const bftDolphinSpine=(bend=BFT_DOLPHIN.bend)=>{
  const D=BFT_DOLPHIN,N=370,L=37,ds=L/N,ang=new Array(N+1),pos=new Array(N+1),z=D.z||1;
  const ease=(a,b,f)=>a+(b-a)*Math.max(0,Math.min(1,f));
  const[t0,t1]=bend.tail||[23,27],k=x=>x<10?ease(bend.kHead,bend.k,(x-7)/3):x>t0?ease(bend.k,bend.kTail,(x-t0)/(t1-t0)):bend.k;
  const i0=Math.round(bend.top/ds);
  ang[i0]=0;pos[i0]=[0,0];
  for(let i=i0+1;i<=N;i++){ang[i]=ang[i-1]+k((i-.5)*ds)*ds;const m=(ang[i]+ang[i-1])/2;pos[i]=[pos[i-1][0]+Math.cos(m)*ds,pos[i-1][1]+Math.sin(m)*ds]}
  for(let i=i0-1;i>=0;i--){ang[i]=ang[i+1]-k((i+.5)*ds)*ds;const m=(ang[i]+ang[i+1])/2;pos[i]=[pos[i+1][0]-Math.cos(m)*ds,pos[i+1][1]-Math.sin(m)*ds]}
  const at=x=>{const u=Math.max(0,Math.min(N-1e-9,x/ds)),i=Math.floor(u),f=u-i,j=Math.min(N,i+1);
    return[pos[i][0]+(pos[j][0]-pos[i][0])*f,pos[i][1]+(pos[j][1]-pos[i][1])*f,ang[i]+(ang[j]-ang[i])*f]};
  /* the back at the top station sits `out` over the water */
  const dorsal=x=>{const b=D.back;for(let i=1;i<b.length;i++)if(b[i][0]>=x){const f=(x-b[i-1][0])/(b[i][0]-b[i-1][0]);return b[i-1][1]+(b[i][1]-b[i-1][1])*f}return b[b.length-1][1]};
  const lift=-bend.out/z-dorsal(bend.top);
  const place=([x,y])=>{const[sx,sy,a]=at(x),nx=Math.sin(a),ny=-Math.cos(a);return[z*(sx-y*nx),z*(sy-y*ny+lift)]};
  place.centre=[0,+(z*(lift+1/bend.k)).toFixed(3)];
  return place};
/* the outlines of the whole body, bent, and turned `rot` degrees about the hump's centre */
const bftDolphinShape=(rot=0)=>{
  const D=BFT_DOLPHIN,U=BFT_PROPS_UTIL,place=bftDolphinSpine(),C=place.centre,R=U.rot(rot,C[0],C[1]),P=p=>R(place(p));
  const smooth=pts=>U.curve(pts,true,6);
  return{C,P,body:smooth([...D.back,...D.fluke,...D.belly]).map(P),fin:smooth(D.fin).map(P),flip:smooth(D.flipper).map(P),pale:smooth(D.pale).map(P)}};
/* from and to: the first turn either way at which every part of it is under the surface */
{const R=BFT_DOLPHIN.roll,top=rot=>{const s=bftDolphinShape(rot);return Math.min(...[...s.body,...s.fin,...s.flip].map(p=>p[1]))};
  let a=0;while(a<200&&top(a)<0)a+=2;R.from=a;
  let b=0;while(b>-200&&top(b)<0)b-=2;R.to=b}
/* the roll as a single number: t=0 is the head just under the surface, about to come up, and t=1
   the flukes just gone under, the turn running evenly between them, so a linear timing is a
   steady swim. The blow is the breath on the rise */
const bftDolphinPoseAt=t=>{const R=BFT_DOLPHIN.roll,u=Math.max(0,Math.min(1,t)),rot=R.from+(R.to-R.from)*u;
  return{rot:+rot.toFixed(2),blow:+Math.max(0,1-Math.abs(rot-R.rise)/14).toFixed(2)}};
/* where it breaks the surface at a turn: the widest stretch of it out of the water, [left, right],
   or null while it is all under (a fin tip breaking the water on its own is not the stretch) */
const bftDolphinSpan=rot=>{const U=BFT_PROPS_UTIL,sh=bftDolphinShape(rot);
  const sp=[...U.cut(sh.body,true),...U.cut(sh.fin,true)].map(p=>{const xs=p.filter(q=>Math.abs(q[1])<1e-6).map(q=>q[0]);return xs.length>1?[Math.min(...xs),Math.max(...xs)]:null}).filter(Boolean).sort((a,b)=>a[0]-b[0]);
  const m=[];for(const x of sp){const l=m[m.length-1];if(l&&x[0]<=l[1]+.3)l[1]=Math.max(l[1],x[1]);else m.push(x.slice())}
  return m.length?m.reduce((a,b)=>b[1]-b[0]>a[1]-a[0]?b:a):null};
/* the water's answer through the roll, for the scene to bake into keyframes: at t, how far the bow
   curl (the leading, -x end) and the wake curl (the trailing end) sit from where the rest pose
   draws them, so each rides its own crossing by translateX, and whether anything is out at all
   (out:false, the curls and the lapping are hidden). The blow is bftDolphinPoseAt(t).blow */
const bftDolphinWashAt=t=>{const a=bftDolphinSpan(0),s=bftDolphinSpan(bftDolphinPoseAt(t).rot);
  return s?{bow:+(s[0]-a[0]).toFixed(2),wake:+(s[1]-a[1]).toFixed(2),out:true}:{bow:0,wake:0,out:false}};
/* the dolphin at one moment of its roll: a state name ("rise", "arch", "dive"), a turn in degrees,
   or {rot, blow}. The scene draws "arch" (no turn) and turns `bft-dolphin` about its pivot; the
   preview states bake their turn in. o.blow adds the breath (at the rise's blowhole) for the scene
   to show by opacity; o.id names the clip and the fade when one page draws more than one */
const rigBftDolphin=(state="arch",o={})=>{
  const U=BFT_PROPS_UTIL,D=BFT_DOLPHIN,id=o.id||`bftDol${++inkUid}`;
  const st=typeof state==="number"?{rot:state,blow:0}:state&&typeof state==="object"?state:{rot:D.roll[state]??0,blow:state==="rise"?1:0};
  const{C,P,body,fin,flip,pale}=bftDolphinShape(st.rot||0),Z=D.z||1;
  /* the smile, the crease between the beak and the melon, the blowhole and the eye */
  const stroke=(pts,role)=>part(U.path(U.strokePoly(pts.map(([x,y,w])=>[...P([x,y]),w*Z]),5)),role,{noSil:true});
  const[ex,ey]=P(D.eye);
  const face=[stroke([[.35,.18,.14],[1.6,.36,.26],[3.4,.4,.28],[4.8,.18,.2],[5.5,-.08,.08]],"detail"),
    stroke([[2.6,-.92,.05],[2.9,-.66,.15],[3.05,-.3,.05]],"detail"),
    stroke([[8.5,-3.56,.05],[8.9,-3.5,.18],[9.3,-3.56,.05]],"detail"),
    pDot(ex,ey,.27*Z,"eye")];
  /* the fin is painted under the body and in its grey, so there is no saddle where they meet */
  const inked=[part(U.path(flip),"far"),part(U.path(fin),"fin"),part(U.path(body),"body"),part(U.path(pale),"belly",{noSil:true}),...face];
  /* under the surface: the body, the fin and the flipper as one faint shape, fading over 4 units */
  const under=[part(U.union([body,fin,flip]),"under",{noSil:true,op:.34}),U.anchor(...C)];
  /* the water where it breaks the surface, worked out at this moment of the roll: a curl of white
     at each end that starts on the body just over the surface, hugs its flank and runs out on the
     water, the bigger one at the leading (-x) end where it pushes the water, and a thin broken
     wash along the surface between, so the cut never reads as a ruled line */
  const sp=bftDolphinSpan(st.rot||0);
  const foam=(d,op)=>part(U.path(d),"foam",{noSil:true,op});
  const bow=sp?(x0=>[
    foam(U.strokePoly([[x0+1.1,-.2,.06],[x0+.35,-.62,.46],[x0-.55,-.58,.52],[x0-1.5,-.22,.34],[x0-2.6,.06,.06]],4),.85),
    foam(U.strokePoly([[x0-.9,.12,.05],[x0-2.2,.24,.26],[x0-3.6,.18,.05]],4),.5)])(sp[0]):[];
  const wake=sp?(x1=>[
    foam(U.strokePoly([[x1-.8,-.14,.05],[x1-.15,-.42,.36],[x1+.7,-.3,.3],[x1+1.6,.04,.05]],4),.75),
    foam(U.strokePoly([[x1+.6,.14,.05],[x1+1.8,.24,.2],[x1+2.9,.16,.05]],4),.45)])(sp[1]):[];
  const lr=mulberry(5150),lap=[];
  if(sp){let a=sp[0]+1.6+lr()*1.2;
    while(a<sp[1]-2.4){const b=Math.min(sp[1]-1.6,a+.9+lr()*1.8);lap.push(foam(U.strokePoly([[a,.1,.04],[(a+b)/2,-.02-lr()*.06,.16+lr()*.12],[b,.1,.04]],3),+(.32+lr()*.2).toFixed(2)));a=b+1.4+lr()*2.6}}
  const[hx,hy]=bftDolphinShape(D.roll.rise).P(D.blowhole);
  /* the breath: a short burst straight up out of the blowhole, bushy at the top, with a few drops */
  const blow=[foam(U.strokePoly([[hx,hy-.1,.3],[hx-.05,hy-1.1,.9],[hx+.05,hy-2.3,1.6],[hx+.25,hy-3.4,2.1]],5),.55),
    part(scallop(hx+.3,hy-3.9,1.55,1.05,8,41,{flat:.15,jitter:.35}),"blow",{noSil:true,op:.48}),
    part(scallop(hx-.75,hy-3.4,.85,.7,6,43,{flat:.15,jitter:.35}),"blow",{noSil:true,op:.36}),
    ...[[.9,-2.2,.16],[-.95,-2.5,.14],[1.4,-3.2,.12],[-1.5,-3.9,.11],[.5,-5.3,.1]].map(([dx,dy,r])=>pDot(hx+dx,hy+dy,r,"blow",{noSil:true,op:.55})),
    U.anchor(hx,hy)];
  const x0=-60,x1=60;
  return[
    {open:U.below(id+"u",x0,x1,4.2),pivot:[0,0],layers:[
      {open:`<g class="bft-dolphin bft-dolphin-under">`,pivot:C,layers:[{parts:under}]}]},
    {open:U.above(id+"a",x0,x1,-40),pivot:[0,0],layers:[
      {open:`<g class="bft-dolphin">`,pivot:C,layers:[{parts:inked}]}]},
    /* the water's answer, on the water and not on the turn: the scene carries the curls along
       their crossings with bftDolphinWashAt, and shows the lapping while the back is over */
    ...(sp?[
      ...(o.lap===false?[]:[{open:`<g class="bft-dolphin-lap">`,pivot:[(sp[0]+sp[1])/2,0],layers:[{parts:[...lap,U.anchor(sp[0],0)]}]}]),
      {open:`<g class="bft-dolphin-wake">`,pivot:[sp[1],0],layers:[{parts:[...wake,U.anchor(sp[1],0)]}]},
      {open:`<g class="bft-dolphin-bow">`,pivot:[sp[0],0],layers:[{parts:[...bow,U.anchor(sp[0],0)]}]}]:[]),
    ...((o.blow||st.blow>.05)?[{open:`<g class="bft-dolphin-blow"${o.blow?"":` opacity="${Math.min(1,st.blow).toFixed(2)}"`}>`,pivot:[hx,hy],layers:[{parts:blow}]}]:[])]};
LOOK.dolphin={pal:INK.bftDolphin,box:[-19,-17,38,22],s:1,dist:.2,
  o:{line:.8,heavy:.35,shade:1.1,lit:.6},
  states:{rise:"rise",arch:"arch",dive:"dive"},
  draw:st=>rigBftDolphin(st)};
/* the same, at the size and distance it will roll at in mid-river */
LOOK["dolphin-mid"]={...LOOK.dolphin,s:.6,dist:.3};
/* the whole roll as a strip of moments, to judge the motion the scene will run as one rotation */
LOOK["dolphin-roll"]={...LOOK.dolphin,states:Object.fromEntries([0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1].map(t=>[`t${t}`,bftDolphinPoseAt(t)]))};
