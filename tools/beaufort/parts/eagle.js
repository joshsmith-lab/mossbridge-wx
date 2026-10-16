/* ── Beaufort: the bald eagle ─────────────────────────────────────────────────────────
   Jen asked "have you ever done eagles?". Two drawings, both facing -x.

   rigBftEagleSoar: the sky's bird over the river, seen from below and a little to the side the
   way the scene's gulls and hawk are. What makes it an eagle at fifteen pixels is the plank: a
   long wing held flat, a deep chord with a clean leading edge and an unscalloped trailing edge
   (scallops between fingers are the bat), and a hand that ends in five short primaries cut apart
   by narrow slots, uneven in length, swept a little back and each coming to a point, so the tip
   is a ragged edge and never a comb or a glove. The white head leads it, a narrow knob with the
   yellow bill out in front, and the white fanned tail follows, against the dark brown of
   everything else. Local units: 0 0 is the middle of the chest on the wing line; the span is
   about 30.

   rigBftEaglePerch: upright on a snag top, the perch at y=0: the white hood, crown to throat to
   its ragged edge over the shoulders in one piece; the brow standing out over a pale eye; the
   hooked yellow bill; the dark body with the near wing folded down its side, its coverts ending in
   one row of scallops and its primaries' tips stacked over the tail; the white tail hanging back
   along the line of the back; the yellow feet gripping. About 19 from crown to tail tip.

   Both take z, the drawing's own units per scene unit (default 1). The kit rounds every point to a
   tenth of a unit, which steps the small marks (the gape, the eye) close up, so the LOOK draws
   them at z=10 and scale .1, the way the faces in the oak and the loft are drawn. The scene can do
   the same: inkAt(x, y, s/10, flip, inkRig(rigBftEaglePerch(head, 10), pal, {s: s*1.22, ...})). */

/* a closed outline of smooth runs joined at corners. Each run is a list of points, and each run
   starts where the one before it ended; inside a run the line is the kit's Catmull-Rom, and where
   two runs meet it is a corner (a feather's point, the bottom of a slot) */
function bftEagleOutline(runs){
  let d=`M ${P2(runs[0][0])}`;
  for(const run of runs){
    const P=[run[0],...run,run[run.length-1]];
    for(let i=1;i<P.length-2;i++){
      const[a,b,c,e]=[P[i-1],P[i],P[i+1],P[i+2]];
      d+=` C ${P2([b[0]+(c[0]-a[0])/6,b[1]+(c[1]-a[1])/6])} ${P2([c[0]-(e[0]-b[0])/6,c[1]-(e[1]-b[1])/6])} ${P2(c)}`;
    }
  }
  return d+" Z";
}
/* a row of scallops from p0 to p1, each feather tip bulging by `b` to the right of the way the
   row runs: the points a run list needs, corners at every join */
function bftEagleScallops(p0,p1,n,b){
  const runs=[],dx=(p1[0]-p0[0])/n,dy=(p1[1]-p0[1])/n,L=Math.hypot(dx,dy),nx=-dy/L,ny=dx/L;
  for(let i=0;i<n;i++){
    const a=[p0[0]+dx*i,p0[1]+dy*i],c=[p0[0]+dx*(i+1),p0[1]+dy*(i+1)];
    runs.push([a,[a[0]+dx*.22+nx*b*.8,a[1]+dy*.22+ny*b*.8],[a[0]+dx*.55+nx*b,a[1]+dy*.55+ny*b],c]);
  }
  return runs;
}

/* the bill, in profile and pointing -x, in the perched bird's units with its base at x -3.2:
   deep at the cere, the culmen arcing down into a hook that overhangs the lower mandible. Both
   drawings use it; the soaring bird turns it to point ahead */
const bftEagleBillRuns=[
  [[-3.2,-15.22],[-4.2,-15.22],[-5.1,-14.88],[-5.75,-14.22],[-6.05,-13.45],[-5.9,-12.85]],
  [[-5.9,-12.85],[-5.68,-13.15],[-5.45,-13.42]],[[-5.45,-13.42],[-4.7,-13.32],[-3.9,-13.32],[-3.3,-13.38]],
  [[-3.3,-13.38],[-3.22,-14.3],[-3.2,-15.22]]];
/* the soaring bird's bill: the same bill at .62, its base on the front of the head, turned 70
   degrees so it points ahead and a little to -x, the hook curling over to -x */
function bftEagleSoarBill([x,y]){
  const k=.62,a=70*Math.PI/180,u=(x+3.2)*k,v=(y+14.3)*k;
  return[-.12+u*Math.cos(a)-v*Math.sin(a),-4.92+u*Math.sin(a)+v*Math.cos(a)];
}

/* ── soaring ───────────────────────────────────────────────────────────────────────────
   The bird is drawn in a plain frame (head up, wings along x) and then seen a little from the
   side: the far wing (+x) foreshortened, the body axis leaning toward -x (a shear, so the wing
   line stays level and only the head and tail lean), and a slight bank */
const BFT_EAGLE_SOAR={far:.93,lean:.15,bank:-3*Math.PI/180};
function bftEagleSoarAt([x,y],wing,z){
  const fx=wing&&x>0?x*BFT_EAGLE_SOAR.far:x;
  const sx=fx+BFT_EAGLE_SOAR.lean*y,c=Math.cos(BFT_EAGLE_SOAR.bank),s=Math.sin(BFT_EAGLE_SOAR.bank);
  return[(sx*c-y*s)*z,(sx*s+y*c)*z];
}
/* the kit's shapes, through that view and at z */
function bftEagleSoarKit(z){
  const at=(p,wing)=>bftEagleSoarAt(p,wing,z);
  return{
    B:(pts,role,wing,x)=>pBlob(pts.map(p=>at(p,wing)),role,x),
    T:(pts,role,wing,o,x)=>pTaper(pts.map(([a,b,w])=>[...at([a,b],wing),w*z]),role,o,x),
    D:(cx,cy,r,role,x)=>{const[p,q]=at([cx,cy],false);return pDot(p,q,r*z,role,x)},
    O:(runs,role,wing,x)=>part(bftEagleOutline(runs.map(r=>r.map(p=>at(p,wing)))),role,x)};
}
/* the hand's five primaries, leading (outermost) first: where each one's slot starts on the
   hand's end, how far it is swept back (degrees off the wing's line) and how long it runs free.
   The outermost is the shortest, the third the longest, and the inner two grade into the
   trailing edge */
const BFT_EAGLE_HAND={
  slots:[[11.7,-2.62],[12.22,-1.58],[12.38,-.52],[12.28,.55],[11.98,1.56],[11.4,2.5]],
  sweep:[3,6,10,14,19],
  free:[1.4,2.05,2.4,1.95,1.35]};
/* one wing, drawn for the right side (sx 1) and turned over for the left (sx -1) */
function bftEagleWing(sx,z){
  /* drawn a touch long (1.06) along the span, so the wing with its short fingers still spans 30 */
  const K=bftEagleSoarKit(z),X=([x,y,w])=>w==null?[x*1.06*sx,y]:[x*1.06*sx,y,w];
  const O=(runs,role,x)=>K.O(runs.map(r=>r.map(X)),role,true,x);
  const T=(pts,role,o,x)=>K.T(pts.map(X),role,true,o,x);
  /* each primary is a blade: near its full width for half its length, then drawn in to a point.
     side(i, t, s) is a point on its leading (s 1) or trailing (s -1) side, t along it */
  const H=BFT_EAGLE_HAND,prof=[[0,1],[.5,.82],[.8,.5],[1,.04]];
  const side=(i,t,k,s)=>{
    const A=H.slots[i],B=H.slots[i+1],C=[(A[0]+B[0])/2,(A[1]+B[1])/2],h=[(A[0]-B[0])/2,(A[1]-B[1])/2];
    const a=(H.sweep[i]+2*t)*Math.PI/180,L=H.free[i];
    return[C[0]+t*L*Math.cos(a)+h[0]*k*s,C[1]+t*L*Math.sin(a)+h[1]*k*s];
  };
  const up=i=>prof.map(([t,k])=>side(i,t,k,1));
  const down=i=>prof.slice().reverse().map(([t,k])=>side(i,t,k,-1));
  /* the plank: the leading edge from the shoulder out to the wrist and on along the hand into the
     outermost primary; the hand's end cut into five; the trailing edge from the innermost primary
     back to the body with the secondaries' gentle bulge, pinched in where it meets the body */
  const runs=[[[.3,-2.1],[2.6,-2.75],[5.4,-3.05],[7.4,-3.2],[9.7,-3.02],...up(0)]];
  for(let i=0;i<5;i++){
    if(i)runs.push(up(i));
    runs.push(i<4?down(i):[...down(i),[10.5,3.1],[8,3.7],[5,3.95],[2.6,3.7],[1.2,3.1],[.3,2.6]]);
  }
  runs.push([[.3,2.6],[.3,-2.1]]);
  const parts=[O(runs,"quill")];
  /* the coverts, the darker front half of the wing, out to the wrist; their back edge is one row
     of feather tips */
  parts.push(O([[[.3,-2.1],[2.6,-2.75],[5.4,-3.05],[7.4,-3.2],[9.7,-3.02],[10.85,-2.8]],[[10.85,-2.8],[11.02,-2.1],[10.8,-1.55],[10.4,-1.25]],
    ...bftEagleScallops([10.4,-1.25],[1.2,.35],5,-.42),[[1.2,.35],[.3,.35],[.3,-2.1]]],"wing"));
  /* the flight feathers' dark tips along the trailing edge, and a quill line up each primary */
  parts.push(T([[1.6,2.95,.22],[3,3.38,.5],[5,3.58,.58],[8,3.36,.5],[10.3,2.76,.36],[11.2,2.22,.1]],"band",{},{noSil:true}));
  for(let i=0;i<5;i++){
    const[a,b]=[side(i,-.12,0,1),side(i,.6,0,1)];
    parts.push(T([[a[0],a[1],.03],[(a[0]+b[0])/2,(a[1]+b[1])/2,.1],[b[0],b[1],.03]],"band",{},{noSil:true,op:.55}));
  }
  return parts;
}
/* the soaring eagle; wingL and wingR are the joints' opening tags, so the scene can time them */
const rigBftEagleSoar=(wingL=`<g class="bft-eagle-wing-l">`,wingR=`<g class="bft-eagle-wing-r">`,z=1)=>{
  const{B,T,D,O}=bftEagleSoarKit(z);
  return[
  {open:wingR,pivot:bftEagleSoarAt([1.4,.4],true,z),layers:[{parts:bftEagleWing(1,z)}]},
  {open:wingL,pivot:bftEagleSoarAt([-1.4,.4],true,z),layers:[{parts:bftEagleWing(-1,z)}]},
  {parts:[
    /* the tail, fanned while it soars, white from the vent to its rounded end */
    B([[-1.25,2.3],[1.25,2.3],[2.05,4.3],[2.75,6.3],[2.85,7.2],[1.5,7.8],[0,7.95],[-1.5,7.8],[-2.85,7.2],[-2.75,6.3],[-2.05,4.3]],"tail"),
    T([[-.55,4,.12],[-1.05,6,.1],[-1.3,7.4,.04]],"fold",false,{},{noSil:true}),
    T([[.55,4,.12],[1.05,6,.1],[1.3,7.4,.04]],"fold",false,{},{noSil:true}),
    /* the body, a short broad spindle across the wing line, the feathered thighs at its foot */
    B([[0,-2.6],[1.6,-2.3],[2.25,-.9],[2.25,.85],[2,2.2],[1.5,3],[.7,3.3],[0,3.05],[-.7,3.3],[-1.5,3],[-2,2.2],[-2.25,.85],[-2.25,-.9],[-1.6,-2.3]],"body"),
    /* the white undertail coverts run up into the belly between the dark feathered thighs, the
       way an adult shows them from below */
    B([[-.72,3.4],[-.62,2.5],[-.32,1.85],[0,1.7],[.32,1.85],[.62,2.5],[.72,3.4]],"tail",false,{noSil:true}),
    /* the yellow bill out past the white: the perched bird's own bill, smaller and turned to
       point ahead, so the culmen is on the +x side and the hook curls over to -x. It is drawn
       under the head, its base tucked in, so the round front of the head makes the join */
    O([...bftEagleBillRuns.slice(0,3),[[-3.3,-13.38],[-2.7,-13.5],[-2.6,-14.3],[-2.7,-15.1],[-3.2,-15.22]]].map(r=>r.map(bftEagleSoarBill)),"bill",false),
    /* the white head out in front, a round knob on a thick neck, looking down and a little to
       -x; the white comes down onto the top of the breast and ends ragged */
    B([[1.45,-1.75],[1.55,-2.9],[1.6,-3.9],[1.35,-4.75],[.8,-5.3],[0,-5.5],[-.8,-5.35],[-1.4,-4.85],[-1.65,-3.9],[-1.55,-2.9],[-1.45,-1.75],[-1.08,-1.32],[-.76,-1.62],[-.4,-1.22],[-.04,-1.56],[.32,-1.18],[.68,-1.54],[1.02,-1.28],[1.3,-1.62]],"head"),
    D(-1.0,-4.4,.25,"eyeRing"),
    D(-1.0,-4.4,.18,"eye"),
    D(-1.05,-4.44,.1,"nose")]}];
};

/* ── perched ───────────────────────────────────────────────────────────────────────────
   drawn at .9 of its first measure, so it stands about 19 from crown to tail tip */
const BFT_EAGLE_PERCH_K=.9;
function bftEaglePerchKit(z){
  const k=BFT_EAGLE_PERCH_K*z,K=([a,b])=>[a*k,b*k];
  return{k,
    B:(pts,role,x)=>pBlob(pts.map(K),role,x),
    T:(pts,role,o,x)=>pTaper(pts.map(([a,b,w])=>[a*k,b*k,w*k]),role,o,x),
    D:(cx,cy,r,role,x)=>pDot(cx*k,cy*k,r*k,role,x),
    O:(runs,role,x)=>part(bftEagleOutline(runs.map(r=>r.map(K))),role,x)};
}
/* a foot gripping the perch at x0: the bare yellow shank, three front toes over the top and down
   the -x side, the hind toe round the back, black talons at the ends */
function bftEagleFoot(T,x0,role){
  return[
    T([[x0,-1.5,1],[x0-.1,-.6,.92],[x0-.2,-.2,.82]],role),
    T([[x0-.1,-.4,.62],[x0-1.3,-.45,.52],[x0-2.2,-.1,.42],[x0-2.6,.5,.32]],role),
    T([[x0-.2,-.25,.56],[x0-.9,.05,.46],[x0-1.4,.55,.34]],role),
    T([[x0+.2,-.35,.56],[x0+1.1,-.15,.44],[x0+1.6,.4,.32]],role),
    T([[x0-2.62,.4,.38],[x0-2.76,.92,.26],[x0-2.5,1.25,.05]],"talon"),
    T([[x0-1.43,.45,.34],[x0-1.5,.92,.24],[x0-1.25,1.2,.05]],"talon"),
    T([[x0+1.58,.3,.32],[x0+1.74,.78,.22],[x0+1.55,1.1,.05]],"talon")];
}
/* the tail, in its own frame: u across it, v down it from the rump. It hangs 12 degrees back off
   the plumb line, along the line of the back, and its end is squared and a little fanned */
const BFT_EAGLE_TAIL={root:[3.1,-3.3],tilt:12*Math.PI/180,len:7.9};
function bftEagleTailAt([u,v]){
  const T=BFT_EAGLE_TAIL,c=Math.cos(T.tilt),s=Math.sin(T.tilt);
  return[T.root[0]+u*c+v*s,T.root[1]-u*s+v*c];
}
const rigBftEaglePerch=(head=`<g class="bft-eagle-head">`,z=1)=>{
  const{k,B,T,D,O}=bftEaglePerchKit(z);
  const tl=BFT_EAGLE_TAIL.len,tail=pts=>pts.map(bftEagleTailAt),tailW=pts=>pts.map(([u,v,w])=>[...bftEagleTailAt([u,v]),w]);
  return[
  /* the far leg and foot, a shade back */
  {parts:[
    T([[.2,-3.4,2],[.4,-2,1.7],[.5,-1.2,1.2]],"far"),
    ...bftEagleFoot(T,.7,"footFar")]},
  /* the white tail hanging back behind the perch, its squared end notched between two feathers */
  {parts:[
    O([tail([[-1.05,-.6],[-1.15,2],[-1.3,5],[-1.45,tl-.15]]),
      tail([[-1.45,tl-.15],[-.95,tl+.08],[-.55,tl+.02]]),tail([[-.55,tl+.02],[-.38,tl-.22]]),
      tail([[-.38,tl-.22],[.05,tl+.12],[.5,tl+.1]]),tail([[.5,tl+.1],[.66,tl-.16]]),
      tail([[.66,tl-.16],[1.15,tl+.04],[1.5,tl-.1]]),
      tail([[1.5,tl-.1],[1.35,5],[1.2,2],[1.1,-.6]]),tail([[1.1,-.6],[-1.05,-.6]])],"tail"),
    T(tailW([[-.4,3,.12],[-.45,5.5,.1],[-.42,tl-.4,.04]]),"fold",{},{noSil:true}),
    T(tailW([[.56,3,.12],[.6,5.5,.1],[.62,tl-.35,.04]]),"fold",{},{noSil:true})]},
  /* the body, upright and leaning a little into the bill */
  {parts:[
    B([[-2.3,-12.6],[-3.6,-10.6],[-4,-8],[-3.7,-5.4],[-2.9,-3.2],[-1.4,-2],[.8,-1.9],[2.8,-2.8],[3.9,-5],[4.2,-8.4],[3.6,-11.2],[2.3,-12.8],[0,-13.3]],"body"),
    /* the feathered trouser, shaggy over the foot */
    B([[-3.3,-4.6],[-1.9,-4.4],[-.7,-3.6],[-.5,-2.4],[-.8,-1.3],[-1.3,-1.6],[-1.7,-1.0],[-2.15,-1.55],[-2.7,-1.15],[-3.05,-1.9],[-3.4,-3.2]],"body"),
    ...[[-3.2,-9.3],[-3.45,-7.6],[-2.95,-6.75],[-3.35,-5.6],[-2.85,-3.9]].map(([x,y],i)=>
      T([[x-.42,y-.02,.03],[x-.15,y+.13,.1],[x+.2,y+.11,.1],[x+.4+.06*(i%2),y-.04,.03]],"breast",{},{noSil:true,op:.5}))]},
  /* the near wing folded down the side: the coverts' dark shield ending in a row of scallops,
     then the flight feathers, their tips stacked over the top of the tail, each one longer than
     the one over it */
  {parts:[
    O([[[-1.4,-11.6],[-2.5,-9.6],[-2.65,-6.8],[-1.75,-4.1],[-.15,-2.2],[1.55,-.45]],
      [[1.55,-.45],[1.9,-.95]],[[1.9,-.95],[2.45,-.3],[2.9,.5]],[[2.9,.5],[3.2,-.05]],
      [[3.2,-.05],[3.75,.62],[4.2,1.5]],[[4.2,1.5],[4.5,.45],[4.55,-2.6],[4.45,-6.4],[3.95,-10],[2.65,-11.9],[.6,-12.4],[-1.4,-11.6]]],"quill"),
    O([[[-1.4,-11.6],[-2.5,-9.6],[-2.6,-7.5]],...bftEagleScallops([-2.6,-7.5],[4.47,-5.2],4,.5),
      [[4.47,-5.2],[4.42,-6.4],[3.95,-10],[2.65,-11.9],[.6,-12.4],[-1.4,-11.6]]],"wing"),
    /* the edges of the stacked primaries, running up from each slot */
    T([[1.9,-.95,.16],[1.2,-1.72,.14],[.42,-2.5,.09],[-.3,-3.15,.02]],"band",{},{noSil:true}),
    T([[3.2,-.05,.16],[2.5,-.85,.14],[1.72,-1.66,.09],[1.02,-2.3,.02]],"band",{},{noSil:true})]},
  /* the near foot, bare and yellow under the feathered trouser */
  {parts:[
    ...bftEagleFoot(T,-1.6,"foot")]},
  /* the head turns at the top of the neck, and the white hood turns with it, crown to throat to
     the ragged edge over the shoulders in one piece. A flat crown, the brow a ledge over the pale
     eye, and the bill: deep at the cere, the culmen arcing down into a hook that overhangs the
     lower mandible */
  {open:head,pivot:[.1*k,-13.2*k],layers:[{parts:[
    O([[[2.15,-15.3],[1.6,-16.05],[0,-16.6],[-1.85,-16.5],[-2.62,-16.2],[-3.02,-15.72],[-3.25,-15.2],[-3.4,-14.2],[-3.3,-13.25],[-3,-12.35],[-3.05,-11.75],[-3.05,-11.2]],
      [[-3.05,-11.2],[-2.75,-11.5],[-2.45,-10.85]],[[-2.45,-10.85],[-2.1,-11.6],[-1.45,-11.2]],[[-1.45,-11.2],[-1.05,-11.5],[-.55,-10.75]],
      [[-.55,-10.75],[-.1,-11.55],[.55,-11.25]],[[.55,-11.25],[.85,-11.5],[1.3,-10.95]],[[1.3,-10.95],[1.85,-11.75],[2.6,-11.3]],
      [[2.6,-11.3],[2.9,-12.3],[2.75,-13.6],[2.55,-14.45]],[[2.55,-14.45],[2.15,-15.3]]],"head"),
    O(bftEagleBillRuns,"bill"),
    /* the bare yellow skin at the corner of the mouth, reaching back under the eye */
    O([[[-3.3,-14.25],[-2.85,-14.18],[-2.55,-14.05],[-2.5,-13.92],[-2.75,-13.78],[-3.3,-13.6]],[[-3.3,-13.6],[-3.3,-14.25]]],"bill"),
    /* the cere's front edge and the nostril, a slit in it */
    T([[-4.1,-15.18,.07],[-4.02,-14.75,.09],[-4.12,-14.35,.04]],"cere",{},{noSil:true}),
    T([[-3.64,-14.86,.05],[-3.78,-14.75,.11],[-3.9,-14.66,.04]],"cere",{},{noSil:true}),
    /* the gape: the top of the lower mandible, running back into the yellow under the eye */
    T([[-5.45,-13.62,.03],[-4.6,-13.72,.07],[-3.6,-13.82,.07],[-2.95,-13.92,.05],[-2.6,-13.95,.02]],"gape",{},{noSil:true}),
    /* the eye, pale and fierce, its top cut flat by the brow that overhangs it */
    D(-1.95,-15.3,.44,"eyeRim",{noSil:true}),
    D(-1.95,-15.3,.35,"iris",{noSil:true}),
    D(-2.04,-15.27,.19,"pupil",{noSil:true}),
    O([[[-2.66,-15.36],[-1.95,-15.5],[-1.28,-15.64]],[[-1.28,-15.64],[-1.26,-16.02],[-2.7,-16.02],[-2.66,-15.36]]],"head",{noSil:true}),
    T([[-2.62,-15.35,.03],[-2.35,-15.43,.08],[-1.95,-15.51,.09],[-1.6,-15.58,.06],[-1.4,-15.62,.02]],"eyeRim",{},{noSil:true}),
    D(-1.9,-15.2,.07,"glint")]}]}];
};

/* the palette: day colours. The adult's chocolate brown, a shade greyer on the flight feathers;
   the white head and tail a touch warm; the bill and feet a strong yellow. band is the flight
   feathers' dark edges, breast a lighter brown for the feather tips on the breast, fold the grey
   between the white tail feathers, cere the faint line and the nostril at the bill's base, gape
   the mouth's line. The perched eye is eyeRim, iris and pupil, painted with the head so the brow
   can be laid over its top; the soaring bird's tiny eye is eyeRing, eye and nose, painted last */
INK.bftEagle={body:"#3D2A20",wing:"#33241C",quill:"#4B3B31",far:"#2C1F18",head:"#F6F2E8",tail:"#F3EEE3",
  bill:"#F2BE2C",foot:"#EDB938",footFar:"#C9982E",talon:"#1E1619",band:"#251912",breast:"#56402F",fold:"#D6CEC0",
  cere:"#C9952A",gape:"#5A3A16",eyeRim:"#2A1C16",iris:"#F2DF86",pupil:"#1A1214",eyeRing:"#2A1C16",eye:"#F2DF86",nose:"#1A1214",glint:"#FFFBEF",
  ink:"#21161C",shade:"#2A1E3A",lit:"#FFE6B8",shadeOp:.34,litOp:.5};

/* the LOOK's dead snag: a weathered grey stub about five units across its top under the perched
   bird, so the tail hangs clear of it against the sky, drawn plainly with strokes that keep their
   weight at any zoom. It is only for looking; the scene sets the bird on its own snag. Units are
   the LOOK's (z=10) */
function bftEagleSnag(lt){
  const hx=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const mx=(a,b,t)=>"#"+hx(a).map((v,i)=>Math.round(v+(hx(b)[i]-v)*t).toString(16).padStart(2,"0")).join("");
  const tn=c=>{let t=c;if(lt&&lt.warm)t=mx(t,lt.warm,.3*lt.gold);if(lt&&lt.night)t=mx(t,"#15223D",.62*lt.night);return lt?mx(t,lt.haze,.4*.72):t};
  const wood=tn("#9C958A"),dark=tn("#6E675E"),ink=lt?mx(lt.ink,lt.haze,.28):"#2A1B33";
  const st=`stroke="${ink}" stroke-width=".8" vector-effect="non-scaling-stroke" stroke-linejoin="round"`;
  return `<path d="M -33 3 L -30 -2 L -20 1 L -9 -4 L 3 0 L 11 -7 L 17 -3 L 20 6 L 23 160 L -31 160 Z" fill="${wood}" ${st}/>`
    +`<path d="M 8 24 L 19 14 L 23 160 L 11 160 Z" fill="${dark}" opacity=".85"/>`
    +`<path d="M -31 96 L -66 82 L -94 52 L -90 50 L -61 72 L -31 82 Z" fill="${wood}" ${st}/>`
    +`<path d="M -14 34 L -16 86 M 2 54 L 1 124" stroke="${dark}" stroke-width=".5" vector-effect="non-scaling-stroke" fill="none"/>`;
}

LOOK["eagle-soar"]={
  pal:INK.bftEagle,box:[-170,-100,340,220],s:.1,dist:.3,ground:false,
  o:{line:.7,heavy:.38,shade:1.3,lit:.85},
  states:{glide:{}},
  draw:()=>rigBftEagleSoar(undefined,undefined,10)};
LOOK["eagle-perch"]={
  pal:INK.bftEagle,box:[-100,-170,180,260],s:.1,dist:.4,ground:false,
  o:{line:.75,heavy:.42,shade:1.3,lit:.8},
  states:{perched:{}},
  draw:()=>rigBftEaglePerch(undefined,10),
  extra:(st,lt)=>bftEagleSnag(lt)};
