/* ── Beaufort: the grand live oak and its Spanish moss ─────────────────────────────────
   The Lowcountry's oak, grander than Porters Neck's: a massive short trunk that splits low into
   huge serpentine limbs reaching far sideways, under a broad, low, broken dome of leaf masses with
   sky between them. One limb runs out toward the river, dips to rest its elbow on the bank and rises
   again over the water, where it thins and breaks into twigs; the long limb on the land side runs off
   the frame's left edge. No limb ends in a curl: each one tapers and breaks into smaller twigs that
   run up into the leaves or out to a fine tip, the way a live oak's do (Josh, October 2026).
   The moss is the point, and there is a great deal of it (Josh: "larger, grander Spanish moss, more
   prevalent", then "up the spanish moss. it's critical."): long, heavy curtains of crimped grey-green
   beards off every limb, all round the crown's underside and draped over its lowest leaves, in three
   depths, the longest hanging 30 to 36 units off the low limbs and the crown's outer ends, never
   reaching the grass.
   Units: the trunk stands at x=0 on y=0 (the bank). 185 wide (-89..+96) and 87 tall at s 1.
   The scene puts the trunk at W*.19 (61 of 320), so a 390 phone shows x -61..+96 of it: the elbow,
   its rise and its end over the water are all inside the frame, and the land side runs off the
   left edge, so the tree reads as bigger than the picture.

   Drawn in three units with the moss between and over them, back to front:
     BFT_OAK_MOSS_BACK  the far moss, paler and hazier, its tops lost behind the back leaves
     propBftOakBack()   the darker leaf masses at the back of the crown
     BFT_OAK_MOSS       the moss off the limbs and the crown's outer ends, its tops behind the limbs
     propBftOakWood()   the trunk, the limbs, their twigs, burls, branchlets and bark
     propBftOakCrown()  the front leaf masses
     BFT_OAK_MOSS_VEIL  the veil, draped over twigs inside the front leaves' lower third and hanging on
                        down over their undersides and in front of the climbers
   propBftOak() is the three part lists in that order, for a caller that draws the oak as one unit. */
INK.bftOak={wood:"#64493C",detail:"#3E2D27",leaf:"#71904E",leafBack:"#55733F",leafGrad:"url(#lcOakLeaf)",
  /* the moss: its body, a middle grey green; the dark lock at a beard's top, in the crown's shadow; the
     silvery light down its lit side; the far moss, paler because there is more air in front of it; and
     its hairlines, which are stroked in the moss's ink and never filled */
  moss:"#88917A",mossShade:"#5A644E",mossLit:"#E4E8D6",mossBack:"#AEB5A4",mossHair:"none",
  ink:"#2A1B33",shade:"#3A2350",lit:"#FFE6B0",shadeOp:.34,litOp:.55};

/* the limbs' centrelines, [x, y, width]. Moss anchors, branchlets and perches are read off them, so
   a limb can be reshaped without walking its moss off into the air */
const BFT_OAK_LIMBS=[
  /* 0: the river-side limb. It leaves the trunk low, runs out and down until its elbow rests on the
     bank short of the water, then rises again over the river, runs out level and thins to a fine tip
     that lifts a little, with its last twigs up into the leaves over it (BFT_OAK_TWIGS) */
  [[4,-8,9.8],[12,-9.6,8.6],[20,-8.6,7.5],[27,-6.2,6.6],[33,-4.2,6],[38.5,-3.3,5.7],[43.5,-3.9,5.4],[48,-6.4,5.1],
   [52,-10.6,4.8],[55.6,-15.2,4.4],[59.6,-19,4],[65,-21.6,3.5],[71,-22.6,3],[77,-22.2,2.5],[81.4,-20.8,2],
   [85.4,-20.4,1.4],[88.8,-21.2,.9],[91.4,-23,.5],[93,-25.6,.2]],
  /* 1: the left main, climbing out under the crown on the land side */
  [[-2,-13,10.6],[-10,-21,8.8],[-19,-27.6,7.3],[-29,-32.4,6.1],[-40,-35.6,5],[-51,-38.4,3.9],[-61,-41.2,2.8],[-70,-43.8,1.8],[-75,-45.2,1.2]],
  /* 2: off the left main, climbing into the crown */
  [[-17,-26,5.8],[-20,-35,4.7],[-24,-44,3.5],[-28.6,-52,2.3],[-31,-56.4,1.5]],
  /* 3: off the right climber, leaning back over the crotch into the crown */
  [[15,-22,4.9],[10,-31,3.9],[4.4,-41,2.9],[-.6,-49.6,1.9],[-3.4,-55,1.3]],
  /* 4: the right climber, up out of the trunk's shoulder */
  [[6,-12,8.8],[13,-20.4,7.1],[19.6,-30,5.5],[24.6,-40,3.9],[28.4,-49.6,2.5],[30.4,-55.4,1.5]],
  /* 5: off the right climber, reaching out under the crown over the river */
  [[19,-28,5.6],[31,-33.6,4.5],[44,-37.4,3.6],[57,-39.6,2.7],[69,-40.6,1.9],[78.6,-39.6,1.2]],
  /* 6: the long land-side limb, low and serpentine: up out of the trunk, down a little into a dip at
     its knuckle, then climbing steadily on out of the frame, where it levels off and thins to a fine
     tip, its last twig up into the leaves. It rises where the river limb dives, so the two never read
     as a pair of wings */
  [[-3,-10,11.6],[-11.6,-15.6,9.6],[-19.6,-18.6,8.2],[-27,-18.4,7.2],[-33.4,-17.2,6.5],[-39.4,-18,6],[-45.4,-21,5.5],
   [-52,-24.8,5],[-59,-28,4.4],[-66.6,-30.2,3.7],[-74,-31,3],[-80.6,-30,2.3],[-85,-28.4,1.5],[-87.6,-27.7,.8],[-89.2,-27.5,.3]]];
/* sample a limb the way taper() does, so a point read off it sits on what is drawn */
function bftOakSample(pts,per=8){
  const P=[pts[0],...pts,pts[pts.length-1]],S=[];
  for(let i=1;i<P.length-2;i++){
    const[a,b,c,e]=[P[i-1],P[i],P[i+1],P[i+2]];
    for(let j=0;j<per;j++){
      const t=j/per,t2=t*t,t3=t2*t;
      const cr=(p0,p1,p2,p3)=>.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);
      S.push([cr(a[0],b[0],c[0],e[0]),cr(a[1],b[1],c[1],e[1]),b[2]+(c[2]-b[2])*t]);
    }
  }
  S.push(pts[pts.length-1].slice());
  return S;
}
/* the limb's centre and width where it passes over x (the first pass, from the trunk out) */
function bftOakOn(k,x){
  const S=bftOakSample(BFT_OAK_LIMBS[k]);let best=S[0],bd=1e9;
  for(const p of S){const d=Math.abs(p[0]-x);if(d<bd){bd=d;best=p}}
  return best;
}
/* a line that follows a limb from x0 to x1, held off its centreline by a fraction of its half
   width (+ toward its underside): a bark furrow or a lit seam along it */
const bftOakAlong=(k,x0,x1,off,w0,w1,n=6)=>Array.from({length:n},(_,i)=>{const[cx,cy,cw]=bftOakOn(k,x0+(x1-x0)*i/(n-1));
  return[cx,cy+off*cw/2,w0+(w1-w0)*i/(n-1)]});

/* the leaf masses, [cx, cy, rx, ry, count, flat]: back ones (darker, behind everything) then the
   front ones. The dome is broad and low and its masses overlap into a few big lumpy clusters, with
   sky only where the limbs show through; the lower masses are rounder underneath */
const BFT_OAK_LEAF_BACK=[[-2,-66,34,9.4,20,.4],[-41,-55,20,8.4,14,.38],[43,-55,22,8.4,15,.38],[-64,-44,13,5.6,10,.32],[69,-45,15,6,11,.32]];
const BFT_OAK_LEAF=[
  /* 0-2: the top tier */
  [-8,-77,26,7.2,17,.42],[22,-73,20,6.6,14,.42],[-36,-69,18,6.4,13,.4],
  /* 3-6: the second tier */
  [-55,-59,15,6,11,.36],[48,-61,18,6.4,13,.36],[8,-64,14,5.6,10,.34],[-18,-61,12,5,9,.32],
  /* 7-11: the third tier */
  [-68,-48,12.5,5.6,10,.3],[70,-50,15,6,11,.3],[-33,-57,12,5,9,.28],[31,-52,13.5,5.6,10,.28],[-2,-52,12,5.2,9,.28],
  /* 12-15: the crown's lowest masses at its outer ends. The middle under the third tier is left
     open, so the climbers, the crotch and the moss off them show the way an old oak's do */
  [-76,-37.6,8.5,4.4,8,.26],[86,-38.4,9.5,4.8,9,.26],[-56,-40.4,9.5,4.4,8,.26],[56,-42.4,11,4.6,9,.26]];
const bftOakMass=([cx,cy,rx,ry,c,fl])=>scallop(cx,cy,rx,ry,c,(cx*7+cy*13)|0,{flat:fl,jitter:.34});

/* the branchlets: each climber forks as it enters the leaves, and a thin twig ties every mass that
   would otherwise float to the wood under it. [[x,y,w],...], all ending inside a mass */
const BFT_OAK_TWIGS=[
  /* limb 2 forks into masses 2, 6 and 9 */
  [[-28.6,-52,2],[-32.6,-59,1.5],[-36,-66,.9]],[[-27,-50,1.8],[-22,-55.6,1.3],[-18,-59,.8]],[[-24,-44,1.6],[-29,-50,1.2],[-33,-55,.8]],
  /* limb 3 forks into masses 0, 5 and 6 */
  [[-.6,-49.6,1.9],[-3.8,-61,1.4],[-7,-74,.9]],[[-.2,-50,1.6],[4.4,-57,1.2],[8,-62.6,.8]],[[1.6,-46,1.4],[-6,-52,1],[-12,-59,.7]],
  /* limb 4 forks into masses 1, 4 and 11 */
  [[28.4,-49.6,2.2],[27,-59.6,1.6],[25,-70.4,.9]],[[27,-46,1.8],[35,-52,1.3],[44,-58,.8]],[[23.6,-38,1.4],[15,-47,1],[6,-54,.7]],
  /* limb 5 into masses 8 and 13, limb 1 into masses 3, 7 and 12 */
  [[58,-39.6,1.8],[64,-44,1.3],[69,-48,.8]],[[72,-40.4,1.3],[79,-39,1],[84,-38,.7]],
  [[-44,-36.6,1.8],[-48.6,-46.6,1.3],[-51.6,-56.6,.8]],[[-62,-41.4,1.6],[-65,-44.6,1.1],[-67,-47,.7]],[[-70,-43.8,1.3],[-73.4,-41.4,.9],[-75,-39.6,.6]],
  /* a bare twig across the open middle, off the left climber up into mass 11 */
  [[-20.4,-34,1.5],[-15,-39.6,1.1],[-10.4,-45,.8],[-7,-50.6,.6]],
  /* where the river limb thins over the water it breaks into twigs that fan up into mass 13 over it, all
     of them out past the white bird's perch at 76: one bowing back toward the trunk as it climbs, a
     longer one leaning out over the river with a short fork of its own up the middle, and a little side
     twig dropping off the limb's bent tip */
  [[81.6,-20.9,1.35],[80.2,-25.6,1],[79.8,-30.6,.7],[80.8,-36,.42]],
  [[85,-20.5,1.05],[87.6,-23.8,.78],[91,-27.4,.55],[93,-31.4,.36],[93.6,-37.2,.22]],[[89,-25.4,.55],[88.2,-29.8,.4],[88.4,-35.8,.24]],
  [[88.6,-21.2,.55],[90.4,-19.8,.38],[92.2,-19.4,.16]],
  /* and the land limb the same way past the frame: one up into mass 12 */
  [[-79.6,-30.6,1.4],[-81.2,-33.6,1],[-82.4,-37.8,.6]]];

/* the back of the crown: the darker leaf masses */
const propBftOakBack=()=>BFT_OAK_LEAF_BACK.map(m=>part(bftOakMass(m),"leafBack"));
/* the wood: the trunk and its flare, the limbs from the back of the crown forward, the branchlets,
   the burls and the bark's furrows */
const propBftOakWood=()=>{
  const P=[];
  /* the trunk: a short column with real girth, flaring into the bank */
  P.push(pBlob([[-15.6,3],[-12.6,1.4],[-10.4,-.6],[-9.2,-3.6],[-8.6,-8],[-9.6,-13],[-5,-16],[0,-16.6],[5,-15.8],[10,-12.6],[9,-8],[9.2,-3.8],[10.6,-1.2],[13,.6],[16.4,3],[11,3.8],[5,3.2],[-1,3.8],[-8,3.4]],"wood"),
    /* a root knuckle standing out of the flare */
    pTaper([[-3.6,-3.4,3.2],[-5.4,0,3],[-6.6,3,2.4]],"wood"));
  /* the branchlets go in first, so the limbs they leave lie over their roots */
  for(const t of BFT_OAK_TWIGS)P.push(pTaper(t,"wood",{per:4}));
  for(const k of[3,2,5,4,1,0,6])P.push(pTaper(BFT_OAK_LIMBS[k],"wood"));
  /* the burls: a knuckle on the land-side limb where it turns down into its dip, a swelling on the
     left main where its climber leaves it, and the elbow's own heavy knee where it meets the bank */
  P.push(pBlob([[-25.6,-20.4],[-28.4,-23.8],[-32,-24],[-34.2,-21.2],[-30,-19.4]],"wood"),
    pBlob([[-20.6,-31.6],[-23.4,-34],[-26.8,-33.6],[-27.8,-30.4],[-23,-29.2]],"wood"),
    pBlob([[34,-1.2],[37.6,.1],[42,.1],[45.4,-1.4],[44,-4],[36,-4.4]],"wood"));
  /* the bark: deep furrows up the trunk and on out along each big limb */
  for(const f of[[[-6.2,2,.9],[-4,-5,1],[-3.6,-10,.8],[-6.6,-14.6,.35]],[[2.6,2.6,.9],[3.6,-4,1],[6,-9.6,.7],[9.6,-13,.3]],[[-.6,-3,.6],[0,-7.6,.5],[-.4,-11,.25]],
    bftOakAlong(6,-9,-50,.18,.75,.25,8),bftOakAlong(6,-24,-40,-.45,.45,.2,4),
    bftOakAlong(1,-9,-44,.15,.7,.25,7),bftOakAlong(1,-20,-31,-.5,.4,.2,3),
    bftOakAlong(0,9,40,.22,.7,.3,7),bftOakAlong(0,47,62,.1,.4,.18,4),
    bftOakAlong(4,8,16,.1,.5,.2,3),
    /* the burls' own rings */
    [[-27.6,-21.6,.35],[-30,-22.6,.4],[-32.4,-21.6,.25]],[[-22.4,-31.6,.3],[-24.6,-32.6,.35],[-26.4,-31.6,.2]],[[37.4,-1.6,.35],[40.4,-1.4,.4],[43,-2.4,.2]]])P.push(pTaper(f,"detail",{per:4}));
  return P;
};
/* the crown: the front leaf masses */
const propBftOakCrown=(grad=false)=>BFT_OAK_LEAF.map(m=>part(bftOakMass(m),grad?"leafGrad":"leaf"));
/* the oak as one list, for a caller that draws it as one unit */
const propBftOak=()=>[...propBftOakBack(),...propBftOakWood(),...propBftOakCrown()];

/* ── the Spanish moss ──────────────────────────────────────────────────────────────────
   Spanish moss is a tangle of crimped grey threads, and that is what says moss and not leaves, blades
   or icicles: a smooth pointed shape hung from a limb reads as a willow leaf. So every edge of a beard
   crinkles, a little wave a couple of units long, and the fibres drawn down inside it are crimped too.
   A beard is one clump caught at the twig (narrow where it drapes over one in front of the leaves,
   hidden where it hangs from under a limb), that parts lower, at ragged heights, into one to four tails
   of clearly unequal length. A tail wanders in a gentle S, pinches at a waist and swells again at a knot
   before it thins out, and it ends in a few fine crimped hairs that splay a little and run on past it,
   never in a single needle point. The tails swing apart as they go down, a long one by a few units.
   It has a form, and that is what holds it against a daylight sky: the top of a beard is in the crown's
   shadow, a darker lock (mossShade) that runs down each tail in a tongue, the body is a middle grey
   green, and down the side toward the light the lower tail comes up pale and silvery (mossLit).
   Beards hang side by side in festoons, a few of them caught in one ragged V, and the festoons hang
   with windows of sky between them, some long and some short, so the limbs and the sky show through:
   a veil, never a sheet, a fringe or a wall. */
const bftClamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const bftN=v=>String(f1(v)).replace(/^(-?)0\./,"$1.");
const bftPts=P=>P.map(([x,y],i)=>{const a=bftN(x),b=bftN(y);return(i&&a[0]!=="-"?" ":"")+a+(b[0]==="-"?"":" ")+b}).join("");
/* a cubic at t, and its first part up to t (de Casteljau), for numbers or points */
const bftLerp=(a,b,t)=>Array.isArray(a)?a.map((v,i)=>v+(b[i]-v)*t):a+(b-a)*t;
const bftHead=(P,t)=>{const a=bftLerp(P[0],P[1],t),b=bftLerp(P[1],P[2],t),c=bftLerp(P[2],P[3],t),ab=bftLerp(a,b,t),bc=bftLerp(b,c,t);return[P[0],a,ab,bftLerp(ab,bc,t)]};
/* a crimped run through the points P from the current point P[0]: one quadratic whose control is kicked
   sideways by amp, then smooth quadratics through the rest, each of which reflects the last control, so
   the run waves from side to side about the points, about amp/2 either way */
function bftCrimp(P,amp){
  if(P.length<2)return"";
  let c=P[0].map(f1);const p=P[1].map(f1);
  let d=`q${bftPts([[f1((c[0]+p[0])/2+amp-c[0]),f1((c[1]+p[1])/2-c[1])],[f1(p[0]-c[0]),f1(p[1]-c[1])]])}`;c=p;
  const R=[];for(let i=2;i<P.length;i++){const q=P[i].map(f1);R.push([f1(q[0]-c[0]),f1(q[1]-c[1])]);c=q}
  return R.length?d+`t${bftPts(R)}`:d;
}
/* a profile through [t, value] knots, eased between them */
const bftEase=(K,t)=>{for(let i=1;i<K.length;i++)if(t<=K[i][0]){const[a,va]=K[i-1],[b,vb]=K[i],u=(t-a)/(b-a||1),e=u*u*(3-2*u);return va+(vb-va)*e}return K[K.length-1][1]};
/* one beard hung at x, y, its longest tail len below, weight .5 (a thin beard) to 1.6 (a heavy clump),
   its tails pulled pull sideways (toward the middle of the festoon it is part of), with a narrow neck
   where it is draped over a twig in front of the leaves: its tails {u, L, C, K} left to right (u its place
   across the beard, -1 to 1, C its centre, a cubic whose y runs evenly from the twig, K its half width's
   profile), and the depth each pair of neighbours parts at */
function bftMossGeom(x,y,len,seed,weight=1,pull=0,neck=false){
  const r=mulberry(seed);
  const nt=len<7?1:len<13?2:len<22?(r()<.6?3:2):(r()<.5?3:4);
  const tw=(2.1+weight*1.9+r()*1)*(len<8?.8:1);                       /* how wide the clump is at the twig */
  const lean=(r()-.5)*(.6+len*.06)+pull,turn=r()<.5?-1:1,main=Math.floor(r()*nt);
  const S=[];
  for(let j=0;j<nt;j++){
    const u=nt>1?j/(nt-1)*2-1:0,f=j===main?1:.42+r()*.46,L=Math.max(3,len*f);
    const x0=x+(neck?u*.12:u*tw*.28+(r()-.5)*.3);
    const x3=x+lean*f+u*(neck?.3+tw*.2+L*.035:.3+weight*.3+L*.045)+(r()-.5)*.6;   /* the tails part and swing apart */
    const b=(j%2?-1:1)*turn*(.3+L*.05)*(.7+r()*.6);                     /* the S: one way above, the other below */
    const h0=(.74+weight*.55)*(.85+r()*.3)*(nt>2?.88:1)*(len<8?.8:1),kw=.6+r()*.15,k=.55+r()*.12;
    const K=neck?[[0,.06],[.26,h0*.72],[.48,h0*.8],[k,h0*.58],[k+.13,h0*.64],[1,0]]
      :[[0,h0],[.2,h0*1.12],[.46,h0*.78],[k,h0*kw*.85],[k+.13,h0*kw],[1,0]];
    S.push({u,L,K,C:[[x0,y],[x0+b,y+L/3],[x3-b*.6,y+L*2/3],[x3,y+L]],hair:(j===main?L>=9:L>=18)?(r()-.5)*h0*.7:null,tuft:j===main?r():null,lock:.3+r()*.22});
  }
  /* where each pair of neighbours parts: never above where their edges come apart, and a little more than
     a third of the way down the shorter, at its own height, so the bottom of the clump is ragged */
  const N=[];
  for(let j=0;j+1<nt;j++){const A=S[j],B=S[j+1],m=Math.min(A.L,B.L);let p=m*.94;
    for(let i=1;i<=24;i++){const dy=m*i/24,ea=bftAt(A,dy/A.L)[0]+bftWAt(A,dy/A.L),eb=bftAt(B,dy/B.L)[0]-bftWAt(B,dy/B.L);if(eb>=ea){p=dy;break}}
    N.push(Math.min(m*.94,Math.max(p,m*(.32+r()*.2))))}
  return{S,N,n:nt,tw};
}
/* a point on a tail's centre at t (0 the twig, 1 its end), and its half width there */
const bftAt=(s,t)=>bftHead(s.C,bftClamp(t,0,1))[3];
const bftWAt=(s,t)=>bftEase(s.K,bftClamp(t,0,1));
/* the crimp's wave is laid on one grid of height for the whole beard, BFT_CRIMP apart, and every edge
   bows the same way between the same two lines of it, so a tail's two edges wave together and the tail
   snakes, the way a crimped strand does, rather than pinching into a string of beads */
let BFT_CRIMP=2.4;
/* a tail's edge (side -1 left, +1 right, off its centre by off half widths) from t0 to t1 at the grid's
   lines, and the way its first stretch bows (+1 right, -1 left) */
const bftEdge=(s,side,t0,t1,off=1)=>{const y0=s.C[0][1],L=s.L,ya=y0+L*t0,yb=y0+L*t1,dn=yb>ya,P=[];
  const at=t=>{const[cx,cy]=bftAt(s,t);return[cx+side*(typeof off==="function"?off(t):off)*bftWAt(s,t),cy]};
  P.push(at(t0));
  const g0=dn?Math.floor((ya-y0)/BFT_CRIMP+1e-6)+1:Math.ceil((ya-y0)/BFT_CRIMP-1e-6)-1,g1=dn?Math.ceil((yb-y0)/BFT_CRIMP-1e-6)-1:Math.floor((yb-y0)/BFT_CRIMP+1e-6)+1;
  for(let g=g0;dn?g<=g1:g>=g1;g+=dn?1:-1){const t=g*BFT_CRIMP/L;if(Math.abs(t-t0)*L>.5&&Math.abs(t1-t)*L>.5)P.push(at(t))}
  P.push(at(t1));
  /* the bow of the first stretch: the opposite of the next one's, a whole stretch of the grid (the first
     may run over two, where a line fell too near the end to keep), or, alone, its own middle's */
  const par=yy=>Math.floor((yy-y0)/BFT_CRIMP)%2?-1:1;
  return{P,bow:P.length>2?-par((P[1][1]+P[2][1])/2):par((P[0][1]+P[1][1])/2)}};
/* one beard as a path d: its silhouette, down the outer edge of the first tail, up into each notch and
   down the next, and up the outer edge of the last; or with shade the dark lock at its top, a tongue
   down each long tail that runs out a third to a half of the way down, so the dark never ends on a line */
function bftMossCurtain(x,y,len,seed,weight=1,shade=false,pull=0,neck=false){
  const{S,N}=bftMossGeom(x,y,len,seed,weight,pull,neck),amp=.62;
  if(shade)return neck?"":S.filter(s=>s.L>=7).map(s=>{const e=s.lock,o=t=>.92*(1-Math.pow(t/e,1.6)),A=bftEdge(s,-1,0,e,o),B=bftEdge(s,1,e,0,o);
    return`M${bftPts([A.P[0].map(f1)])}`+bftCrimp(A.P,A.bow*amp)+bftCrimp(B.P,B.bow*amp)+"z"}).join("");
  const nt=S.length;let E=bftEdge(S[0],-1,0,1),d=`M${bftPts([E.P[0].map(f1)])}`+bftCrimp(E.P,E.bow*amp);
  for(let j=0;j<nt;j++){const s=S[j],up=j<nt-1?N[j]/s.L:0;
    E=bftEdge(s,1,1,up);d+=bftCrimp(E.P,E.bow*amp);
    if(j<nt-1){const B=S[j+1],Q=bftEdge(B,-1,N[j]/B.L,1),a=E.P[E.P.length-1].map(f1),bq=Q.P[0].map(f1),v=[f1((a[0]+bq[0])/2),f1(Math.min(a[1],bq[1])-.7)];
      d+=`l${bftPts([[f1(v[0]-a[0]),f1(v[1]-a[1])],[f1(bq[0]-v[0]),f1(bq[1]-v[1])]])}`+bftCrimp(Q.P,Q.bow*amp)}}
  return d+"z";
}
/* the light on a beard: down the lit side (side -1 left, +1 right) of the tails on that side of it, from
   the waist on, so the tails come up pale and silvery under the dark tops */
function bftMossSheen(x,y,len,seed,weight=1,side=1,pull=0,neck=false){
  const{S}=bftMossGeom(x,y,len,seed,weight,pull,neck);
  /* a band down inside the lit edge, crimped with it, from the waist to near the end */
  return S.filter(s=>(s.u*side>.3||S.length===1)&&s.L>=5).map(s=>{const t0=.42,A=bftEdge(s,side,t0,.95,.22),B=bftEdge(s,side,.95,t0,.68);
    const a=A.P[A.P.length-1].map(f1),b=B.P[0].map(f1);
    return`M${bftPts([A.P[0].map(f1)])}`+bftCrimp(A.P,A.bow*.62)+`l${bftPts([[f1(b[0]-a[0]),f1(b[1]-a[1])]])}`+bftCrimp(B.P,B.bow*.62)+"z"}).join("");
}
/* a tail's tuft: two or three fine hairs off its end, splayed a little and of uneven length, running on
   past it, each [start, middle, tip] */
const bftTuft=(s,seed)=>{if(s.tuft===null)return[];
  const r=mulberry(seed*7+Math.round(s.u*3)+11),[ex,ey]=bftAt(s,1),nh=s.L<7?2:2+(r()<.5),dir=Math.sign(ex-s.C[0][0])||1,T=[];
  for(let i=0;i<nh;i++){const t=nh>1?i/(nh-1)*2-1:0,st=bftAt(s,.84+r()*.06),ln=1+r()*1+s.L*.025*(1-.35*Math.abs(t));
    const tip=[ex+t*(.3+s.L*.01)+dir*.12+(r()-.5)*.2,ey+ln];T.push([st,[(st[0]+tip[0])/2-t*.25+(r()-.5)*.3,(st[1]+tip[1])/2],tip])}
  return T};
/* the fibre, stroked: a crimped hairline down inside each long tail, off its centre, from the clump past
   its knot, and the tuft at the end of the longest */
function bftMossHair(x,y,len,seed,weight=1,pull=0,neck=false){
  const{S}=bftMossGeom(x,y,len,seed,weight,pull,neck);let d="";
  for(const s of S){
    if(s.hair!==null){const P=[],n=Math.max(2,Math.round(s.L*.8/2.4));
      for(let i=0;i<=n;i++){const t=.04+.76*i/n,[cx,cy]=bftAt(s,t);P.push([cx+s.hair*(1-t*.7),cy])}
      d+=`M${bftPts([P[0].map(f1)])}`+bftCrimp(P,1.1)}
    for(const[a,m,b]of bftTuft(s,seed)){const A=a.map(f1);d+=`M${bftPts([A])}q${bftPts([[f1(m[0]-A[0]),f1(m[1]-A[1])],[f1(b[0]-A[0]),f1(b[1]-A[1])]])}`}
  }
  return d;
}
/* a beard's drawing as points: both edges of every tail every sixteenth of its length (and their crimp),
   and its hairs */
function bftMossPts(x,y,len,seed,w,pull,neck){
  const{S}=bftMossGeom(x,y,len,seed,w,pull,neck),P=[];
  for(const s of S){for(let i=0;i<=16;i++){const[cx,cy]=bftAt(s,i/16),hw=bftWAt(s,i/16)+.4;P.push([cx-hw,cy],[cx+hw,cy])}
    for(const h of bftTuft(s,seed))P.push(h[1],h[2])}
  return P;
}

/* where a leaf mass's underside is at dx (a fraction of its half width), tucked in by tuck; back for
   the dark masses at the back of the crown */
const bftOakUnder=(m,dx,tuck=1.6,back=false)=>{const[cx,cy,rx,ry,c,fl]=(back?BFT_OAK_LEAF_BACK:BFT_OAK_LEAF)[m];return[f1(cx+dx*rx),f1(cy+ry*(1-fl)*Math.sqrt(Math.max(0,1-dx*dx))-tuck)]};
/* a beard always ends clear of the grass, tuft and all: 7 above the trunk's foot on the land side,
   where the scene's bank rises 2 or 3 above it, and 4.5 over the mud and the river (out past x 44).
   This is the first guess, which the tuft runs a little past; bftOakSettle holds the drawing to it */
const BFT_OAK_GROUND=x=>x<44?-7:-4.5;
const bftOakFit=(y,len,x=0)=>Math.min(len,f1((BFT_OAK_GROUND(x)-y-1.6)/1.06));
/* the white birds' perches in the scene, [limb, x] (lowcountryScene's PERCH): the top of the limb there
   and the air a bird stands in over it are kept clear of any moss in front of the wood, so no perch is
   buried. Moss behind the wood may hang below and beside a bird, never over the limb it stands on */
const BFT_OAK_PERCH_ON=[[0,58],[0,67],[0,76],[5,36],[5,47],[5,58],[5,69],[1,-28],[1,-41],[1,-54],[1,-66]];
const BFT_OAK_PERCH=BFT_OAK_PERCH_ON.map(([k,x])=>{const[cx,cy,cw]=bftOakOn(k,x);return[f1(cx),f1(cy-cw/2+.2)]});
/* a beard in front of the wood must not hang across a perch, or the air a bird stands in over it; and the
   birds on the river limb stand under the reacher, so any moss behind the wood that hangs from over them
   ends above their heads, so they stand against sky, the window under the reacher's short fringe */
const BFT_OAK_WINDOW=BFT_OAK_PERCH.slice(0,3);
const bftOakBlocked=(P,front)=>P.some(([x,y])=>y>BFT_OAK_GROUND(x)
  ||(front?BFT_OAK_PERCH.some(([px,py])=>Math.abs(x-px)<3.4&&y>py-9.5&&y<py+1.5)
    :BFT_OAK_WINDOW.some(([px,py])=>Math.abs(x-px)<4.2&&y>py-8.8&&y<py-.2)));
/* every beard, drawn with the seed it will be drawn with, is held clear of all of that: first by swinging
   its tails a little one way or the other (a veil's only a very little, or it hooks over the leaves like
   a question mark), then by shortening it, and it is dropped when too little is left. A dropped beard moves the seeds of those after it, so they are checked as they come, with their
   new ones */
function bftOakSettle(list,layer){
  const out=[],front=layer==="veil";
  for(const m of list){
    let[x,y,len,w,,,pull,least=3.2,nk=front?1:0]=m,ok=false;
    for(;!ok&&len>=least;){const seed=bftOakMossSeed(out.length,layer);
      for(const dp of front?[0,1,-1]:[0,1.5,-1.5,3,-3,4.5,-4.5])if(!bftOakBlocked(bftMossPts(x,y,len,seed,w,pull+dp,!!nk),front)){pull=f1(pull+dp);ok=true;break}
      if(!ok)len=f1(len*.88)}
    if(ok)out.push([x,y,len,w,m[4],m[5],pull,least,nk]);
  }
  return out;
}
/* each beard's seed, so the scene draws the very moss the look shows: i is its index in its list.
   layer: false or "front" (BFT_OAK_MOSS), true or "back" (BFT_OAK_MOSS_BACK), "veil" or "mid"
   (BFT_OAK_MOSS_VEIL) */
const bftOakMossSeed=(i,layer=false)=>layer===true||layer==="back"?5200+i*41:layer==="mid"||layer==="veil"?6300+i*43:4100+i*37;
/* the moss, written as runs along which it hangs in festoons (bftOakHang): [from, a, b, len, weight].
   from is a limb (0..6, a and b are x on it, the beards hung from just inside its underside), or a leaf
   mass ("m12", a and b its dx, hung from inside its underside; "b3" for a mass at the back). len is the
   run's longest beard, the festoon over the run's middle: the others are long, middling or short, so the
   bottom is ragged. The gaps between runs are windows, where the limb and the sky show. A run's beards
   are then held clear of the grass and the water and of the white birds, drawing and all (bftOakSettle),
   so the low limbs' longest come to 30 to 40 and stop well over the ground */
const BFT_OAK_RUNS={
  /* off the limbs and the crown's outer ends, behind the wood */
  front:[
    /* the land-side limb, low: a short fringe by the trunk, longer as it climbs away */
    [6,-12,-24,6,1],[6,-28,-41,12,1.15],[6,-44,-57,18,1.25],[6,-60,-72,24,1.3],[6,-75,-88,26,1.15],
    /* the left main, the longest moss on the land side, hanging behind the land limb and on below it */
    [1,-12,-23,20,1.2],[1,-26,-37,28,1.35],[1,-41,-51,34,1.4],[1,-54,-64,36,1.45],[1,-67,-76,38,1.3],
    /* the climbers, into the open middle */
    [2,-18,-23,20,1.05],[2,-24,-31,26,1.1],[3,14,9,18,1.05],[3,8,1,24,1.05],[4,10,18,15,1.1],[4,19,26,22,1.1],
    /* the reacher over the river: long over the bank and the water's edge, a short fringe over the
       river limb's birds */
    [5,20,30,26,1.3],[5,32,42,34,1.4],[5,44,53,36,1.4],[5,55,80,8,1],
    /* the river limb, its outer run and its bent end */
    [0,47,54,7,1],[0,57,65,15,1.15],[0,68,79,17,1.2],[0,81,93,22,1.1],
    /* the crown's outer ends, where long beards hang into open sky so the outline drips */
    ["m12",-.85,.4,30,1.2],["m7",-.65,.25,36,1.25],["m14",-.45,.85,32,1.3],
    ["m15",-.85,-.1,36,1.3],["m8",.68,.95,40,1.3],["m13",-.35,.95,38,1.3]],
  /* the veil: draped over twigs inside the lower third of the front leaves and hanging on down over their
     undersides and in front of the climbers, drawn over the crown, so the moss dissolves the crown's
     scalloped bottom the way it does on Beaufort's oaks */
  veil:[["m11",-.9,.9,28,1.15],["m10",-.95,-.1,26,1.1],["m9",-.9,.9,24,1.1],["m6",-.85,.85,22,1.05],
    ["m5",-.8,.8,20,1.05],["m4",-.85,.85,18,1.05],["m3",-.9,.9,22,1.1],["m14",-.9,.9,16,1],["m8",-.95,.95,28,1.15],
    ["m13",-.9,.9,30,1.2],["m15",-.9,.9,18,1],["m7",-.9,.9,30,1.15],["m12",-.9,.9,28,1.15]],
  /* the far moss, hung from the back of the crown, behind the back leaves, so its tops are lost in them */
  back:[["b3",-.85,.85,32,.95],["b1",-.88,.88,34,1],["b0",-.78,.78,32,.95],["b2",-.88,.88,36,1],["b4",-.85,.88,34,.95],
    ["m2",-.65,.65,28,.9],["m0",-.55,.55,30,.9],["m1",-.65,.65,30,.9],["m3",-.65,.65,26,.9],["m4",-.65,.65,26,.9],
    ["m5",-.6,.6,26,.9],["m6",-.6,.6,26,.9]]};
/* the runs hung as festoons: a festoon is a few beards side by side, the middle one longest and all
   their tails drawn in toward its middle, so it hangs as one ragged V. Some festoons are long, some
   middling, some a short fringe, and some gaps between them are wide enough to be windows. Each beard
   is [x, y, len, weight, from, group, pull, least, neck]: least the shortest it may be cut to (a veil's
   must clear the leaves it drapes over by 8), neck 1 when it gathers to a point at its twig, as a veil's
   does and as one does on a twig, or at a mass's end, too thin to hide a clump's top */
function bftOakHang(runs,layer){
  const out=[],veil=layer==="veil";
  runs.forEach(([from,a,b,len,w],ri)=>{
    const r=mulberry(9100+ri*131+(veil?7:layer==="back"?13:0));
    const limb=typeof from==="number",back=!limb&&from[0]==="b",m=limb?-1:+from.slice(1),M=limb?null:(back?BFT_OAK_LEAF_BACK:BFT_OAK_LEAF)[m];
    /* where a beard is hung: a limb's far enough inside its underside that a sway's rise and fall never
       shows its top, and never so far that the top shows over a thin limb's back; a veil's from a twig up
       inside the lower third of its mass, at a ragged height (and where that mass's underside is, which it
       must hang well clear of); the rest from inside a mass's underside, out of sight */
    const top=v=>{if(limb){const[cx,cy,cw]=bftOakOn(from,v);return[f1(cx),f1(cy+cw/2-Math.min(1.7,cw-.3))]}
      if(veil){const[ux,uy]=bftOakUnder(m,v,0);return[ux,f1(uy-.5-r()*M[3]*.4*Math.sqrt(Math.max(0,1-v*v))),uy]}
      return bftOakUnder(m,v,layer==="back"?2.4+r()*2.4:2.4+Math.abs(v)*2.2,back)};
    const span=limb?Math.abs(b-a):Math.abs(b-a)*M[2];
    let hero=true;
    for(let s=r()*1.2;s<span-.8;){
      const fw=Math.min(span-s,3.4+w*2.4+r()*3.4),mid=hero&&s+fw>span*.45,q=r();
      const fl=len*(mid?1:q<.15?(veil?.55:.16)+r()*.14:q<.38?.58+r()*.22:.86+r()*.14),fwt=w*(.8+r()*.4);
      if(mid)hero=false;
      const nb=Math.max(1,Math.round(fw/(2.2+r()*.5))),jm=Math.floor((nb-1)/2+r()*.99);
      for(let j=0;j<nb;j++){
        const v=nb>1?j/(nb-1)*2-1:0,at=a+(b-a)*(s+fw*(j+.5)/nb)/span,[x,y,under]=top(at);
        let k=j===jm?1:(1-.45*v*v)*(.7+r()*.25);if(r()<.12)k=Math.min(1,k+.3);
        const wt=fwt*(.85+r()*.3)*(1-.18*Math.abs(v)),want=fl*k;
        /* one that would reach the grass or the water is cut short by its own amount, so the tails held
           off the ground never end on one line */
        let L=bftOakFit(y,want,x);if(L<want)L=f1(L*(.74+r()*.26));
        /* the least it may be: a veil's must hang at least 8 below the leaves it is draped over */
        const least=veil?f1(under-y+8):3.2;
        /* a twig too thin, or a mass's end too narrow, to hide a clump's top: the beard gathers to a neck */
        const thin=limb?bftOakOn(from,x)[2]<2.6:Math.abs(at)>.76;
        if(L>=least)out.push([x,y,f1(L),f1(wt),limb?from:7,"",f1(-v*fw*.26*Math.min(1,L/14)),least,veil||thin?1:0]);
      }
      /* a gap: mostly a short one, where the festoons' clumps nearly meet, now and then a window */
      s+=fw+(r()<.28?4+r()*3.5:.8+r()*1.8);
    }
  });
  return out;
}
/* the sway groups. The scene swings a group about the top middle of its box, so a beard out at the side
   of a group rises and falls at its top by its distance from the middle times the swing, and one hung
   lower than the group's top slides sideways by its depth. The rise and fall is what shows: a wide group
   see-saws, and the tops at its ends drop out from under their limbs. So a group is a narrow column of
   the tree, its beards' twigs within w of each other across, as deep as it likes, because sliding along
   a limb hides behind it. Written as a sixth entry "<layer>.<column>" */
const bftOakColumns=(list,tag,w)=>{const idx=list.map((m,i)=>i).sort((a,b)=>list[a][0]-list[b][0]),out=list.map(m=>[...m]);
  let col=-1,x0=-1e9;
  for(const i of idx){if(list[i][0]-x0>w){col++;x0=list[i][0]}out[i][5]=`${tag}.${col}`}
  return out};
const BFT_OAK_MOSS=bftOakColumns(bftOakSettle(bftOakHang(BFT_OAK_RUNS.front,"front"),"front"),"front",24);
const BFT_OAK_MOSS_VEIL=bftOakColumns(bftOakSettle(bftOakHang(BFT_OAK_RUNS.veil,"veil"),"veil"),"veil",34);
const BFT_OAK_MOSS_BACK=bftOakColumns(bftOakSettle(bftOakHang(BFT_OAK_RUNS.back,"back"),"back"),"back",36);
/* the moss in front of the wood used to hang under the front leaves; it is the veil now, over them */
const BFT_OAK_MOSS_MID=BFT_OAK_MOSS_VEIL;
const bftOakMossList=layer=>layer===true||layer==="back"?BFT_OAK_MOSS_BACK:layer==="mid"||layer==="veil"?BFT_OAK_MOSS_VEIL:BFT_OAK_MOSS;
/* the moss of one layer gathered into its sway groups: [{g, pivot:[x,y] (the group's top), d, shade,
   hair, sheen}]: one path of the beards' silhouettes, one of the dark locks, one of the hairlines and one
   of the light per group (the far moss is silhouettes alone, its crimp a little longer, hazier), so the
   scene animates a handful of groups. Worked out once for each layer and side */
const BFT_OAK_MOSS_MEMO=new Map();
function bftOakMossGroups(layer="front",side=1){
  const lay=layer===true?"back":layer==="mid"?"veil":layer||"front",key=`${lay}${side}`;if(BFT_OAK_MOSS_MEMO.has(key))return BFT_OAK_MOSS_MEMO.get(key);
  const list=bftOakMossList(lay),G=new Map(),back=lay==="back";
  BFT_CRIMP=back?3:2.4;
  list.forEach(([x,y,len,w,,g,pull=0,,nk],i)=>{const seed=bftOakMossSeed(i,lay),neck=!!nk||lay==="veil";
    if(!G.has(g))G.set(g,{g,xs:[],ys:[],d:[],shade:[],hair:[],sheen:[]});const e=G.get(g);
    e.xs.push(x);e.ys.push(y);
    e.d.push(bftMossCurtain(x,y,len,seed,w,false,pull,neck));
    if(!back){e.shade.push(bftMossCurtain(x,y,len,seed,w,true,pull,neck));e.hair.push(bftMossHair(x,y,len,seed,w,pull,neck));
      e.sheen.push(bftMossSheen(x,y,len,seed,w,side,pull,neck))}});
  BFT_CRIMP=2.4;
  const out=[...G.values()].sort((a,b)=>a.g<b.g?-1:1).map(e=>({g:e.g,pivot:[f1(e.xs.reduce((a,b)=>a+b,0)/e.xs.length),Math.min(...e.ys)],
    d:e.d.join(""),shade:e.shade.join(""),hair:e.hair.join(""),sheen:e.sheen.join("")}));
  BFT_OAK_MOSS_MEMO.set(key,out);return out;
}
/* the scene's moss, ready to place inside the oak's own transform: one layer as markup, a
   <g class="moss"> per sway group. side is the sign of the light's x (lightAt), attrs(g, pivot)
   the scene's own attributes for a group (its --sway, --md and delay) */
function bftOakMossSvg(layer,{fill,lit,shade,line="#4F515F",lineOp,lineW=.28,hairOp=.42,hairW=.15,sheenOp=.45,shadeOp=.9,side=1,attrs=()=>""}={}){
  const back=layer==="back",lo=lineOp??(back?.24:.5);
  return bftOakMossGroups(layer,side).map(e=>`<g class="moss" data-moss="${e.g}"${attrs(e.g,e.pivot)} stroke="${line}" stroke-opacity="${lo}" stroke-width="${lineW}" stroke-linejoin="round">`
    +`<path d="${e.d}" fill="${fill}"/>`
    +(e.shade&&shade?`<path d="${e.shade}" fill="${shade}" stroke="none" opacity="${shadeOp}"/>`:"")
    +(e.hair?`<path d="${e.hair}" fill="none" stroke-width="${hairW}" stroke-opacity="${hairOp}"/>`:"")
    +(e.sheen&&lit?`<path d="${e.sheen}" fill="${lit}" stroke="none" opacity="${sheenOp}"/>`:"")+`</g>`).join("");
}
/* the oak and all its moss, measured with getBBox: x -89.3..95.8, y -87.2..4.1 (the flare runs 4 under
   the bank); the moss alone x -86..95, y -78 (its far tops, behind the crown) to -6.8 */
const BFT_OAK_BOX=[-90,-89,188,94];

/* the look: the oak with all its moss in place, drawn the way the scene draws it. Each sway group is one
   class="moss" joint at its top, outlined in the moss's thin ink (the scene hands its own, inkAir, which
   is light, so the outline is at half strength; #4F515F is that ink at noon, so the look shows what the
   phone does); inside it the silhouettes, the dark locks over them, the hairlines (stroked in the group's
   ink, never filled: mossHair is "none") and the light */
const bftOakMossLayers=(layer,side=1,ink="#4F515F")=>bftOakMossGroups(layer,side).map(e=>{const back=layer==="back";
  return{open:`<g class="moss" stroke="${ink}" stroke-opacity="${back?.24:.5}" stroke-width=".28" stroke-linejoin="round">`,pivot:e.pivot,layers:[
    {parts:[part(e.d,back?"mossBack":"moss",{noSil:true})]},
    ...(e.shade?[{open:`<g class="bft-oak-lock" stroke="none">`,pivot:e.pivot,layers:[{parts:[part(e.shade,"mossShade",{noSil:true,op:.9})]}]}]:[]),
    ...(e.hair?[{open:`<g class="bft-oak-hair" stroke-width=".15" stroke-opacity=".42">`,pivot:e.pivot,layers:[{parts:[part(e.hair,"mossHair",{noSil:true})]}]}]:[]),
    ...(e.sheen?[{open:`<g class="bft-oak-sheen" stroke="none">`,pivot:e.pivot,layers:[{parts:[part(e.sheen,"mossLit",{noSil:true,op:.45})]}]}]:[])]}});
/* kept for a caller that hangs one beard on its own */
const bftOakMossLayer=(x,y,len,seed,w,back,side=1)=>({open:`<g class="moss" stroke="#4F515F" stroke-opacity="${back?.24:.5}" stroke-width=".28" stroke-linejoin="round">`,pivot:[x,y],layers:[
  {parts:[part(bftMossCurtain(x,y,len,seed,w),back?"mossBack":"moss",{noSil:true})]},
  ...(back?[]:[{open:`<g class="bft-oak-lock" stroke="none">`,pivot:[x,y],layers:[{parts:[part(bftMossCurtain(x,y,len,seed,w,true),"mossShade",{noSil:true,op:.9})]}]},
    {open:`<g class="bft-oak-hair" stroke-width=".15" stroke-opacity=".42">`,pivot:[x,y],layers:[{parts:[part(bftMossHair(x,y,len,seed,w)||"M0 0","mossHair",{noSil:true})]}]},
    {open:`<g class="bft-oak-sheen" stroke="none">`,pivot:[x,y],layers:[{parts:[part(bftMossSheen(x,y,len,seed,w,side),"mossLit",{noSil:true,op:.45})]}]}])]});
const bftOakDraw=(st)=>{
  /* st.side: the sign of the light's x (lightAt), for the light on the moss; st.grad: the crown takes the
     scene's own #lcOakLeaf gradient; st.mossInk: the moss's thin ink (the scene's inkAir; without it, that
     ink at noon). Back to front:
     the far moss, the back leaves over its tops, the moss off the limbs and the crown's ends, the wood,
     the front leaves, and the veil over them */
  const side=st.side??1,ink=st.mossInk||"#4F515F";
  const L=[...bftOakMossLayers("back",side,ink),{parts:propBftOakBack()},...bftOakMossLayers("front",side,ink),{parts:propBftOakWood()},
    {parts:propBftOakCrown(!!st.grad)},...bftOakMossLayers("veil",side,ink),
    /* a check, not part of the oak: a great egret at the scene's size (.22) on every perch the scene
       may put a white bird on, in its day colours */
    ...(st.perch?[{open:`<g class="bft-oak-perchcheck">${BFT_OAK_PERCH.map(([x,y],i)=>inkAt(x,y,.22,i%2?-1:1,inkRig(rigEgret(()=>"",i%3===1,false),INK.egret,{s:.22*1.22,line:.42,heavy:.15,shade:.55,lit:.35}))).join("")}`,pivot:[0,0],layers:[]}]:[])];
  /* in the frame: what a 390 phone shows of it, with the scene's bank roughly under it */
  return st.frame?[{open:`<g clip-path="url(#bftOakFrame)">`,pivot:[0,0],layers:L}]:L;
};
LOOK["grand-oak"]={pal:INK.bftOak,box:BFT_OAK_BOX,s:1,dist:.14,o:{},
  states:{default:{},perches:{perch:true},frame:{frame:true,perch:true}},
  draw:bftOakDraw,
  /* the frame state: the scene puts the trunk at W*.19 on the bank (oakY = bankY-.4), so on a 390
     phone (W 320) the frame's left edge is x -60.8 here, and the bank's grass runs to x 44.8 before it
     drops to the mud and the river (lowcountryScene's landL, in these units) */
  extra:(st,lt)=>st.frame?`<defs><clipPath id="bftOakFrame"><rect x="-60.8" y="-120" width="320" height="240"/></clipPath></defs>`
    +`<path d="M -60.8 -1.1 Q -28.8 -3.2 3.2 -.8 Q 32.8 .6 44.8 1.8 C 48.8 5.4 42.8 19.4 36.8 25.4 L -60.8 25.4 Z" fill="#6E7F45"/>`
    +`<rect x="-60.8" y="-120" width=".6" height="146" fill="#000" opacity=".5"/>`:""};
