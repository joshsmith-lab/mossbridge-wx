/* ── Beaufort: the white ibis ──────────────────────────────────────────────────────
   Eudocimus albus, the white bird of the Lowcountry marsh, working the mud in a small flock.
   Facing -x; y=0 is the mud or the water's surface (the branch's top for the roost).
   What says ibis at a few pixels, and never egret or heron: the long down-curved coral bill on
   one even arc, the bare red face it runs back into, the red legs, and a plump white body with
   the neck carried in a soft S. The black wingtips show only as a small dark wedge under the
   folded tertials. The iris is pale blue (an adult's).

   The kit rounds every point to a tenth of a unit, and on a 24-unit bird that stair-steps the
   bill, the neck and the legs close up. So every shape here is worked at ten times its size
   (BFT_IBIS_Z) and the path is brought back down to the bird's own units to a hundredth: the
   public frame, the anchors and the joint pivots stay those of a 24-unit bird drawn at s 1. */
INK.bftIbis={body:"#F8F5EC",neck:"#F8F5EC",wing:"#DCE2DC",tail:"#EDEEE8",covert:"#C8D0CD",tip:"#26222C",
  bill:"#EE7A4E",nose:"#E4503A",leg:"#EC5B40",legFar:"#BF4533",eyeRing:"#CFE7F3",eye:"#1C1A22",
  glint:"#F8F5EC",ink:"#3B4148",shade:"#7F93A0",lit:"#FFF5D7",shadeOp:.3,litOp:.42};

const BFT_IBIS_Z=10;
/* up to the working size, and the finished path back down to the bird's units */
const bftIbisUp=pts=>pts.map(p=>[p[0]*BFT_IBIS_Z,p[1]*BFT_IBIS_Z,...(p.length>2?[p[2]*BFT_IBIS_Z]:[])]);
const bftIbisDown=d=>{let c="M",n=0;
  return d.replace(/[MLCAZa]|-?\d*\.?\d+(?:e-?\d+)?/g,t=>{
    if(/[A-Za-z]/.test(t)){c=t;n=0;return t}
    const i=n++;if((c==="A"||c==="a")&&[2,3,4].includes(i%7))return t;
    return String(Math.round(+t/BFT_IBIS_Z*100)/100)})};
const bftIbisB=(pts,role,x)=>part(bftIbisDown(inkSpline(bftIbisUp(pts),true)),role,x);
const bftIbisT=(pts,role,opts={},x)=>part(bftIbisDown(taper(bftIbisUp(pts),{per:10,...opts})),role,x);
const bftIbisD=(cx,cy,r,role,x)=>{const p=pDot(cx*BFT_IBIS_Z,cy*BFT_IBIS_Z,r*BFT_IBIS_Z,role,x);return{...p,d:bftIbisDown(p.d)}};
/* turn a list of points about the origin by deg (positive turns clockwise on screen), then move
   it to x, y; a taper's widths ride along unchanged */
const bftIbisPlace=(pts,[x,y,deg])=>{const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return pts.map(p=>[x+p[0]*c-p[1]*s,y+p[0]*s+p[1]*c,...p.slice(2)])};
/* one even arc: from x0, y0 heading dir (degrees on screen, 180 is -x), turning down through
   turn degrees over len, the width running w0 to w1 */
const bftIbisArc=(x0,y0,dir,turn,len,w0,w1,n=8)=>{const P=[];let x=x0,y=y0;
  for(let i=0;i<=n;i++){const t=i/n;
    if(i){const a=(dir-turn*(t-.5/n))*Math.PI/180,ds=len/n;x+=Math.cos(a)*ds;y+=Math.sin(a)*ds}
    P.push([x,y,w0+(w1-w0)*Math.pow(t,1.25)])}
  return P};

/* the head is drawn once, in its own frame (the eye at 0,0, the bill going off to -x), and each
   pose places it with a turn, so the face and the bill are the same bird in every pose. The bill
   is one even arc that ends about fifty degrees off where it left the face */
const BFT_IBIS_HEAD={
  head:[[2.3,.4],[2.05,-1],[1.05,-1.72],[-.4,-1.78],[-1.5,-1.3],[-2.05,-.45],[-2.05,.65],[-1.6,1.45],[-.6,1.82],[.7,1.72],[1.9,1.2]],
  /* the bare red skin: the lores, round the eye and down onto the chin, kept a hair inside the
     head's edge so it never covers the outline */
  face:[[-1.9,-.9],[-1.25,-1.24],[-.25,-1.24],[.66,-.76],[.86,.05],[.45,.72],[-.25,1.2],[-1,1.55],[-1.58,1.25],[-1.9,.6]],
  bill:bftIbisArc(-1.75,.02,171,50,10.6,2.02,.5),
  eye:[0,-.2]
};
/* the body as drawn standing level; a pose that pitches it turns it about (2,-13). Its back is
   the wing's top edge, so the folded wing forms the back, and the tertials end in long points
   over a short tail with the black primary tips peeking out under them */
const BFT_IBIS_BODY={
  body:[[-6.4,-14.4],[-5.9,-16.4],[-4,-17.9],[-.6,-18.65],[3.6,-18.55],[7.6,-17.4],[10.8,-15.6],[12.4,-14.3],[11.4,-13.2],[8.4,-12.1],[4.6,-10.9],[.8,-10.3],[-2.6,-10.6],[-5.2,-12.1]],
  tail:[[9.2,-13.75,1.9],[11.8,-13.5,1.35],[14,-13.25,.35]],
  tip:[[11.6,-14.35],[13.6,-14.3],[15.9,-13.9],[13.6,-13.55],[11.6,-13.7]],
  wing:[[-2.2,-18.2],[-1.4,-18.62],[-.6,-18.78],[3.6,-18.68],[7.6,-17.55],[10.8,-16.05],[12.2,-15.3],[11.2,-14.6],[9.4,-14.3],[7.6,-13.75],[5.4,-13.6],[2.8,-13.7],[.4,-14.1],[-1.2,-15.1],[-2.1,-16.6]],
  /* the coverts' lower edge: a row of rounded feather ends, each with a darker rim */
  scallops:[[8.6,-14.05,1,.66],[6.55,-13.7,1.15,.76],[4.2,-13.6,1.3,.84],[1.75,-13.9,1.15,.78],[-.45,-14.45,1.05,.7]],
  tertials:[[[7.4,-16.55,2.1],[10.6,-15.3,1.75],[13.4,-14.55,.95],[15.5,-14.3,.12]],[[7.2,-15.2,2.1],[10.4,-14.45,1.7],[13.1,-13.95,.85],[14.8,-13.85,.1]]]
};
const bftIbisPitch=(pts,pitch)=>pitch?bftIbisPlace(pts.map(p=>[p[0]-2,p[1]+13,...p.slice(2)]),[2,-13,pitch]):pts;

/**
 * The white ibis, as inkRig layers back to front. pose: "probe" | "alert" | "walk" | "roost".
 * phase(sec) gives a joint its wall-clock animation-delay, the way rigHeron's does: the head
 * on 29s, the legs and the walk on 41s (the roost's head on 31s).
 * toes:true stands it on bare mud with its toes spread; toes:false wades it, each leg running on
 * along its own tarsus to y=+2.5 under the surface. sleep (the roost's default) shuts the eye.
 */
function rigBftIbis(pose="alert",phase=()=>"",{toes=true,sleep=pose==="roost"}={}){
  const T=bftIbisT,B=bftIbisB,D=bftIbisD,noSil={noSil:true},H=BFT_IBIS_HEAD,BD=BFT_IBIS_BODY;
  /* the head in two parts: the head itself, which goes with the neck, and the bill with the
     bare face and the eye. The bill's root sits under the face, which is painted with the last
     roles (nose, then the eye), after the shading, so the root of the bill never shows */
  const headBack=at=>[B(bftIbisPlace(H.head,at),"neck")];
  const headFront=at=>[
    T(bftIbisPlace(H.bill,at),"bill"),
    B(bftIbisPlace(H.face,at),"nose",noSil),
    /* asleep, the eye is a lid's closed line; awake, the pale blue iris round a dark pupil */
    ...(sleep?[T(bftIbisPlace([[-.6,-.25,.1],[0,.05,.26],[.6,-.2,.1]],at),"eye")]:[
      D(...bftIbisPlace([H.eye],at)[0],.52,"eyeRing"),
      D(...bftIbisPlace([H.eye],at)[0],.22,"eye")])];
  const bodyParts=pitch=>{const at=pts=>bftIbisPitch(pts,pitch);
    return[B(at(BD.body),"body"),T(at(BD.tail),"tail",{capEnd:false}),B(at(BD.tip),"tip"),
      B(at(BD.wing),"wing"),
      ...BD.scallops.flatMap(([cx,cy,rx,ry])=>{const sc=(k,d)=>B(at([[cx-rx*k,cy-d],[cx-rx*.7*k,cy+ry*.7*k-d],[cx,cy+ry*k-d],[cx+rx*.7*k,cy+ry*.7*k-d],[cx+rx*k,cy-d],[cx,cy-ry*.7-d]]),d?"wing":"covert",noSil);
        return[sc(1,0),sc(.93,.09)]}),
      ...BD.tertials.map(t=>T(at(t),"wing",{capEnd:false}))]};
  /* a leg: the shin from the hip inside the belly to the heel, which bends back, a small knob
     there, then the tarsus to the foot */
  const leg=(hip,heel,foot,role)=>{
    const end=toes?foot:[foot[0]+(foot[0]-heel[0])*(2.5-foot[1])/(foot[1]-heel[1]),2.5];
    return[T([[...hip,1.55],[...heel,1.08]],role),D(...heel,.6,role),T([[...heel,1.02],[...end,.86]],role)]};
  const feet=(f,role,down)=>!toes?[]:down?[
    T([[f[0],f[1]-.25,.72],[f[0]-.8,f[1]+.55,.48],[f[0]-1.5,f[1]+1.2,.2]],role),
    T([[f[0],f[1]-.25,.52],[f[0]-.25,f[1]+.65,.32],[f[0]-.45,f[1]+1.15,.14]],role)]:[
    T([[f[0]+.4,f[1]-.3,.74],[f[0]-1.5,f[1]-.05,.5],[f[0]-3.1,f[1]+.18,.2]],role),
    T([[f[0]+.2,f[1]-.3,.56],[f[0]-1,f[1]+.15,.38],[f[0]-1.95,f[1]+.42,.15]],role),
    T([[f[0]+.3,f[1]-.3,.5],[f[0]+1.5,f[1]-.08,.18]],role)];

  if(pose==="roost"){
    /* perched for the night, hunched and fluffed: the neck drawn in and the head sunk down in
       front of the shoulders, its bill laid down the white breast and curling back under it,
       inside the silhouette, so the hook still reads (red on white by day, dark on pale at
       night). A short body, the wingtips crossed over a short tail. y=0 is the top of the
       branch; the belly feathers come down over the legs and the toes curl over its front */
    const body=[[-6,-7.6],[-5.9,-10.6],[-4.9,-13],[-2.6,-14.8],[.8,-15.2],[4.2,-14],[6.8,-11.4],[8.2,-8.8],[8.2,-7.5],[6.6,-6.1],[4.4,-4.3],[1.6,-2.6],[-1.4,-2.2],[-4,-3.1],[-5.5,-5]];
    const wing=[[-1.9,-14.8],[.8,-15.32],[4.3,-14.1],[6.9,-11.5],[8.3,-8.9],[8.6,-7.6],[7.4,-7],[5.6,-7.3],[3.6,-8.1],[1.6,-9.3],[-.1,-10.9],[-1.3,-12.6]];
    return[
      {parts:[
        T([[-.4,-3,1.15],[-.6,-1.3,.95],[-.7,-.2,.85]],"legFar"),
        T([[1.7,-3,1.15],[1.8,-1.3,.95],[1.9,-.2,.85]],"legFar")]},
      {parts:[
        B(body,"body"),
        T([[6.4,-6.5,1.4],[8.3,-5.5,.95],[9.8,-4.8,.2]],"tail",{capEnd:false}),
        B([[7.6,-7.7],[9.2,-6.5],[10.9,-5],[9.2,-5.6],[7.6,-6.8]],"tip"),
        B(wing,"wing"),
        T([[-.4,-10.8,.1],[1.4,-9.1,.24],[3.4,-7.9,.26],[5.6,-7.1,.22],[7.6,-6.8,.08]],"covert",{},noSil),
        T([[4.6,-12.6,2.2],[7.2,-9.8,1.8],[9,-7.4,.9],[10.3,-5.9,.1]],"wing",{capEnd:false}),
        T([[4,-10.8,2],[6.6,-8.6,1.5],[8.5,-6.8,.8],[9.6,-5.8,.1]],"wing",{capEnd:false})]},
      {open:`<g class="bft-ibis-head" style="${phase(31)}">`,pivot:[-2.4,-13],layers:[{parts:[...headBack([-3.3,-13,-84]),...headFront([-3.3,-13,-84])]}]},
      {parts:[
        T([[-.6,-.6,.72],[-2.2,-.3,.5],[-2.9,.6,.22]],"leg"),
        T([[1.2,-.6,.72],[-.3,-.2,.5],[-.9,.7,.22]],"leg")]}];
  }
  /* each standing pose: how far the body pitches, the hips, heels and feet, and the neck from
     its root at the breast up to the back of the head, which sits at [x, y, turn] */
  const P={
    alert:{pitch:0,near:[[-.4,-10.6],[.7,-5.3],[-.6,0]],far:[[3,-10.6],[4,-5.3],[3.2,0]],
      root:[-4.6,-16.3],neck:[[-5.2,-17.2,4],[-6.5,-18.7,3],[-7,-19.9,2.5],[-6.8,-21,2.2],[-6.75,-21.6,2]],head:[-7.7,-22.35,6]},
    walk:{pitch:-3,near:[[-.4,-10.6],[-1.4,-5.6],[-4.6,0]],far:[[3,-10.6],[6.3,-5.6],[6.9,-1.2]],farToes:"down",
      root:[-5.25,-15.27],neck:[[-6.3,-15.6,3.8],[-8.2,-16.2,3],[-9.9,-16.3,2.5],[-10.9,-16,2.25],[-11.4,-15.7,2.1]],head:[-12.5,-16.6,-24]},
    probe:{pitch:-14,near:[[-.6,-10],[.4,-5],[-.8,0]],far:[[2.8,-10],[3.8,-5],[3,0]],
      root:[-5.55,-13.75],neck:[[-6.6,-13.95,4],[-8.3,-13.6,2.8],[-9.3,-12.2,2.1]],head:[-11.1,-11.2,-55]}
  };
  const p=P[pose]||P.alert,root=p.root,neck=[[...root,4.2],...p.neck];
  const legJ=(cls,pivot,parts)=>({open:`<g class="${cls}" style="${phase(41)}">`,pivot,layers:[{parts}]});
  /* The head joint turns at the neck's root, inside the breast, and it is written as two groups
     with the same class, pivot and clock, so they always move as one: the neck and the back of
     the head under the body, and the bill over it with the seam. The seam is the neck's own
     shape, a tenth of a unit in from each side and running out to nothing past its second
     joint, painted last in the breast's white: it covers the breast's edge wherever the neck
     crosses it, in every turn of the head, and never reaches the neck's own outline */
  const seam=neck.map((q,i)=>[q[0],q[1],i<3?q[2]-.2:.02]);
  const headJ=parts=>({open:`<g class="bft-ibis-head" style="${phase(29)}">`,pivot:root,layers:[{parts}]});
  return[{open:`<g class="bft-ibis-walk" style="${phase(41)}">`,pivot:[0,0],layers:[
    legJ("bft-ibis-leg far",p.far[0],[...leg(...p.far,"legFar"),...feet(p.far[2],"legFar",p.farToes==="down")]),
    legJ("bft-ibis-leg near",p.near[0],[...leg(...p.near,"leg"),...feet(p.near[2],"leg")]),
    headJ([T(neck,"neck"),...headBack(p.head)]),
    {parts:bodyParts(p.pitch)},
    headJ([...headFront(p.head),T(seam,"glint",{capEnd:false},noSil)])]}];
}

/* where the water meets a wading bird, in the bird's own units, to draw over it in the same
   place: a faint sheen across the legs (the heron's), and rings that answer the water's contact,
   one at each foot on the step's clock and one where the probing bill meets the surface. The
   rings carry classes for the scene's keyframes (opacity 0 at rest, the way heron-step-ring is);
   still:true draws them as one still frame, for a preview */
function bftIbisWater(pose,{dark=false,phase=()=>"",still=false}={}){
  const st=dark?"#B7D6E1":"#183C4B",ring=(cls,cx,cy,rx,ry,p)=>
    `<ellipse${still?"":` class="bft-ibis-ring ${cls}" style="${phase(p)}"`} cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${st}" stroke-width=".35"${still?` opacity=".5"`:""}/>`;
  /* where each leg, and the probing bill, cross the surface */
  const feet={alert:[-.6,3.2],walk:[-4.6,7.1],probe:[-.8,3]}[pose]||[-.6,3.2];
  const bill={probe:[-12.45,0]}[pose];
  return `<ellipse cx="1.2" cy="1.15" rx="7.4" ry=".85" fill="${dark?"#EAF2FF":"#FFFFFF"}" opacity=".16"/>`
    +(still?(pose==="walk"?ring("step near",feet[0],0,2.4,.6,41):"")
      :ring("step near",feet[0],0,2.4,.6,41)+ring("step far",feet[1],0,2.4,.6,41))
    +(bill?ring("probe",...bill,2.2,.55,29):"");
}

const BFT_IBIS_O={line:.95,heavy:.45,shade:1.7,lit:.85};
for(const pose of["probe","alert","walk","roost"])
  LOOK[`ibis-${pose}`]={pal:INK.bftIbis,s:1,dist:.04,o:BFT_IBIS_O,
    box:pose==="roost"?[-12,-18,24,22]:[-22,-27,38,31],
    ...(pose==="roost"?{ground:false,extra:()=>`<path d="${taper([[-14,1.6,2.6],[-4,1.4,3.2],[6,1.5,3.4],[14,2,2.8]])}" fill="#6B5644" stroke="#2A1B33" stroke-width=".5"/>`}:{}),
    states:pose==="roost"?{roost:{}}:{mud:{toes:true},wade:{toes:false}},
    /* a wading bird is previewed with the water over its legs, as the scene would draw it */
    draw:st=>{const L=rigBftIbis(pose,()=>"",{toes:st.toes!==false});
      return pose==="roost"||st.toes!==false?L:[...L,{open:`<g>${bftIbisWater(pose,{still:true})}`,pivot:[0,0],layers:[]}]}};
/* the roost at the size the oak's limbs would carry it, with the lighter line a small far bird
   needs */
LOOK["ibis-roost-oak"]={...LOOK["ibis-roost"],s:.5,o:{line:.6,heavy:.3,shade:.9,lit:.5}};
