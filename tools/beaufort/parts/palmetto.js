/* ── Beaufort: the sabal palmetto ─────────────────────────────────────────────────────
   The cabbage palm, South Carolina's tree. What has to survive on a phone is a slender grey trunk,
   the booted top of it, and a round crown that is a ring of drooping hands: FAN fronds, each a
   solid palm splitting into fingers that hang, the way the flag draws them, over a few dead brown
   ones hanging close under the crown. Never the long combed feathers of a coconut palm, never the
   stiff swords of a yucca, and never a mop of spikes.

   y=0 is the ground, x=0 the foot of the trunk. The tree is four painted units and four moving
   groups: the crown's back half (the fronds behind the heart, behind the trunk too), the trunk, and
   the crown's front half, which holds the head (bft-palm-frond-a: the shade at the crown's heart and
   the fronds held up over it) and then the skirt (bft-palm-frond-b: the dead fronds in front, the
   fronds held out level or hanging, and the ones hanging toward us). Both crown halves carry
   bft-palm-crown and pivot at the trunk's top; head and skirt pivot at the crown's heart. A wind
   combs both the same way, so they turn in opposite senses: blowing toward +x the head turns
   clockwise (positive degrees) and the skirt the other way.

   Each crown group is one unit, so it has one outline round the outside, and the fans inside it are
   parted by a lighter line: each blade's own outline nudged down and laid in ink under it, the
   underside of the hand, which is where an ink line is heavier anyway.

   The wind is also drawn, not only animated: wind (-1..1, + blowing toward +x) combs each frond
   part of the way downwind, over the top or under the heart, closes its fan and streams its
   tips, while each stalk still leaves the heart on its own line, so the upwind side of the crown
   never opens. bftPalmWind(gust, downwind) is the value to hand it: stepped off the gust (as the
   witch's lean is), so the live paint landing on the cache never redraws the crown, and signed
   with the scene's own downwind, so the palms stream the way the windsock does. The joints carry
   the motion.

   Cost, measured in WebKit (the WKWebView runner, 390 at 3x, three palms, October 15 2026): each
   palm is 8 masks and 4 animated groups. The masks are what a phone pays for, every frame, moving
   or not, because WebKit repaints the whole scene SVG whenever anything in it moves: three still
   palms cost about what the grand oak and two herons do. Fewer units, smaller units, fewer fingers
   and drawing at ten units to the pixel changed nothing measurable; only the masks themselves do
   (litOp 0 in the palette takes about 40% off, at the price of the lit edge). */
INK.bftPalm={
  trunk:"#A39D8F",ring:"#857F73",boot:"#8E7E63",bootLt:"#A8977A",bootGap:"#4A3D2F",
  frond:"#6C8D45",frondLt:"#84A355",frondFar:"#4B683A",petiole:"#50693A",stalk:"#50693A",costa:"#9BB46A",
  frondDead:"#A08660",deadFar:"#837055",pleat:"#47612E",pleatDead:"#6B4F30",
  ink:"#2A1B33",shade:"#3A2350",lit:"#FFE6B0",shadeOp:.34,litOp:.5};

/* a path drawn here or by the kit (M L Q C A Z, absolute) moved by dx,dy: a blade's underside
   line is the blade itself nudged down and painted in ink under it */
function bftPalmShift(d,dx,dy){
  const tk=d.match(/[MLQCAZ]|-?\d*\.?\d+(?:e-?\d+)?/g)||[];let out="",c="M";
  for(let i=0;i<tk.length;){
    if(/[A-Z]/.test(tk[i])){c=tk[i++];out+=` ${c}`;if(c==="Z")continue}
    if(c==="A"){out+=` ${tk.slice(i,i+5).join(" ")} ${f1(+tk[i+5]+dx)} ${f1(+tk[i+6]+dy)}`;i+=7}
    else{out+=` ${f1(+tk[i]+dx)} ${f1(+tk[i+1]+dy)}`;i+=2}
  }
  return out.trim();
}

/* a stalk: a stroke that thins from the heart out, through three points [x,y,width], as one
   short polygon (a petiole is straight enough that the kit's brush would only spend path on it) */
function bftPalmStalk(pts){
  const L=[],R=[];
  pts.forEach((p,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],len=Math.hypot(b[0]-a[0],b[1]-a[1])||1,
    nx=-(b[1]-a[1])/len*p[2]/2,ny=(b[0]-a[0])/len*p[2]/2;L.push([p[0]+nx,p[1]+ny]);R.push([p[0]-nx,p[1]-ny])});
  return`M ${[...L,...R.reverse()].map(P2).join(" L ")} Z`;
}

/* one fan frond. (hx,hy) is the hastula, where the blade leaves its stalk; a its pointing
   direction in screen radians (0 is +x, -PI/2 straight up); L the blade's length; sp the spread
   of the fan as seen; droop how far gravity bends each segment down (a fraction of L at the
   tip); n the segments. The fan is costapalmate: its midrib (costa) runs on into the blade, so the
   middle segments leave it further out than the outer ones and the hand is longer than it is wide,
   and the halves fold down off it, so the outer fingers hang further than the middle ones. Returns
   the blade (one closed outline, pointed tips and notched splits), its fold wedges and its costa */
function bftPalmFan(hx,hy,a,L,sp,droop,n,r,{fold=.6,notch=.52,outer=.7,tip=.5,blow=0,costa=0}={}){
  const C=[],ca=Math.cos(a),sa=Math.sin(a);
  for(let i=-1;i<=n;i++){
    const u=n>1?i/(n-1):.5,off=u-.5,ao=Math.min(1,Math.abs(off)*2),phi=a+off*sp;
    const co=costa*L*(1-ao),ox=hx+ca*co,oy=hy+sa*co+droop*co*co/L*1.2;
    const len=(L*(1-.3*ao*ao)-co*.6)*(.92+r()*.16);
    const dr=droop*(1+fold*ao),td=tip*droop*(.7+r()*.6),bw=blow*(.8+r()*.4);
    C.push(t=>[ox+Math.cos(phi)*len*t+bw*len*t*t,oy+Math.sin(phi)*len*t+dr*len*t*t+td*len*Math.max(0,t-.62)**2*4]);
  }
  const c=(i,t)=>C[i+1](t);
  const E=(i,t,side,k0=.5)=>{const p=c(i,t),q=c(i+side,t),k=k0*Math.min(1,(1-t)/(1-notch));return[p[0]+(q[0]-p[0])*k,p[1]+(q[1]-p[1])*k]};
  /* the outline: each stretch of a segment's edge is one quadratic, through the edge's own middle,
     so the fingers curve the way they hang and still come to a point at the tip and a notch at
     the split, in two thirds of a cubic's path */
  const cub=(f,t0,t1)=>{const P0=f(t0),M=f((t0+t1)/2),P3=f(t1);
    return` Q ${P2([2*M[0]-(P0[0]+P3[0])/2,2*M[1]-(P0[1]+P3[1])/2])} ${P2(P3)}`};
  const o0=t=>E(0,t,-1,.5*outer),o1=t=>E(n-1,t,1,.5*outer);
  let blade=`M ${P2([hx,hy])}`+cub(o0,0,notch)+cub(o0,notch,1);
  for(let i=0;i<n-1;i++)blade+=cub(t=>E(i,t,1),1,notch)+cub(t=>E(i+1,t,-1),notch,1);
  blade+=cub(o1,1,notch)+cub(o1,notch,0)+" Z";
  /* each fold a sliver from near the hastula out to its split, the way the valley between two
     segments darkens */
  const folds=[];
  for(let i=0;i<n-1;i++){const a0=E(i,.14,1),b=E(i,notch*.97,1),p=c(i,.14),q=c(i+1,.14),w=.2/Math.max(.01,Math.hypot(q[0]-p[0],q[1]-p[1]));
    const ux=(q[0]-p[0])*w,uy=(q[1]-p[1])*w;folds.push(`M ${P2([a0[0]-ux,a0[1]-uy])} L ${P2([a0[0]+ux,a0[1]+uy])} L ${P2(b)} Z`)}
  /* the costa: a hairline that starts a little way into the blade and runs out along its middle */
  const m=(n-1)/2,mid=t=>{const p=c(Math.floor(m),t),q=c(Math.ceil(m),t);return[(p[0]+q[0])/2,(p[1]+q[1])/2]};
  const m0=mid(0),st=[hx+(m0[0]-hx)*.35+ca*L*.05,hy+(m0[1]-hy)*.35+sa*L*.05],m1=mid(.1),m2=mid(.36);
  const nx=-sa*.14,ny=ca*.14;
  const costaLine=`M ${P2([st[0]-nx,st[1]-ny])} L ${P2([m1[0]-nx*.8,m1[1]-ny*.8])} L ${P2(m2)} L ${P2([m1[0]+nx*.8,m1[1]+ny*.8])} L ${P2([st[0]+nx,st[1]+ny])} Z`;
  return{blade,folds,costa:costaLine};
}

/* the trunk: a slender grey column standing on a soft flared root boss, faintly ringed, with the
   jacket of old leaf boots over its top `boots` share of its height (a young tree is booted to
   the ground, a stout column wider at the foot). lean puts the top lean*h to the side, and the
   trunk leans from the foot and recovers toward the light over its top third, a banana. The
   jacket is the boots' own colour with dark pockets where the split bases cross, and the boots'
   ends stand out of its edge, long, broken short or gone */
function bftPalmTrunk(h,lean,boots,r,young){
  /* the lean's curve: steepest at the foot, its slope halved by seven tenths of the way up and
     just past upright at the top, so a leaning palm is a banana and never a tilted pole */
  const f=t=>1.625*t-.625*t**3,sweep=(r()-.5)*.05;
  const T=t=>[lean*h*f(t)+sweep*h*Math.sin(Math.PI*t),-h*t];
  const W=[3,2.8,2.62,2.5,2.42,2.36],ts=[0,.06,.25,.5,.75,1];
  const wT=t=>{for(let i=0;i<ts.length-1;i++)if(t<=ts[i+1])return W[i]+(W[i+1]-W[i])*(t-ts[i])/(ts[i+1]-ts[i]);return W[W.length-1]};
  const tb=young?0:Math.max(0,Math.min(1,1-boots)),[cx,cy]=T(1),P=[];
  if(!young){
    P.push(pTaper(ts.map(t=>[...T(t),wT(t)]),"trunk",{capStart:false,capEnd:false,per:3}));
    /* the root boss: the trunk swells into its ball of roots, soft, a little rough at the edge,
       and sunk a little into the bank */
    const bp=[[-2.25,.9],[-2.15,.25],[-1.9,-.3],[-1.68,-.85],[-1.52,-1.6],[-1.45,-2.6],[1.45,-2.6],[1.5,-1.55],[1.64,-.9],[1.88,-.35],[2.15,.2],[2.3,.9]];
    P.push(pBlob(bp.map(([x,y],i)=>[x*(1+(r()-.5)*.08)+(i%5&&i!==6?(r()-.5)*.26:0)+T(Math.max(0,-y)/h)[0],y]),"trunk"));
    /* growth rings, faint bands across the whole width of the smooth trunk */
    for(let y=2.8+r()*1.6;y<tb*h-3.5;y+=2.3+r()*2.6){
      const t=y/h,[x]=T(t),w=wT(t)/2-.2;
      P.push(part(`M ${P2([x-w,-y-.1])} Q ${P2([x,-y+.2])} ${P2([x+w,-y-.1])} L ${P2([x+w,-y+.12])} Q ${P2([x,-y+.5])} ${P2([x-w,-y+.12])} Z`,"ring",{noSil:true,op:.42}));
    }
  }
  const span=Math.max(.01,1-tb),full=young?4.8:4.4;
  /* it closes in at its top round the crown's heart, under the crown's shade, so a crown swung
     over in a blow never shows a sawn-off end or a point */
  const close=t=>{const k=Math.max(0,(t-(1-3/h))/(3/h));return 1-.62*k*k};
  const wAt=young?t=>(t<.1?6.4-1.4*t/.1:5-.6*(t-.1)/.9)*close(t)
    :t=>{const u=(t-tb)/span;return(wT(t)+(full-wT(t))*Math.min(1,u/.18)**.7+.3*u)*close(t)};
  if(young||boots>0){
    const tt=[];for(let k=0;k<=12;k++)tt.push(tb+span*k/12);
    tt.splice(tt.length-1,0,1-2/h,1-1/h);
    const Lft=tt.map(t=>{const[x,y]=T(t);return[x-wAt(t)/2,y]}),Rgt=tt.map(t=>{const[x,y]=T(t);return[x+wAt(t)/2,y]}).reverse();
    {const w=wAt(1);Lft.push([cx-w*.28,cy-.4],[cx,cy-.55],[cx+w*.28,cy-.4])}
    /* its foot: on a grown tree the split heels of the lowest boots hang down onto the smooth
       trunk, ragged; on a young one the column meets the ground */
    const foot=[];
    if(young){for(const u of[.5,.25,0,-.25,-.5])foot.push([u*wAt(0),.6+(r()-.5)*.3])}
    else{const[x0,y0]=T(tb),w0=wAt(tb);
      for(let k=0;k<=6;k++){const u=.5-k/6;foot.push([x0+u*w0*.96,y0+(k%2?.9+r()*1.6:r()*.35)])}}
    P.push(part(`M ${[...Lft,...Rgt,...foot].map(P2).join(" L ")} Z`,"boot"));
    /* a young tree's lowest boot heels spread out onto the ground */
    if(young)for(const s of[-1,1])for(const k of[0,1]){const x0=s*(2+k*.9),len=1.2+r()*1.2;
      P.push(pTaper([[x0,-1.6-k*1.6,1.5],[x0+s*1,-.6-k*1.4,1],[x0+s*(1+len),.4-k*.9,.15]],"boot",{per:2}))}
    /* the pockets: the split boot bases cross each other, and between them the dark diamond holes,
       in staggered rows that open out a little up the trunk */
    let row=0;
    for(let y=tb*h+(young?2.2:2.8);y<h-2.6;row++){
      const t=y/h,[x]=T(t),w=wAt(t)/2-.4,u=(t-tb)/span,pitch=(young?1.9:1.65)*(.85+r()*.3)*(1+.22*u),cw=(young?1.85:1.6)*(.92+r()*.16);
      const cells=row%2?[-1.5,-.5,.5,1.5]:[-1,0,1];
      for(const j of cells){
        const px=x+j*cw+(r()-.5)*.5,dw=(.26+r()*.3)*(1+.15*u),dh=(.5+r()*.5)*pitch*.5,skip=r()<.2;
        if(skip||Math.abs(px-x)+dw>w)continue;
        /* the pocket is a diamond, no two alike: its corners pushed about and its sides uneven */
        const sk=(r()-.5)*.5*dw;
        P.push(part(`M ${P2([px+sk,-y-dh])} L ${P2([px+dw*(.8+r()*.4),-y+(r()-.5)*.3*dh])} L ${P2([px-sk*.5,-y+dh*(.7+r()*.3)])} L ${P2([px-dw*(.8+r()*.4),-y+(r()-.5)*.3*dh])} Z`,"bootGap",{noSil:true,op:.8}));
      }
      y+=pitch;
    }
    /* the boots' ends at the edge: most stand up and out, a few stick straight out, some are
       broken short and some have fallen */
    for(let y=tb*h+(young?2.6:3.4);y<h-1.8;y+=2.1*(.7+r()*.6)){
      const t=y/h,[x]=T(t),w=wAt(t)/2;
      for(const s of[-1,1]){
        const k=r(),out=r()<.25,ang=out?.2+r()*.35:.85+r()*.4,len=k<.55?.5+r()*.5:1.3+r()*1.4;
        if(k<.3)continue;
        const bx=x+s*(w-1),tx=x+s*(w+Math.cos(ang)*len),ty=-y-Math.sin(ang)*len-.2;
        const tw=k<.55?.28:.05;
        P.push(part(`M ${P2([bx,-y+1.5])} L ${P2([x+s*(w+.15),-y+.45])} L ${P2([tx+s*tw,ty+tw])} L ${P2([tx-s*tw,ty-tw])} L ${P2([x+s*(w-.25),-y-.75])} Z`,"boot"));
      }
    }
  }
  return{parts:P,top:[cx,cy],T,wAt};
}

/* the crown: fronds set round the heart on a sphere (azimuth and elevation, seeded), each one
   seen as it would be from the bank. One pointing at us is short with its fan wide open and
   hangs, one pointing to the side is long and shows as a hand with its fingers hanging off the
   costa, never narrower than a hand (no frond is ever a spike). The lowest fronds droop, the top
   ones stand up and arch over. Behind and under the crown hang the dead ones. */
function bftPalmCrown(hx,hy,seed,{young=false,dense=.5,size=1,habit=.5,wind=0,dead=2}={}){
  const coreK=.72+.28*dense;
  /* the wind combs the crown: each frond turns part of the way toward downwind, over the top
     or under the heart whichever is nearer, its fan closes and its tips stream */
  const aw=Math.min(1,Math.abs(wind)),wk=.62*aw**1.15,down0=wind<0?Math.PI:0;
  const comb=(a,k=1)=>{let d=down0-a;d=Math.atan2(Math.sin(d),Math.cos(d));return a+d*wk*k};
  const r=mulberry(seed*7919+101),G=2.39996;
  const nF=young?8+Math.round(dense*2):9+Math.round(dense*5);
  const PL=(young?4.2:5)*size,BL=(young?11.2:11.4)*size;
  const F=[];
  for(let k=0;k<nF;k++){
    const u=(k+.5)/nF,el=1.38-(2+.3*habit)*u**(1-.3*habit)+(r()-.5)*.14,az=k*G+seed*1.7+(r()-.5)*.5;
    const px=Math.cos(el)*Math.cos(az),py=-Math.sin(el),pz=Math.cos(el)*Math.sin(az);
    /* the blade bends down off its stalk, more on a drooping tree */
    const by=py+.14+.46*habit,bh=Math.hypot(px,by),bl=bh/Math.hypot(px,by,pz);
    const ba=bh<.22?Math.PI/2+(px>=0?-.4:.4):Math.atan2(by,px),pl=Math.hypot(px,py),pa=pl<.25?ba:Math.atan2(py,px);
    /* how much of the fan's width faces us: all of it pointing at us, little of it pointing aside */
    const hz=Math.hypot(px,pz),sx=hz<.3?.75:Math.abs(pz)/hz;
    const sp=Math.max(1.2,Math.min(2.85,2*Math.atan(3.6*Math.max(.12,sx)/Math.max(.42,bl))));
    F.push({k,pa,ba,dz:pz,sx,sp,bl,plen:PL*Math.max(.3,pl)*(.85+r()*.3),L:BL*(.62+.38*bl)*(1-.28*Math.max(0,Math.sin(ba)))*(.9+r()*.2),
      droop:.12+.16*Math.cos(ba)**2+.12*habit+.05*r(),n:6+Math.round(sx*1.6+r()*.7),lt:r()<.4});
  }
  /* each frond drawn: its stalk leaving the heart on its own line before the wind bends it, then
     the blade with its underside line, and on a near one its folds and costa */
  const draw=(f,far)=>{
    const fr=mulberry(seed*131+f.k*17),half=f.plen*.5,pa2=comb(f.pa,.85);
    const p1=[hx+Math.cos(f.pa)*half,hy+Math.sin(f.pa)*half],hq=[p1[0]+Math.cos(pa2)*half,p1[1]+Math.sin(pa2)*half+f.plen*.1*f.droop];
    const fan=bftPalmFan(hq[0],hq[1],comb(f.ba),f.L*(1+.08*aw),f.sp*(1-.4*aw),f.droop*(1-.45*aw),far?5:f.n,fr,
      {notch:.5+fr()*.08,blow:.3*wind,costa:.24*f.bl});
    const stalk=part(bftPalmStalk([[hx+Math.cos(f.pa)*.3,hy+Math.sin(f.pa)*.3,.95],[...p1,.72],[...hq,.42]]),far?"frondFar":"petiole");
    const rim=part(bftPalmShift(fan.blade,.1,.34),"ink",{noSil:true,op:.72});
    const blade=part(fan.blade,far?"frondFar":f.lt?"frondLt":"frond");
    return{stalk,blade:far?[blade]:[rim,blade,part(fan.folds.join(" "),"pleat",{noSil:true}),part(fan.costa,"costa",{noSil:true,op:.75})]};
  };
  /* the dead fronds hang close under the crown and down against the jacket, folded, brown */
  const D=[];
  for(let j=0;j<dead;j++){
    const rr=mulberry(seed*313+j*29),side=(j+seed)%2?1:-1,front=dead===1||j%2===1;
    /* the oldest leaves, so they leave the trunk lower than the living crown, on the jacket under
       the crown's base, and hang from there */
    const ay=hy+3+j*.8+rr()*.8,a=comb(Math.PI/2+side*(.04+rr()*.18),.35);
    const hq=[hx+side*(1.6+rr()*1.2)*(1-.45*aw)+wind*1.6,ay+2.2+rr()*1.2];
    const fan=bftPalmFan(hq[0],hq[1],a,BL*(.9+rr()*.2),.85+rr()*.3,.05,5,rr,{fold:.3,notch:.56,outer:.85,tip:.2,blow:.14*wind,costa:.12});
    const role=front?"frondDead":"deadFar";
    D.push({front,parts:[part(bftPalmStalk([[hx+side*.7,ay-.6,1.2],[(hx+hq[0])/2+side*.15,(ay+hq[1])/2,1],[...hq,.75]]),role),
      part(bftPalmShift(fan.blade,.1,.34),"ink",{noSil:true,op:.6}),part(fan.blade,role),part(fan.folds.join(" "),"pleatDead",{noSil:true})]});
  }
  /* the crown's own shade: a dark ball of leaves at its heart, so the gaps between the fans read
     as the depth of the crown and never as sky. It stays over the heart in a wind */
  const core=part(scallop(hx+wind*BL*.2,hy-BL*.1*coreK,BL*.56*coreK*(1-.4*aw),BL*.44*coreK*(1-.15*aw),11+Math.round(4*aw),seed*53+3,{flat:.2,jitter:.3*(1-.5*aw),bulge:.62-.12*aw}),"frondFar");
  /* and the heart itself, laid over the skirt's stalks where they gather and under its blades. It
     takes no outline, so it hides the stalks' roots and their ink and draws no ring of its own */
  const cap=part(scallop(hx+wind*1.1,hy+.4,2.5*(1-.3*aw),2.1,7,seed*59+1,{flat:.25,jitter:.3}),"frondFar",{noSil:true});
  return{F,D,draw,core,cap};
}

/* three characters the seeds deal round, each jittered by its seed: a dense ball, drooping, with a
   full skirt of dead fronds; a sparse open crown; a held-up crown that is a clear ring of hands */
const BFT_PALM_HABITS=[{habit:.85,dense:.9,dead:4},{habit:.45,dense:.05,dead:2},{habit:.05,dense:.45,dead:1}];

/* the whole tree, as rig layers. seed picks the tree; h is the trunk's height to the crown's
   base; lean puts the top lean*h to the side (a fraction of h, so .2 is a good lean); boots is
   the share of the trunk still booted (any h under 36 is drawn young, booted to the ground).
   dense (0..1), size (~.9..1.1), habit (0 held up..1 drooping) and dead (0..4 dead fronds)
   default to the seed's own. wind (-1..1) combs the crown downwind. merge is accepted for older
   callers and does nothing now: every crown group is already one unit.
   pose (preview only) bakes transforms into the joints: {crown, a, b} as SVG transform strings.
   style puts an inline style on the joints, {crown, a, b}: the one way to be sure both crown halves
   of a palm carry the very same animation and delay */
function rigBftPalmetto(seed=1,{h=60,lean=0,boots=.4,young=false,dense,size,habit,dead,wind=0,merge=false,pose={},style={}}={}){
  /* a reading the run does not carry is no wind, never NaN in a path */
  const fin=(v,d)=>Number.isFinite(+v)?+v:d;h=Math.max(8,fin(h,60));lean=fin(lean,0);boots=Math.max(0,Math.min(1,fin(boots,.4)));wind=Math.max(-1,Math.min(1,fin(wind,0)));
  const r=mulberry(seed*104729+7),yg=young||h<36;
  const tr=bftPalmTrunk(h,lean,yg?1:boots,r,yg);
  const[cx,cy]=tr.top,hx=cx,hy=cy-(yg?1.8:1.2);
  const ch=BFT_PALM_HABITS[(((seed-1)%3)+3)%3],hr=mulberry(seed*7121+5),j=[hr(),hr(),hr(),hr()],cl=v=>Math.max(0,Math.min(1,v));
  const cr=bftPalmCrown(hx,hy,seed,{young:yg,wind,
    habit:habit??cl(ch.habit+(j[0]-.5)*.2),dense:dense??cl(ch.dense+(j[1]-.5)*.2),size:size??((yg?1:.94)+j[2]*.14),
    dead:dead??(yg?Math.min(1,ch.dead):Math.max(0,ch.dead-(j[3]<.3?1:0)))});
  const tf=k=>(pose[k]?` transform="${pose[k]}"`:"")+(style[k]?` style="${style[k]}"`:"");
  /* the fronds in front-to-back order inside each group: the back half's behind the heart (and
     the trunk), then in front the head, held up, and over it the skirt, held out and hanging */
  const byDz=(p,q)=>p.dz-q.dz,up=f=>Math.sin(f.ba)<-.3;
  const back=cr.F.filter(f=>f.dz<-.1).sort(byDz),front=cr.F.filter(f=>f.dz>=-.1);
  const unit=(list,far,pre=[],mid=[])=>{const d=list.map(f=>cr.draw(f,far));return[...pre,...d.map(x=>x.stalk),...mid,...d.flatMap(x=>x.blade)]};
  /* a group with nothing in its silhouette paints nothing, rather than an empty unit */
  const lay=parts=>parts.some(p=>!p.noSil)?[{parts}]:[];
  return[
    {open:`<g class="bft-palm-crown"${tf("crown")}>`,pivot:[cx,cy],layers:lay(unit(back,true,cr.D.filter(d=>!d.front).flatMap(d=>d.parts)))},
    {parts:tr.parts},
    {open:`<g class="bft-palm-crown"${tf("crown")}>`,pivot:[cx,cy],layers:[
      {open:`<g class="bft-palm-frond-a"${tf("a")}>`,pivot:[hx,hy],layers:lay(unit(front.filter(up).sort(byDz),false,[cr.core]))},
      {open:`<g class="bft-palm-frond-b"${tf("b")}>`,pivot:[hx,hy],layers:lay(unit(front.filter(f=>!up(f)).sort(byDz),false,cr.D.filter(d=>d.front).flatMap(d=>d.parts),[cr.cap]))}]}];
}

/* the wind the scene hands the crown: the gust in five-mile steps, as the witch's lean and the
   cheesecloth ghost's swing take it, so the live paint landing on the cache never redraws the
   crown; nothing under 15 mph, the whole comb from 40; signed with the scene's own downwind (+1
   blowing toward +x on screen), the sign the windsock, the bats and the witch already use, so the
   palms and the sock always stream the same way */
function bftPalmWind(gust,downwind=1){
  const g=Number.isFinite(+gust)?Math.floor(Math.max(0,+gust)/5)*5:0;
  return(downwind<0?-1:1)*Math.max(0,Math.min(1,(g-10)/30));
}

const BFT_PALM_O={};
const BFT_PALM_STATES={calm:{},gale:{wind:.9,pose:{crown:"rotate(5)",a:"rotate(3.5)",b:"rotate(-3)"}}};
LOOK["palmetto"]={pal:INK.bftPalm,box:[-26,-100,56,104],s:1,dist:.1,o:BFT_PALM_O,states:BFT_PALM_STATES,
  draw:st=>rigBftPalmetto(1,{h:70,wind:st.wind,pose:st.pose})};
LOOK["palmetto-b"]={pal:INK.bftPalm,box:[-24,-86,64,90],s:1,dist:.1,o:BFT_PALM_O,states:BFT_PALM_STATES,
  draw:st=>rigBftPalmetto(2,{h:55,lean:.22,boots:.3,wind:st.wind,pose:st.pose})};
LOOK["palmetto-young"]={pal:INK.bftPalm,box:[-26,-58,54,62],s:1,dist:.1,o:BFT_PALM_O,states:BFT_PALM_STATES,
  draw:st=>rigBftPalmetto(3,{h:28,boots:1,young:true,wind:st.wind,pose:st.pose})};

/* the cluster on the near-right bank, as the scene might stand it: three trees of their own
   heights, leans and characters, the tallest behind. Preview only, so Josh sees them together */
const BFT_PALM_CLUSTER=[[4,22,72,.04,.45],[5,-4,58,-.14,.3],[6,42,46,.12,.55]];
LOOK["palmetto-cluster"]={pal:INK.bftPalm,box:[-36,-100,116,104],s:1,dist:.1,o:BFT_PALM_O,states:BFT_PALM_STATES,
  draw:st=>BFT_PALM_CLUSTER.map(([seed,x,h,lean,boots])=>
    ({open:`<g transform="translate(${x} 0)">`,pivot:[0,0],layers:rigBftPalmetto(seed,{h,lean,boots,wind:st.wind,pose:st.pose})}))};

/* the three trees in the wind from each side, at the gust steps the scene will hand them. Preview only */
LOOK["palmetto-winds"]={pal:INK.bftPalm,box:[-30,-100,150,104],s:1,dist:.1,o:BFT_PALM_O,
  states:{"w-1":{wind:-1},"w-0.43":{wind:-.43},"w0.43":{wind:.43},"w1":{wind:1}},
  draw:st=>[[1,0,70,0,.4,false],[2,42,55,.22,.3,false],[3,96,28,0,1,true]].map(([seed,x,h,lean,boots,young])=>
    ({open:`<g transform="translate(${x} 0)">`,pivot:[0,0],layers:rigBftPalmetto(seed,{h,lean,boots,young,wind:st.wind})}))};
