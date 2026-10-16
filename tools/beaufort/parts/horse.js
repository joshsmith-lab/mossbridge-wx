/* ── Beaufort: the Marsh Tacky ─────────────────────────────────────────────────────
   South Carolina's heritage horse, a dun: small and sturdy, a short back, a sloped croup and a
   low-set tail, a tan coat with dark points (the legs from the knee and the hock down, the mane,
   the tail, the ear tips and the muzzle) and the dun's dark stripe down the spine. Facing -x,
   y=0 is the ground. In its nominal units it is about 30 nose to buttock and 26 to the ears.
   It is drawn at BFT_HORSE_Z (ten) rig units to the nominal unit, the way the cat and the faces in
   the oak and the loft are, so the kit's tenth-of-a-unit rounding never steps an edge in the
   close-up; the scene draws it at (nominal scale)/BFT_HORSE_Z. Every constant below is nominal.
   Two poses, each its own rest pose with no CSS:
     stand: head up, ears forward, the near hind resting cocked on its toe
     graze: the neck down and the muzzle in the grass, the near fore a step ahead
   The head and neck of the graze are the stand's turned at its two joints (BFT_HORSE_ANG):
     bft-horse-head rotate(-86deg) and bft-horse-nod rotate(65deg) take the stand's head down to
   the graze's. The legs and the mane's locks are each pose's own, so the scene swaps rigs to
   change pose and animates the head inside either one.
   The neck is drawn in its own frame (along it, and across it toward the crest). Its back end is
   a round end within four units of the joint, behind the shoulder, and its crest runs on back under
   the withers, so at every angle from the stand to the graze the crest comes out of the withers and
   the root stays hidden. The previews show it at BFT_HORSE_S (1.7 nominal: withers about 34, ears
   about 45 and nose to tail about 56 scene units), well above the farm's buck and about the
   heron's height to the ears; that size is Josh's call. */

const BFT_HORSE_Z=10;
/* a frame: origin o, a unit direction at angle deg, and its side turned a right angle clockwise.
   Points come in as [along, across, ...rest] and go out as [x, y, ...rest] */
const bftHorseFrame=(o,deg)=>{
  const a=deg*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a),px=-dy,py=dx;
  return pts=>pts.map(([u,v,...r])=>[o[0]+u*dx+v*px,o[1]+u*dy+v*py,...r]);
};
/* the joints (nominal units) */
const BFT_HORSE_NECK=[-6.4,-15];        /* the neck's root, under the shoulder: bft-horse-head */
const BFT_HORSE_POLL_UV=[11.4,1];       /* the poll in the neck's frame: bft-horse-nod */
const BFT_HORSE_EAR_UV=[[.5,1],[.1,.75]];  /* the ears' roots in the head's frame, near and far: bft-horse-ear */
const BFT_HORSE_DOCK=[9.7,-16.9];      /* the dock of the tail: bft-horse-tail */
/* the angles of the neck and the head in the stand, and the two turns that make the graze */
const BFT_HORSE_ANG={neck:-134,head:126,grazeNeck:-86,grazeHead:65};

/* the kit at the rig's own scale: nominal points in, rig units out */
const bftHorseKit=(z=BFT_HORSE_Z)=>{
  const Z=pts=>pts.map(([x,y,w])=>w==null?[x*z,y*z]:[x*z,y*z,w*z]);
  return{z,Z,
    B:(pts,role,x)=>pBlob(Z(pts),role,x),
    T:(pts,role,o,x)=>pTaper(Z(pts),role,o,x),
    D:(cx,cy,r,role,x)=>pDot(cx*z,cy*z,r*z,role,x),
    /* a polygon, for the hooves: straight walls and a flat sole */
    P:(pts,role,x)=>part(`M ${Z(pts).map(([a,b])=>`${f1(a)} ${f1(b)}`).join(" L ")} Z`,role,x)};
};
const bftHorseLerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
/* move nominal points: by dx, and a shear that slides the foot by step with the top (y=top) fixed,
   so a leg can stand a step ahead without lifting its hoof off the ground */
const bftHorseShift=(pts,dx,step=0,top=-11)=>pts.map(([x,y,...r])=>[x+dx+step*(1-y/top),y,...r]);

/* a hoof: a front wall at about 55 degrees, a flat sole, the heel and the coronet, as nominal points
   from its toe on the ground at toe to its heel at heel; h is its height at the toe */
const bftHorseHoofPts=(toe,heel,h=1.12)=>[[toe,0],[heel,0],[heel+.15,-.28],[heel+.1,-.55],[heel-.14,-.78],
  [toe+.8,-h],[toe+.7,-h+.02],[toe+.1,-.3]];
const bftHorseHoof=(K,toe,heel,role,h)=>K.P(bftHorseHoofPts(toe,heel,h),role);
/* a foreleg about its cannon's centre line c: the forearm in the coat, wide at the elbow and
   tapering to the knee; then the point from the knee down (its top edge higher at the back): the
   knee flat in front with its bump behind, the cannon the thinnest part of the leg, the fetlock's
   knob, the pastern sloping forward and the hoof. step slides the hoof forward (-x) with the
   elbow fixed */
const BFT_HORSE_FORE={
  coat:[[-1.75,-11.6],[-1.76,-10.4],[-1.52,-9.0],[-1.18,-7.5],[-1.0,-6.4],[-.98,-5.5],[-.2,-5.2],[.6,-5.4],
    [.72,-6.2],[.84,-7.4],[1.1,-8.6],[1.5,-9.8],[1.8,-10.6],[1.7,-11.6],[0,-12.2]],
  point:[[-.94,-5.95],[-1.04,-5.35],[-1.0,-4.85],[-.74,-4.48],[-.52,-4.15],[-.47,-3.3],[-.48,-2.72],[-.6,-2.3],
    [-.82,-1.82],[-1.0,-1.42],[-1.1,-1.0],[.3,-.86],[.58,-.62],[.74,-1.0],[.88,-1.45],[1.12,-1.86],[1.04,-2.42],
    [.62,-2.86],[.46,-3.3],[.46,-4.2],[.62,-4.62],[.86,-5.1],[.8,-5.55],[.74,-6.2],[.82,-6.95],[0,-6.45]],
};
const bftHorseFore=(K,c,coat,pt,hf,step=0)=>{
  const S=pts=>bftHorseShift(pts,c,step);
  return[K.B(S(BFT_HORSE_FORE.coat),coat),K.B(S(BFT_HORSE_FORE.point),pt),
    bftHorseHoof(K,c+step-1.9,c+step+.34,hf)];
};
/* a hind leg about its cannon's centre line c, weight on it: the thigh and the gaskin in the
   coat, from the stifle's round knob under the flank and the back of the thigh down to the hock,
   whose point stands out behind the cannon; the point from the hock down, the fetlock, the
   pastern and the hoof */
const BFT_HORSE_HIND={
  coat:[[-3.4,-13.4],[-4.45,-12.0],[-4.68,-11.1],[-4.42,-10.35],[-3.85,-9.5],[-2.9,-8.3],[-1.9,-7.2],[-1.18,-6.3],
    [-.92,-5.6],[.2,-5.5],[1.25,-6.0],[1.06,-6.9],[.95,-7.9],[1.15,-9.1],[1.65,-10.6],[2.0,-12.1],[2.0,-13.6],[.4,-14.6]],
  point:[[-.98,-5.88],[-.9,-5.3],[-.62,-4.7],[-.48,-4.15],[-.47,-3.3],[-.48,-2.72],[-.58,-2.3],[-.74,-1.85],
    [-.92,-1.42],[-.98,-1.0],[.3,-.86],[.55,-.62],[.7,-1.0],[.82,-1.45],[1.06,-1.86],[.98,-2.42],[.58,-2.86],
    [.46,-3.4],[.48,-4.3],[.72,-4.9],[1.15,-5.45],[1.46,-5.95],[1.3,-6.45],[1.12,-6.98],[.1,-6.42]],
  hock:[.25,-5.6],fetlock:[.22,-2.05],
};
const bftHorseHind=(K,c,coat,pt,hf,step=0)=>{
  const S=pts=>bftHorseShift(pts,c,step,-13);
  return[K.B(S(BFT_HORSE_HIND.coat),coat),K.B(S(BFT_HORSE_HIND.point),pt),
    bftHorseHoof(K,c+step-1.76,c+step+.34,hf)];
};
/* the near hind resting: the stifle and the hock let down and forward, the cannon slanting forward
   from a hock whose point still stands out behind, the fetlock given forward so the pastern stands
   near upright, and the hoof tipped up onto its toe with the heel off the ground. c is where the
   hind stands when it takes weight */
const BFT_HORSE_REST={
  coat:[[-3.4,-13.4],[-4.45,-12.0],[-4.72,-11.0],[-4.46,-10.2],[-3.86,-9.4],[-2.98,-8.2],[-2.12,-7.0],[-1.45,-6.15],
    [-1.18,-5.6],[-.3,-5.0],[.6,-5.2],[1.02,-5.85],[.84,-6.8],[.84,-7.9],[1.06,-9.1],[1.6,-10.6],[2.0,-12.1],[2.0,-13.6],[.4,-14.6]],
  point:[[.92,-6.6],[1.12,-5.95],[1.02,-5.46],[.56,-5.06],[.02,-4.84],[-.3,-4.25],[-.58,-3.6],[-.84,-2.96],[-.74,-2.42],
    [-.84,-1.96],[-1.02,-1.56],[-1.18,-1.12],[-1.16,-.84],[-1.36,-.86],[-2.26,-.9],[-2.3,-1.4],[-2.34,-1.82],[-2.36,-2.18],
    [-2.12,-2.58],[-1.82,-3.2],[-1.52,-3.76],[-1.22,-4.36],[-1.0,-4.86],[-1.14,-5.4],[-1.18,-5.86],[-1.12,-6.02],[0,-6.52]],
  hoof:[[-2.48,0],[-2.46,-.24],[-2.32,-1.03],[-1.36,-1.0],[-1.1,-.74],[-1.18,-.48],[-2.22,-.02]],
};
const bftHorseHindRest=(K,c,coat,pt,hf)=>{
  const S=pts=>bftHorseShift(pts,c),R=BFT_HORSE_REST;
  return[K.B(S(R.coat),coat),K.B(S(R.point),pt),K.P(S(R.hoof),hf)];
};
/* an ear in the head's frame: a leaf from its root e0 along a (unit), len long and wid across at
   its widest, the tip turned a little to the front; its dark tip; the line of its opening */
const bftHorseEarAt=(e0,a,u,v)=>[e0[0]+u*a[0]+v*a[1],e0[1]+u*a[1]-v*a[0]];
const bftHorseEar=(e0,a,len,wid)=>[[-.02*len,-wid],[.45*len,-wid*1.05],[.88*len,-.12*wid],[len,.08*len],[.84*len,wid*.5],[.5*len,wid*.95],[0,wid*.9]].map(([u,v])=>bftHorseEarAt(e0,a,u,v));
const bftHorseEarTip=(e0,a,len,wid)=>[[.62*len,-wid*.62],[.88*len,-.12*wid],[len,.08*len],[.84*len,wid*.5],[.66*len,wid*.6],[.6*len,0]].map(([u,v])=>bftHorseEarAt(e0,a,u,v));
const bftHorseEarLine=(e0,a,len)=>[[.14*len,-.04,.1],[.38*len,-.16,.2],[.6*len,-.06,.08]].map(([u,v,w])=>[...bftHorseEarAt(e0,a,u,v),w]);

/* the mane, in the neck's frame: one mass on the crest from the withers to the poll, and its
   locks falling over the near side to points, each with a slight S. hang is how far a lock's tip
   runs along the neck for each unit it falls across it: each pose hangs its locks to the ground
   (BFT_HORSE_HANG); turned by CSS they lie back along the neck, which reads as a mane too */
const BFT_HORSE_HANG={stand:[-.85,1],graze:[.3,.72]};
const bftHorseMane=(N,K,[hang,len])=>{
  const mass=K.B(N([[11.95,1.4],[11.2,2.35],[9.8,3.35],[7.6,4.1],[5,4.45],[2,4.45],[-.6,4.15],[-2.6,3.55],[-3.8,2.9],
    [-3.9,2.2],[-1,2.55],[2,2.5],[5,2.45],[7.6,2.3],[9.6,1.8],[11,1.0]]),"mane");
  const locks=[];
  const lk=[1,.8,1.15,.88,1.06,.74,1.1,.84,.7];
  for(let i=0;i<9;i++){
    const u=-1.6+i*1.42,v0=3.1-(u>8?(u-8)*.35:0),d=(u>8?2.2:2.7)*lk[i]*len,
      du=hang*d,bend=(i%2?.18:-.15),w=u>9?1.15:1.5;
    locks.push(K.T(N([[u,v0,w],[u+du*.4+bend,v0-d*.42,w*.66],[u+du*.8+bend*.3,v0-d*.8,w*.3],[u+du,v0-d,.04]]),"mane",{per:14,capStart:false}));
  }
  return[mass,...locks];
};
/* the ears' rest in each pose, as a turn (degrees) on the stand's: grazing, the ears keep pointing
   up the way they do standing instead of following the face down */
const BFT_HORSE_EARS={stand:0,graze:21};

function rigBftHorse(pose="stand",phase=()=>"",z=BFT_HORSE_Z){
  const graze=pose==="graze",G=BFT_HORSE_ANG,K=bftHorseKit(z),{B,T,D}=K;
  /* each joint takes its clock off the wall the way the cast does (phase), and has no style without
     one; the far ear runs 4.2s behind the near one, the way the buck's do */
  const st=(p,lag=0)=>{const v=phase(p);if(!v)return"";
    const m=/animation-delay:-([\d.]+)s/.exec(v);
    return ` style="${m&&lag?`animation-delay:-${f1((+m[1]+lag)%p)}s`:v}"`};
  const N=bftHorseFrame(BFT_HORSE_NECK,G.neck+(graze?G.grazeNeck:0));
  const poll=N([BFT_HORSE_POLL_UV])[0];
  const H=bftHorseFrame(poll,G.head+(graze?G.grazeNeck+G.grazeHead:0));
  const [earN,earF]=H(BFT_HORSE_EAR_UV);
  const zp=p=>[p[0]*z,p[1]*z];
  /* the ears' directions in the head's frame, near and far, turned for the pose */
  const ea=BFT_HORSE_EARS[graze?"graze":"stand"]*Math.PI/180,
    eTurn=([u,v])=>[u*Math.cos(ea)-v*Math.sin(ea),u*Math.sin(ea)+v*Math.cos(ea)],
    aN=eTurn([-.535,.84]),aF=eTurn([-.68,.73]);

  const farLegs=graze
    ?[...bftHorseFore(K,-5.9,"far","pointFar","hoofFar",.5),...bftHorseHind(K,7.5,"far","pointFar","hoofFar")]
    :[...bftHorseFore(K,-6.1,"far","pointFar","hoofFar"),...bftHorseHind(K,9.0,"far","pointFar","hoofFar")];
  const nearLegs=graze
    ?[...bftHorseFore(K,-8.1,"body","point","hoof",-1.7),...bftHorseHind(K,9.3,"body","point","hoof")]
    :[...bftHorseFore(K,-8.1,"body","point","hoof"),...bftHorseHindRest(K,9.0,"body","point","hoof")];

  return [
    {parts:farLegs},
    {open:`<g class="bft-horse-head"${st(53)}>`,pivot:zp(BFT_HORSE_NECK),layers:[
      {parts:[
        /* the neck on its round root, the crest running back under the withers */
        B(N([[0,-3.05],[2.6,-2.9],[5.4,-2.45],[8,-2.05],[10,-1.8],[11.4,-1.35],[12.15,-.3],[11.85,1],[10.6,2.1],
          [8.2,3.3],[5.4,3.95],[2.4,4.1],[-.8,3.95],[-3.0,3.25],[-4.0,2.0],[-3.6,.2],[-2.6,-1.6],[-1.4,-2.7]]),"body"),
        ...bftHorseMane(N,K,BFT_HORSE_HANG[graze?"graze":"stand"])]},
      {open:`<g class="bft-horse-nod"${st(53)}>`,pivot:zp(poll),layers:[
        {open:`<g class="bft-horse-ear far"${st(9.5,4.2)}>`,pivot:zp(earF),layers:[
          {parts:[B(H(bftHorseEar(BFT_HORSE_EAR_UV[1],aF,2.2,.62)),"far")]}]},
        {parts:[
          /* the head: a broad forehead, a straight face, the nostril's swell, the upper lip and the
             lower lip with a notch between them, the chin groove, the jaw and the big round jowl */
          B(H([[-.35,.45],[.6,1.42],[1.8,1.68],[3.1,1.58],[5,1.32],[6.6,1.06],[7.5,1.02],[8.15,.62],[8.45,.05],
            [8.3,-.36],[8.08,-.48],[8.3,-.74],[8.12,-1.08],[7.62,-1.12],[7.42,-1.08],[7.05,-1.36],[5.9,-1.68],
            [4.5,-2.3],[3.4,-2.86],[2.2,-3.06],[1.1,-2.76],[.3,-1.92]]),"head"),
          /* the dark muzzle, running back under the chin */
          B(H([[6.3,1.12],[7.5,1.02],[8.15,.62],[8.45,.05],[8.3,-.36],[8.08,-.48],[8.3,-.74],[8.12,-1.08],
            [7.62,-1.12],[7.42,-1.08],[7.05,-1.36],[6.2,-1.6],[5.75,-.9],[5.85,.1]]),"muzzle"),
          /* the round of the jowl, quiet */
          T(H([[1.0,-1.5,.1],[1.9,-2.45,.22],[3.2,-2.5,.16],[4.1,-1.95,.06]]),"detail"),
          /* the nostril, a comma; the line of the mouth */
          T(H([[7.42,.62,.12],[7.72,.48,.3],[7.78,.12,.22],[7.5,-.04,.06]]),"nose"),
          T(H([[8.08,-.48,.14],[7.6,-.58,.12],[7.1,-.56,.05]]),"nose"),
          /* the eye: an almond under a heavy lid, its front corner lower */
          T(H([[1.92,.6,.07],[2.45,.88,.19],[3.12,.66,.05]]),"mark"),
          B(H([[1.95,.52],[2.4,.78],[2.98,.6],[3.18,.3],[2.6,.12],[2.12,.26]]),"eye"),
          D(...H([[2.42,.56]])[0],.1,"glint"),
          /* the forelock: one lock from between the ears down over the brow */
          T(H([[-.15,1.05,1.05],[.7,1.62,.9],[1.55,1.86,.55],[2.25,1.62,.06]]),"mane")]},
        {open:`<g class="bft-horse-ear"${st(9.5)}>`,pivot:zp(earN),layers:[
          {parts:[
            B(H(bftHorseEar(BFT_HORSE_EAR_UV[0],aN,2.4,.66)),"head"),
            T(H(bftHorseEarLine(BFT_HORSE_EAR_UV[0],aN,2.4)),"detail"),
            B(H(bftHorseEarTip(BFT_HORSE_EAR_UV[0],aN,2.4,.66)),"mark")]}]}]}]},
    {parts:[
      /* the body: the withers standing proud with the mane ending on them, a dip behind, the
         short back, a rounded loin, the croup sloping to a low tail set, the round of the buttock;
         under it a deep girth behind the elbow and the belly tucking up to the flank */
      B([[-5.6,-19.95],[-4.4,-19.62],[-2.8,-19.08],[-.8,-18.86],[1.4,-18.96],[3.4,-19.22],[5.2,-19.34],
        [6.9,-19.0],[8.3,-18.15],[9.4,-17.05],[10.4,-15.75],[10.95,-14.1],[10.9,-12.5],[10.3,-11.8],[8.6,-11.55],
        [6.4,-11.75],[4.6,-11.7],[3.0,-11.3],[1.0,-10.8],[-1.2,-10.42],[-3.4,-10.2],[-5.4,-10.3],[-7.0,-10.65],
        [-8.6,-11.1],[-9.75,-11.75],[-10.45,-12.6],[-10.55,-13.6],[-9.9,-14.85],[-8.78,-16.6],[-7.62,-18.2],
        [-6.55,-19.4]],"body"),
      ...nearLegs,
      /* the quiet lines of the haunch, from the point of the hip round to the stifle, and of the elbow */
      T([[4.4,-17.4,.06],[5.7,-16.0,.2],[6.3,-13.8,.22],[5.7,-11.9,.06]],"detail"),
      T([[-6.2,-12.4,.05],[-6.9,-11.1,.18],[-7.0,-10.2,.05]],"detail"),
      /* the dun's stripe, on the topline from the withers to the dock */
      T([[-5.5,-19.72,.08],[-4.4,-19.4,.44],[-2.8,-18.86,.46],[-.8,-18.64,.46],[1.4,-18.74,.46],[3.4,-19.0,.46],
        [5.2,-19.12,.46],[6.9,-18.79,.44],[8.2,-17.98,.4],[9.3,-16.92,.3]],"band")]},
    {open:`<g class="bft-horse-tail"${st(11)}>`,pivot:zp(BFT_HORSE_DOCK),layers:[
      {parts:[
        /* the tail carried a little off the dock, then falling in three locks, the outer one's tip
           turned up */
        B([[9.1,-17.3],[10.3,-17.15],[11.5,-16.2],[12.45,-14.4],[12.95,-11.8],[13.05,-9.0],[11.0,-8.8],
          [10.8,-11.6],[10.6,-13.9],[9.9,-15.6],[9.0,-16.4]],"tail"),
        T([[12.4,-11.5,2.0],[13.05,-8.6,1.9],[13.35,-5.6,1.45],[13.3,-3.6,.8],[13.75,-2.75,.06]],"tail"),
        T([[11.9,-10.8,2.1],[12.1,-8.0,1.85],[12.05,-5.6,1.2],[11.8,-3.4,.06]],"tail"),
        T([[11.3,-10.4,1.6],[11.05,-8.0,1.3],[10.75,-6.3,.7],[10.6,-5.1,.06]],"tail")]}]}];
}

INK.bftHorse={
  body:"#B88A55",head:"#B08350",far:"#8C6640",
  point:"#3A2B24",pointFar:"#2C211C",hoof:"#33292A",hoofFar:"#282022",
  mane:"#33251E",tail:"#33251E",band:"#5A3C27",muzzle:"#4E3A2D",
  detail:"#A27548",mark:"#3A2B24",nose:"#1E1518",eye:"#1A1214",glint:"#F4E8D0",
  ink:"#2A1B22",shade:"#3A2350",lit:"#FFE2A8",shadeOp:.34,litOp:.55,
};

/* the previews: drawn at ten units to the unit, shown at the scale the scene would use. BFT_HORSE_S is
   the recommended nominal scale on the near bank (1.5 to 1.8 all read; see the summary) */
const BFT_HORSE_S=1.7;
LOOK["horse-stand"]={pal:INK.bftHorse,box:[-24*BFT_HORSE_Z,-31*BFT_HORSE_Z,42*BFT_HORSE_Z,33*BFT_HORSE_Z],s:BFT_HORSE_S/BFT_HORSE_Z,dist:.1,o:{},draw:()=>rigBftHorse("stand")};
LOOK["horse-graze"]={pal:INK.bftHorse,box:[-24*BFT_HORSE_Z,-31*BFT_HORSE_Z,42*BFT_HORSE_Z,33*BFT_HORSE_Z],s:BFT_HORSE_S/BFT_HORSE_Z,dist:.1,o:{},draw:()=>rigBftHorse("graze")};
