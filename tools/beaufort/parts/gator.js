/* ── Beaufort: the American alligator ─────────────────────────────────────────────
   Out in the Beaufort River's edge only sometimes. Facing -x. Three poses:
   float  the log: the snout's nostril knob, flat water, the two raised eye knobs, then a low line
          of the back's double row of scutes and the tail's crest breaking the surface; the body a
          dim darker shape under the water ("under", no outline). y=0 is the water's surface.
   bask   hauled out on a mud bank at low tide, the whole animal; y=0 is the mud.
          gape is the same animal with its head tipped back off the lower jaw, the way they cool.
   night  the snout, the eyes and the neck's first plates only, plain, on dark water. y=0 is the
          water's surface. No eyeshine: nothing is shining a light on it.
   Every joint takes its phase off the wall clock: rigBftGator(pose, phase). */
INK.bftGator={
  body:"#2C3224",far:"#272D21",scute:"#424A35",scuteFar:"#242A1E",belly:"#C9BC8C",
  mark:"#23291C",detail:"#1C2115",claw:"#26261C",
  mouth:"#E4CBA6",tongue:"#D3A28A",throat:"#7E5B45",tooth:"#E2D7BA",
  eye:"#C9A43A",nose:"#15170F",
  under:"#24312B",wake:"#E4EEEA",moonlip:"#A9C0E4",
  ink:"#1E2016",shade:"#1E2238",shadeOp:.38,lit:"#FFE2A8",litOp:.4};

/* rotate points (and anything after x, y) about a pivot, clockwise on screen for +deg */
const bftGatorRot=(pts,[cx,cy],deg)=>{const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return pts.map(([x,y,...r])=>[cx+(x-cx)*c-(y-cy)*s,cy+(x-cx)*s+(y-cy)*c,...r])};
/* y along a polyline (in either direction) at x */
const bftGatorAlong=(pl,x)=>{const P=pl[0][0]<pl[pl.length-1][0]?pl:pl.slice().reverse();
  if(x<=P[0][0])return P[0][1];
  for(let i=1;i<P.length;i++)if(x<=P[i][0]){const[a,b]=[P[i-1],P[i]];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])}
  return P[P.length-1][1]};
/* a crest plate: an upright keeled scute standing on (x, y), h tall, w across its foot, leaning
   back (+x) a little the way the tail's plates do */
const bftGatorPlate=(x,y,h,w,role,x2={})=>part(
  `M ${f1(x-w/2)} ${f1(y)} Q ${f1(x-w*.22)} ${f1(y-h*.82)} ${f1(x+h*.18)} ${f1(y-h)} L ${f1(x+w/2)} ${f1(y)} Z`,role,x2);
/* a low rounded scute on the back */
const bftGatorBump=(x,y,h,w,role,x2={})=>part(
  `M ${f1(x-w/2)} ${f1(y)} Q ${f1(x-w*.3)} ${f1(y-h*1.25)} ${f1(x+w*.1)} ${f1(y-h)} Q ${f1(x+w*.42)} ${f1(y-h*.7)} ${f1(x+w/2)} ${f1(y)} Z`,role,x2);
/* a tooth hanging from (or, with h<0, standing on) the point p, leaning back a touch */
const bftGatorTooth=([x,y],h,w=.4,lean=.07)=>part(
  `M ${f1(x-w/2)} ${f1(y)} L ${f1(x+lean)} ${f1(y+h)} L ${f1(x+w/2)} ${f1(y)} Z`,"tooth",{noSil:true});

/* ── bask ────────────────────────────────────────────────────────────────────────── */
/* the tail: from the hips at x≈1 to the tip at x≈32, lying on the mud and curling a little
   toward us, so its far end sits lower on the screen. Its top carries on the line of the back */
const BFT_GATOR_TAIL={x0:1,len:31};
const bftGatorTailAt=t=>{const x=BFT_GATOR_TAIL.x0+BFT_GATOR_TAIL.len*t,yb=.1+1.25*Math.pow(t,1.8),
  h=5.3*Math.pow(1-t,1.15)+.32;return[x,yb,yb-h]};
/* the crest's height along the tail: low at the root, where it carries on the back's own scutes,
   tallest a fifth of the way down, then tapering to the tip */
const bftGatorCrestH=t=>t<.2?.8+.85*(t-.03)/.17:.4+1.25*Math.pow((1-t)/.8,1.1);
/* the line of the back, neck to hips */
const BFT_GATOR_BACK=[[-18.2,-4.5],[-16.5,-4.85],[-14,-5.4],[-10.5,-5.95],[-6.5,-6.2],[-2.5,-6.05],[.5,-5.7],[2.8,-5.1]];
function bftGatorTail(){
  const top=[],bot=[];
  for(let i=0;i<=14;i++){const t=i/14*.985,[x,yb,yt]=bftGatorTailAt(t);top.push([x,yt]);bot.push([x,yb])}
  const[tx,ty]=bftGatorTailAt(1);
  const body=pBlob([[-2,-5.75],...top,[tx+.4,ty-.05],...bot.slice().reverse(),[-2,.25]],"body");
  /* the double row of crest plates, unevenly spaced the way a real one is, merging into one row
     a little under halfway down */
  const r=mulberry(4127),ts=[];
  for(let t=.03;t<.95;t+=.052*(1+.22*(r()-.5)))ts.push(t);
  const near=[],far=[];
  ts.forEach((t,i)=>{
    const[x,,yt]=bftGatorTailAt(t),h=bftGatorCrestH(t)*(.94+.12*r());
    near.push(bftGatorPlate(x,yt+.35,h+.3,1.45,"scute"));
    const tf=t+.026;
    if(tf<.46){const[xf,,ytf]=bftGatorTailAt(tf);far.push(bftGatorPlate(xf,ytf-.05,bftGatorCrestH(tf)+.25,1.3,"scuteFar"))}
  });
  /* the pale belly just showing along the underside */
  const belly=pTaper([[-1,-.3,.5],[5,-.08,.45],[11,.22,.3],[16,.48,.08]],"belly",{},{noSil:true});
  return{far,near:[body,...near,belly]};
}
/* The head. An alligator's is short and heavy with a blunt, rounded snout, never a crocodile's
   long V. The cranium and upper jaw are one outline; its lower edge is the mouth line, which runs
   wavy (down over the big front teeth, up, down again over the biggest, then up into the corner of
   the mouth, the smile). H is the jaw's hinge; OCC the back of the skull, where the gape tips it;
   NECK the head's own pivot for a lift */
const BFT_GATOR_H=[-19.6,-2.35],BFT_GATOR_OCC=[-18.4,-3.9],BFT_GATOR_NECK=[-18.3,-2.9];
const BFT_GATOR_LIP=[[-28.3,-1.55],[-27.6,-1.38],[-26.8,-1.6],[-25.7,-1.36],[-24.5,-1.5],[-23.3,-1.72],[-22.2,-1.98],[-21.3,-2.3],[-20.75,-2.52]];
const BFT_GATOR_SKULL=[[-28.85,-2],[-28.9,-2.75],[-28.45,-3.32],[-27.75,-3.58],[-27.05,-3.42],[-26.45,-3.22],[-25.3,-3.3],
  [-24.1,-3.55],[-23.2,-3.85],[-22.6,-4.3],[-21.95,-4.75],[-21.1,-4.6],[-20.3,-4.35],[-19.2,-4.38],[-17.9,-4.45],
  [-17.1,-3.7],[-17.1,-2.7],[-18.1,-2.5],[-19.2,-2.42],[-20.1,-2.48],...BFT_GATOR_LIP.slice().reverse()];
/* the lower jaw: its top edge (hidden under the upper jaw while the mouth is shut), then the back of
   the jaw and the heavy jowl, then the chin */
const BFT_GATOR_JAW=[[-28.3,-1.62],[-26.5,-1.74],[-24.5,-1.84],[-22.5,-2.16],[-20.4,-2.76],[-18.6,-2.86],[-17.4,-2.4],
  [-16.9,-1.3],[-17.3,-.4],[-18.6,-.02],[-21,.08],[-24,.06],[-26.4,-.02],[-27.9,-.22],[-28.6,-.62],[-28.75,-1.1]];
const BFT_GATOR_JAWTOP=BFT_GATOR_JAW.slice(0,5);
const BFT_GATOR_GAPE=36;
function bftGatorHead(gape,phase=()=>""){
  const H=BFT_GATOR_H,R=p=>gape?bftGatorRot(p,BFT_GATOR_OCC,BFT_GATOR_GAPE):p,JT=BFT_GATOR_JAWTOP;
  const jaw=[];
  if(!gape){
    /* the mouth's pale inside, a band standing up off the jaw under the upper jaw where it cannot be
       seen, so a jaw dropped a few degrees on bft-gator-jaw opens onto it and never onto air. It
       overlaps the jaw's top edge, which tucks under the upper jaw all the way to the corner */
    const L=BFT_GATOR_LIP.filter(([x])=>x>=-27.7);
    jaw.push(pBlob([[-27.9,-1.75],...L.map(([x,y])=>[x,y-.2-1.25*Math.min(1,(H[0]-x)/8)]),
      ...L.slice().reverse().map(([x])=>[x,bftGatorAlong(JT,x)+.12]),[-27.25,bftGatorAlong(JT,-27.25)+.1]],"mouth",{noSil:true}));
  }
  /* the lower jaw lies on the mud and stays there in the gape */
  jaw.push(pBlob(BFT_GATOR_JAW,"body"),
    /* the pale throat edge, faint, along the back half of the jaw only */
    pTaper([[-25.5,-.24,.02],[-22.5,-.2,.17],[-19.5,-.3,.02]],"belly",{},{noSil:true}));
  if(gape){
    /* the open mouth between the two jaws. Its front edge curves back from just behind each tip,
       so the jaws read as two jaws with air between their tips and not as a card; then the tongue
       on the floor, the throat dark at the back, and the lower teeth standing along the jaw */
    const up=R(BFT_GATOR_LIP.filter(([x])=>x>=-26.9).map(([x,y])=>[x,y-.25])),lo=JT.filter(([x])=>x>=-26.8).map(([x,y])=>[x,y+.1]),a=up[0],b=lo[0];
    /* the front edge: a smooth curve bowing back between the two jaws, about 2.4 deep */
    const C=[(a[0]+b[0])/2+4.8,(a[1]+b[1])/2+.3],qb=t=>[0,1].map(i=>(1-t)*(1-t)*b[i]+2*(1-t)*t*C[i]+t*t*a[i]);
    jaw.push(pBlob([b,qb(.25),qb(.5),qb(.75),...up,[-19.9,-2.75],...lo.slice(1).reverse()],"mouth"),
      pBlob([[-25,-1.98],[-23.4,-2.32],[-21.8,-2.78],[-20.7,-3.1],[-21.4,-3.32],[-23.1,-2.86],[-24.6,-2.32]],"tongue",{noSil:true}),
      pBlob([[-19.9,-2.7],[-20.4,-3.3],[-20.9,-3.9],[-20.4,-4.35],[-19.8,-3.6]],"throat",{noSil:true}),
      ...[[-27.35,.34],[-25.95,.44],[-24.45,.3],[-23,.36],[-21.8,.26]].map(([x,h])=>bftGatorTooth([x,bftGatorAlong(JT,x)+.04],-h,.36,-.05)));
  }
  /* the cranium and the upper jaw, with the raised eye on its knob, the ear's slit behind it and
     the nostrils on the knob at the tip; a few upper teeth hang over the lower jaw, uneven, most of
     them in the front third and one by the corner */
  const P=[pBlob(R(BFT_GATOR_SKULL),"body")];
  const teeth=gape?[[-27.6,.4],[-25.75,.58],[-24.2,.32],[-22.8,.38],[-21.6,.28]]:[[-27.65,.36],[-25.75,.52],[-24.2,.3],[-21.7,.34]];
  for(const[x,h]of teeth){const y=bftGatorAlong(BFT_GATOR_LIP,x),[q,s1,s2]=R([[x+.07,y+h],[x-.2,y-.04],[x+.2,y-.04]]);
    P.push(part(`M ${f1(s1[0])} ${f1(s1[1])} L ${f1(q[0])} ${f1(q[1])} L ${f1(s2[0])} ${f1(s2[1])} Z`,"tooth",{noSil:true}))}
  P.push(pTaper(R([[-22.8,-4.08,.16],[-21.95,-4.62,.3],[-21,-4.42,.14]]),"detail"),
    pTaper(R([[-20.35,-3.92,.16],[-19.85,-3.84,.3],[-19.3,-3.88,.12]]),"detail"),
    pTaper(R([[-21.2,-2.4,.12],[-20.6,-2.62,.22],[-20.15,-2.98,.08]]),"detail"),
    pTaper(R([[-28.3,-3.2,.2],[-27.8,-3.42,.3],[-27.3,-3.32,.14]]),"nose"),
    pBlob(R([[-22.7,-3.98],[-21.95,-4.32],[-21.2,-4.06],[-21.95,-3.76]]),"eye"),
    pTaper(R([[-21.95,-4.3,.16],[-21.95,-4.04,.24],[-21.95,-3.78,.16]]),"nose"));
  return[{open:`<g class="bft-gator-jaw" style="${phase(83)}">`,pivot:H,layers:[{parts:jaw}]},{parts:P}];
}
/**
 * The alligator hauled out on the mud, facing -x, y=0 the mud, about 61 long (x -28.9 to 32.4)
 * and 6.2 tall at the back (6.9 to the scute tops); the near toes reach y≈2.2. The gape lifts the
 * snout to about y=-9.1.
 * gape: the head tipped back 36° off the lower jaw, which stays on the mud, the way they cool.
 * Joints: bft-gator-tail (the hips), bft-gator-head (the neck), bft-gator-jaw (the hinge).
 */
function rigBftGatorBask(gape=false,phase=()=>""){
  const tail=bftGatorTail(),B=x=>bftGatorAlong(BFT_GATOR_BACK,x);
  /* the back's scutes in two rows, unevenly spaced, the far row peeking over the near one */
  const rb=mulberry(4131),xs=[];for(let x=-14.2;x<1.4;x+=1.8+.45*rb())xs.push(x);
  const nearRow=xs.map(x=>bftGatorBump(x,B(x)+.35,.6+.18*rb(),1.5,"scute"));
  const farRow=xs.map(x=>x+.95).filter(x=>x<2).map(x=>bftGatorBump(x,B(x)+.12,.5+.1*rb(),1.3,"scuteFar"));
  /* a row of small raised scutes along the top of the flank, and a sparser one under it */
  const rf=mulberry(4133),flank=[];
  for(let x=-13.6;x<.8;x+=1.5+.6*rf()){const y=B(x)+1.55+.2*rf();
    flank.push(pBlob([[x-.42,y+.12],[x-.22,y-.22],[x+.18,y-.28],[x+.44,y+.12]],"mark"))}
  for(let x=-11.8;x<-1;x+=2.1+.9*rf()){const y=B(x)+2.85+.25*rf();
    flank.push(pBlob([[x-.32,y+.1],[x-.15,y-.16],[x+.14,y-.2],[x+.34,y+.1]],"mark"))}
  return[
    {open:`<g class="bft-gator-tail" style="${phase(61)}">`,pivot:[1,-3],layers:[{parts:tail.far},{parts:tail.near}]},
    {parts:farRow},
    {parts:[
      /* trunk and neck, belly flat on the mud; the upper arm and the thigh are part of its mass */
      pBlob([[-20.6,-3.4],[-19.6,-4.25],[-18.2,-4.5],[-16.5,-4.85],[-14,-5.4],[-10.5,-5.95],[-6.5,-6.2],[-2.5,-6.05],
        [.5,-5.7],[2.8,-5.1],[3.9,-3.4],[3.6,-.3],[1,.2],[-4,.3],[-10,.3],[-15,.15],[-18.4,-.2],[-20.2,-1.2]],"body"),
      pTaper([[-14.9,-3.9,3],[-13.4,-2.7,2.6],[-12.4,-1.8,2.2]],"body"),
      pTaper([[-.3,-4,3.4],[-2,-2.5,2.9],[-3.3,-1.3,2.4]],"body"),
      pTaper([[-17.5,-.3,.12],[-15,-.28,.5],[-8,-.16,.55],[-1,-.2,.5],[2.5,-.3,.12]],"belly",{},{noSil:true}),
      ...nearRow,...flank,
      /* the creases that give the legs their angles: the elbow pointing up and back, the knee forward */
      pTaper([[-15.9,-4.35,.08],[-13.6,-3.55,.3],[-11.7,-2.55,.28]],"detail"),
      pTaper([[1.7,-4.75,.08],[-1.2,-3.55,.3],[-3.95,-2.15,.28]],"detail")]},
    {open:`<g class="bft-gator-head" style="${phase(83)}">`,pivot:BFT_GATOR_NECK,layers:bftGatorHead(gape,phase)},
    /* the neck over the back of the head: body colour laid over the seam, inside the outline, so the
       head is never bolted on; the nuchal plates behind the skull; and the skin fold at the throat */
    {parts:[
      pBlob(gape?[[-18.9,-4.1],[-16.4,-4.45],[-15.8,-2.4],[-16.4,-.45],[-18.2,-.4],[-18.9,-1.6],[-19.1,-3.2]]
        :[[-18.3,-4.05],[-16.4,-4.4],[-15.8,-2.4],[-16.4,-.45],[-18.2,-.4],[-18.55,-1.6],[-18.6,-3.2]],"body",{noSil:true}),
      pBlob([[2.3,-4.6],[4.6,-4.6],[5,-2.4],[4.3,-.35],[2.6,-.45],[2.1,-2.6]],"body",{noSil:true}),
      ...[[-17.4,.72],[-16.05,.86]].map(([x,h])=>bftGatorBump(x,B(x),h,1.4,"scute")),
      pTaper([[-18.25,-1.85,.06],[-17.85,-1.1,.18],[-17.95,-.5,.06]],"detail")]},
    /* the near forearm and hand, outlined over the flank: the elbow a point standing up and back,
       the forearm down and forward, the hand flat on the mud with four short thick fingers splayed
       forward, each ending in its claw */
    {parts:[
      pTaper([[-11.35,-2.55,.7],[-11.9,-1.75,1.75],[-12.8,-.6,1.6],[-13.75,.3,1.3]],"body",{capStart:false}),
      pBlob([[-13.1,-.15],[-13.35,.85],[-14.3,1.35],[-15.2,1.1],[-15.2,.3],[-14.3,-.1]],"body"),
      ...bftGatorToes([[[-14.5,.45],[-15.95,.2]],[[-14.6,.75],[-16.2,.8]],[[-14.5,1],[-15.85,1.45]],[[-14.2,1.15],[-15.05,1.85]]])]},
    /* the near shin and foot: the knee a point forward, the shin back and down, the foot planted
       behind it with four toes splayed back */
    {parts:[
      pTaper([[-4.35,-2.1,.7],[-3.65,-1.25,1.9],[-2.6,-.35,1.75],[-1.3,.4,1.45]],"body",{capStart:false}),
      pBlob([[-1.9,0],[-.6,-.1],[.6,.4],[.75,1.15],[-.3,1.4],[-1.6,1.05]],"body"),
      ...bftGatorToes([[[.2,.4],[1.75,.15]],[[.35,.72],[2.05,.8]],[[.2,1.02],[1.75,1.45]],[[-.2,1.18],[.95,1.9]]])]}];
}
/* short thick toes, a foot's worth: each a stroke from its root to its tip with a small dark claw
   hooked on past the tip, a touch down onto the mud */
const bftGatorToes=toes=>toes.flatMap(([a,b])=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);
  return[pTaper([[a[0],a[1],.68],[(a[0]+b[0])/2,(a[1]+b[1])/2,.58],[b[0],b[1],.46]],"body"),
    pTaper([[b[0]-dx/l*.1,b[1]-dy/l*.1,.3],[b[0]+dx/l*.42,b[1]+dy/l*.42+.08,.07]],"claw")]});

/* ── float and night ─────────────────────────────────────────────────────────────── */
/* the pale lip of water where a knob breaks the surface */
const bftGatorLip=(x0,x1,y=.15,k=1,role="wake",op=.75)=>pTaper([[x0,y,.1*k],[(x0+x1)/2,y+.12,.4*k],[x1,y,.1*k]],role,{},{noSil:true,op});
/* a streak of broken water along an arm of the V, bowed a little outward the way a wake stands up */
const bftGatorStreak=(x0,y0,x1,y1,w,op)=>pTaper([[x0,y0,w*.25],[(x0+x1)/2,(y0+y1)/2-.18,w],[x1,y1,w*.25]],"wake",{},{noSil:true,op});
/* the knobs that break the surface: the nostrils at the tip, flat water, then the two eyes, the far
   one smaller, a little behind and above the near one, with a notch between them, so the pair reads
   as two eye knobs and not one dome; the far eye itself is under its brow and unseen */
function bftGatorKnobs(){
  const farEye=[pBlob([[-10.4,.2],[-10.3,-1.3],[-9.85,-2.02],[-9.45,-2.34],[-8.95,-2.2],[-8.5,-1.6],[-8.05,-.8],[-7.75,.2]],"far")];
  /* the near eye's knob: steep in front, the brow standing over the eye, then a slope back to the
     skull's flat table just under the water */
  const nearEye=[pBlob([[-11.9,.3],[-11.8,-.85],[-11.3,-1.85],[-10.55,-2.25],[-9.8,-2.05],[-9.1,-1.35],[-8.3,-.6],[-7.6,.3]],"body"),
    pTaper([[-11.55,-1.4,.14],[-10.75,-2.0,.28],[-9.8,-1.92,.12]],"detail"),
    pBlob([[-11.25,-1.04],[-10.65,-1.42],[-10.05,-1.15],[-10.65,-.86]],"eye"),
    pTaper([[-10.65,-1.4,.14],[-10.65,-1.13,.2],[-10.65,-.86,.14]],"nose")];
  /* the nostril knob at the snout's tip, its top a little flat, the two nostrils slits on its crown */
  const snout=[pBlob([[-19.5,.3],[-19.4,-.5],[-18.95,-1.08],[-17.8,-1.3],[-16.7,-1.1],[-16.25,-.5],[-16.15,.3]],"body"),
    pTaper([[-18.65,-1.08,.12],[-18.35,-1.2,.2],[-18.05,-1.22,.1]],"nose"),
    pTaper([[-17.55,-1.22,.1],[-17.25,-1.2,.2],[-16.95,-1.08,.12]],"nose")];
  /* the first plates of the neck, just breaking the water behind the skull */
  const nuchal=[[-5.6,.74],[-4.2,.62],[-2.9,.48]].map(([x,h])=>bftGatorBump(x,.25,h,1.35,"scute"));
  return{farEye,nearEye,snout,nuchal};
}
/**
 * The alligator floating like a log, facing -x, y=0 the water's surface, about 40 long
 * (x -19.5 to 20.6 above the water, the dim body under it to about 24).
 * night: the snout's knob, the two eyes and the neck's first plates, plain, nothing under them;
 *   their lips are role "moonlip", which the scene keeps untoned while the moon is up.
 * glide: under way, the water answering at the bow and off the tail.
 * Joints: bft-gator-tail (the hips), bft-gator-head (behind the skull, under the water).
 */
function rigBftGatorFloat(night=false,glide=false,phase=()=>""){
  const k=bftGatorKnobs(),L=[],lip=night?"moonlip":"wake",lop=night?.95:.75,lk=night?1.4:1;
  if(!night){
    /* the body under the water, dim, no outline: the head's wedge, the trunk with the legs tucked
       flat along its sides the way they swim, and the root of the tail; the rest of the tail
       swings with the crest */
    L.push({parts:[part(inkSpline([[9.6,.3],[4,.3],[-6,.3],[-14,.3],[-18.6,.32],[-19.6,.55],[-18.6,.85],[-15,.95],[-10,1.2],
      [-6,1.6],[-3.5,2.1],[-1.2,2.4],[1.5,2.3],[4.5,2.45],[7.5,2.7],[9.6,2.62]])+" Z","under",{noSil:true,op:.38})]});
  }
  /* gliding, the water answers: a small pale bulge at the bow, a V of broken streaks opening back
     from the snout (the near arm toward us, the far one beyond), and a swirl off the tail */
  if(glide)L.push({parts:[
    pTaper([[-20.2,-.05,.12],[-20.05,.3,.55],[-19.4,.62,.5],[-18.3,.72,.12]],"wake",{},{noSil:true,op:.8}),
    bftGatorStreak(-18.7,.85,-15.5,1.55,.42,.72),bftGatorStreak(-14.5,1.78,-11.6,2.4,.34,.56),bftGatorStreak(-10.6,2.6,-8.2,3.1,.26,.4),
    bftGatorStreak(-18.5,-.22,-15.6,-.62,.32,.55),bftGatorStreak(-14.6,-.76,-12,-1.06,.26,.42),bftGatorStreak(-11.1,-1.16,-9.1,-1.36,.2,.3),
    bftGatorStreak(21,.5,23.6,.85,.28,.5),bftGatorStreak(24.4,.55,26.4,.4,.2,.34)]});
  if(!night){
    L.push({open:`<g class="bft-gator-tail" style="${phase(8)}">`,pivot:[9.6,1.2],layers:[
      /* the tail under the water swings with its crest */
      {parts:[part(inkSpline([[9.6,2.62],[11.5,2.25],[14,1.85],[17,1.45],[20,1.12],[23,.86],[24.3,.72],[22,.5],[18,.38],[14,.32],[9.6,.3]])+" Z","under",{noSil:true,op:.38})]},
      /* the tail's crest: the far row, then the near row, the two merging toward the tip */
      {parts:[...[10.5,12.3,14.1].map((x,i)=>bftGatorPlate(x,.1,1.05-i*.12,1.45,"scuteFar"))]},
      {parts:[...[9.6,11.4,13.2,15,16.7,18.3,19.8].map((x,i)=>bftGatorPlate(x,.25,1.15-i*.11,1.55-i*.06,"scute")),bftGatorLip(8.9,20.6,.15,.7)]}]});
    /* the back's double row, barely awash, and the nuchal plates behind the head */
    L.push({parts:[-1.4,.1,1.6,3.1,4.6,6.1].map((x,i)=>bftGatorPlate(x,.1,.42+(i%2)*.1,1.3,"scuteFar"))},
      {parts:[...k.nuchal,...[-1.6,-.1,1.4,2.9,4.4,5.9,7.4].map((x,i)=>bftGatorPlate(x,.25,.46+((i+1)%3)*.08,1.4,"scute")),bftGatorLip(-6.6,8.2,.15,.6)]});
  }else{
    L.push({parts:[...k.nuchal,bftGatorLip(-6.5,-2.1,.15,lk,lip,lop)]});
  }
  L.push({open:`<g class="bft-gator-head" style="${phase(37)}">`,pivot:[-6.6,1],layers:[
    {parts:k.farEye},
    {parts:[...k.nearEye,...k.snout,bftGatorLip(night?-20.6:-20.2,night?-15:-15.4,.15,lk,lip,lop),bftGatorLip(night?-12.8:-12.5,night?-6.9:-7.1,.15,lk,lip,lop)]}]});
  return L;
}

/* the inkRig options the scene should draw each pose with: the knobs are small, so their line,
   crescent and lit edge are lighter, or the lit edge swallows a two-pixel scute whole; the bask's
   lit edge is kept narrow so the back and its crest do not wear a cream rim at noon */
const BFT_GATOR_O={float:{line:.75,heavy:.3,shade:.8,lit:.35},bask:{line:.95,heavy:.45,shade:1,lit:.5}};
/**
 * One door for the scene: the rig for a pose, its joints phased off the wall clock by the scene's
 * own phase(seconds) (pass ()=>"" for a still drawing).
 *   "float"  the log, still          "glide"  the log under way, with its bow wave and V
 *   "night"  the snout, eyes and neck plates only    "bask"  hauled out, mouth shut
 *   "gape"   hauled out, mouth open
 */
const rigBftGator=(pose,phase=()=>"")=>pose==="bask"||pose==="gape"?rigBftGatorBask(pose==="gape",phase)
  :rigBftGatorFloat(pose==="night",pose==="glide",phase);

LOOK["gator-float"]={pal:INK.bftGator,box:[-22,-5,49,10],s:1,dist:.04,o:BFT_GATOR_O.float,
  states:{still:{},glide:{glide:true}},draw:st=>rigBftGator(st.glide?"glide":"float")};
/* the look harness has no keep list, so the night look carries its moonlit lips in rgb(), which the
   harness (like the scene's keep) leaves untoned: what the scene does with keep:["moonlip"] when
   the moon is up */
LOOK["gator-night"]={pal:{...INK.bftGator,moonlip:"rgb(169,192,228)"},box:[-22,-5,24,9],s:1,dist:.04,o:BFT_GATOR_O.float,
  draw:()=>rigBftGator("night")};
LOOK["gator-bask"]={pal:INK.bftGator,box:[-33,-12,68,16],s:1,dist:.04,o:BFT_GATOR_O.bask,
  states:{closed:{gape:false},gape:{gape:true}},draw:st=>rigBftGator(st.gape?"gape":"bask")};
