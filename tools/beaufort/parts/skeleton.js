/* ── Beaufort, for Halloween: the skeleton captain ─────────────────────────────────────────
   A plastic yard skeleton, the kind people set out for October, standing at the helm of the
   family's center console where it lies at the float: one bony hand on the wheel, the other up in
   a wave, a sun-faded red fishing cap on his skull. The joke is that he is waiting to go fishing.

   He is drawn at ten units to the scene unit, the way the faces in the oak and the loft are, with
   y=0 on the boat's cockpit sole under his feet and x=0 at his spine, the boat facing -x. His hips
   stand to the bow, his chest is turned a little toward us and his skull faces us, because a yard
   skeleton is posed to wave at the house. What has to survive on a phone is about nine pixels of him
   over the gunwale: a white skull under a red cap with two dark eye sockets, the ribcage as a few
   white bars, one arm down to the console and one up in the air. The grin, the teeth, the finger
   bones and the cap's green underbrim are for the close-up. He is a cartoon's proportions, a big
   skull on a small frame, because at that size the skull is what says skeleton.

   The scene draws him at BFT_BONES_AT inside the boat's rock joint, after the boat, so he rides the
   chop with it and stands in front of the console, the T-top's legs and the leaning post. Being in
   front of the hull too, he is cut at the gunwale (a static clip along the boat's own sheer), so his
   legs are behind the hull side the way a skipper's are and nothing of him hangs over the water. He
   brings the boat's wheel, on the console's aft face, for his hand to be on.

   The waving forearm is its own joint at the elbow (bft-bones-wave): a slow wave now and then, three
   swings and a long rest, phased off the wall clock, and still, hand up, under reduced motion. That
   is the holiday's licence the bats and the witch have: motion for fun, a transform only. After dark
   (the sun 6° under) the bones glow the soft green of glow-in-the-dark plastic, written as rgb() so
   neither the scene nor the look tones it toward the night, the way the dock's lit lamp is. */
INK.bftBones={bone:"#F2ECDD",hollow:"#4A3A48",eye:"#20172A",nose:"#2A1F2C",grin:"#4A3A48",detail:"#9A8A86",
  cap:"#C0685A",seam:"#94463E",underbrim:"#4F6E58",wheel:"#2D2E34",hub:"#C9CFD3",
  /* glow-in-the-dark plastic: a pale green the night does not tone */
  boneGlow:"rgb(214,242,208)",
  ink:"#2A1B33",shade:"#3A2350",lit:"#FFE6B0",shadeOp:.3,litOp:.45};
/* where he stands in the boat, in boat units (rigBftBoat: y=0 the waterline, the console's aft face at
   about x 2, the leaning post's bolster from 3.05 to 5.95): his spine 4.2 aft of the boat's centre,
   between the console and the leaning post with the bolster showing either side of his hips, his feet
   on the sole 0.9 over the waterline, and his drawing at a tenth. His cap's button tops out at boat
   y -11, under the T-top's canopy (-11.5); the gunwale crosses him at about boat y -3.2, his y -23 */
const BFT_BONES_AT={x:4.2,y:-.9,s:.1};
/* his line, a little lighter than the boat's, so a bone half a pixel wide stays white on a phone */
const BFT_BONES_O={line:.6,heavy:.3,shade:.8,lit:.5};
/* the wave: a 24 s cycle, the hand swung out and back twice over about four seconds (17° out, 7° in,
   which keeps the fingers clear of his skull) and a long rest with the hand up.
   The scene phases it off the wall clock, rigBftBones({wave:phase(BFT_BONES_WAVE)}), and passes no
   style under reduced motion, which leaves the joint without an animation */
const BFT_BONES_WAVE=24;
const BFT_BONES_CSS=`#sceneFx .bft-bones-wave[style]{animation:bftBonesWave ${BFT_BONES_WAVE}s ease-in-out infinite}
@keyframes bftBonesWave{0%,78%,100%{transform:rotate(0)}81%{transform:rotate(17deg)}84%{transform:rotate(-7deg)}87%{transform:rotate(17deg)}90%{transform:rotate(-7deg)}93%{transform:rotate(8deg)}96%{transform:rotate(0)}}`;
/* the boat's sheer (dock.js's bftBoatSheer, its own copy where dock.js is not loaded), in boat units */
const bftBonesSheer=x=>{if(typeof bftBoatSheer==="function")return bftBoatSheer(x);const s=Math.max(0,Math.min(1,(10.4-x)/23.4));return -2.9-.45*s-2.85*s**2.4};
/* the gunwale under him, in his units: the sheer, less the outer half of the hull's own ink line, so his
   cut bones stop on the hull's line and never cover it. k is the screen pixels to a scene unit (the
   scene's own k: 1.22 on a 390 phone, where the boat's .85px line is .35 of a boat unit) */
const bftBonesGunwale=(x,k=1.22)=>(bftBonesSheer(BFT_BONES_AT.x+x*BFT_BONES_AT.s)-BFT_BONES_AT.y)/BFT_BONES_AT.s
  -(typeof BFT_BOAT_O!=="undefined"?BFT_BOAT_O.line:.85)/2/k/BFT_BONES_AT.s;
let BFT_BONES_N=0;

/**
 * The skeleton captain, back to front: the wheel on the console's aft face, his legs and pelvis (cut at
 * the gunwale), the ribcage, the arm down to the wheel, the skull, the cap, the waving upper arm, then
 * the forearm and the hand on their elbow joint (bft-bones-wave). Options:
 *   wave: the style for the wave joint (the scene passes phase(BFT_BONES_WAVE); "" holds it still)
 *   glow: the glow-in-the-dark bones, from the sun 6° under
 *   cut:  cut him at the boat's gunwale (default); false draws his legs whole
 *   k:    the scene's screen pixels to a scene unit, which the cut allows for the hull's line (1.22)
 * Returns layers for inkRig in his own units, y=0 on the sole.
 */
function rigBftBones({wave="",glow=false,cut=true,k=1.22}={}){
  const bone=glow?"boneGlow":"bone",in_={noSil:true},flat={capStart:false,capEnd:false};
  const oval=(cx,cy,rx,ry,rot=0,n=14)=>{const a=rot*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
    return Array.from({length:n},(_,i)=>{const t=i/n*Math.PI*2,x=Math.cos(t)*rx,y=Math.sin(t)*ry;return[cx+x*ca-y*sa,cy+x*sa+y*ca]})};
  /* the wheel: a short shaft out of the console's aft face, the rim seen nearly edge on and leaning
     aft at the top the way a helm is set toward the driver, and a chrome hub */
  const wheel=[pTaper([[-22.4,-45.6,1.8],[-17.8,-45.8,1.6]],"wheel",{capStart:false}),
    part(inkSpline(oval(-17.8,-45.8,2.6,7.3,12,16),true)+" "+inkSpline(oval(-17.8,-45.8,1,5.7,12,16).reverse(),true),"wheel"),
    pDot(-17.8,-45.8,1.15,"hub")];
  /* the far leg, behind the pelvis: thigh, knee, shin and a foot turned to the bow */
  const legFar=[pTaper([[-5.8,-39.6,5.2],[-6.4,-29,4.4],[-6.8,-19,5]],bone),pDot(-6.8,-18.6,3.2,bone),
    pTaper([[-6.8,-18,4.6],[-6.8,-9,3.8],[-6.6,-3.4,4.2]],bone),
    pBlob([[-4.6,-4],[-9,-3.2],[-12.4,-1.8],[-12.2,-.2],[-4.2,-.2]],bone)];
  /* the near leg, the pelvis and the lumbar spine: one mass of bone. The pelvis is a butterfly, its
     wings flaring up from the hip joints, the two holes low in it and slanting in (level and round,
     with the arch between them, they made a second face), and the spine runs up out of it */
  const hips=[pTaper([[4.8,-39.6,5.2],[5.4,-29,4.4],[5.8,-19,5]],bone),pDot(5.8,-18.6,3.2,bone),
    pTaper([[5.8,-18,4.6],[5.7,-9,3.8],[5.6,-3.4,4.2]],bone),
    pBlob([[7.2,-4],[2.8,-3.2],[-.6,-1.8],[-.4,-.2],[7.4,-.2]],bone),
    pTaper([[-1,-54,5],[-1.1,-50.5,4.6],[-1,-46,5]],bone),
    pBlob([[-11.6,-48.6],[-7.8,-47.2],[-4.2,-45.9],[-1,-46.9],[2.2,-45.9],[5.8,-47.2],[9.6,-48.6],[10.8,-45.6],[9.2,-41.8],[6.8,-39.2],[3.6,-37],[-1,-36.2],[-5.6,-37],[-8.8,-39.2],[-11.2,-41.8],[-12.8,-45.6]],bone),
    pBlob(oval(-4.6,-40.6,1.25,2.1,-34),"hollow",in_),pBlob(oval(2.6,-40.6,1.25,2.1,34),"hollow",in_),
    pTaper([[-3,-52.9,.6],[1,-52.9,.6]],"hollow",flat,in_),pTaper([[-3.1,-50.2,.6],[1.1,-50.2,.6]],"hollow",flat,in_)];
  /* the ribcage: one white cage with the gaps between its ribs drawn in, three a side bowing down to
     the outside and stopping short of the edge, the breastbone between them and the arch of the
     lower ribs under it, the collarbones along the top */
  const gaps=[];
  for(const[y,w]of[[-64.9,1.9],[-61,2],[-57.1,1.75]])
    gaps.push(pTaper([[1.3,y,.6],[5,y+.35,w],[8.4,y+1.9,.5]],"hollow",{},in_),pTaper([[-3.3,y,.6],[-7,y+.35,w],[-10.4,y+1.9,.5]],"hollow",{},in_));
  const cage=[pBlob([[-8.4,-68.2],[-3.2,-69.3],[1.4,-69.3],[6.6,-68.2],[9.9,-65.2],[11,-60.6],[10.4,-56],[8.8,-52.8],[5.8,-51.7],[2.6,-53],[-1,-55.9],[-4.6,-53],[-7.8,-51.7],[-10.8,-52.8],[-12.4,-56],[-12.9,-60.8],[-11.8,-65.4]],bone),...gaps];
  /* the arm down to the wheel: the shoulder, the elbow at his side, the hand round the rim's aft edge
     with its fingers curled over to the far side */
  const armFar=[pDot(-11.2,-65.6,3.4,bone),pTaper([[-11.6,-65,5],[-13.6,-61.6,4.4],[-14.8,-58.2,4.8]],bone),pDot(-14.9,-57.8,3,bone),
    pTaper([[-14.9,-57.4,4.2],[-14.9,-54.2,3.6],[-14.6,-51.4,3.9]],bone),
    pBlob([[-13,-51.6],[-13.4,-49.6],[-13.3,-47.6],[-14.6,-46.8],[-16.3,-47.4],[-16.8,-49.4],[-16.4,-51.4],[-14.8,-52.4]],bone),
    pTaper([[-15.8,-50.9,1.8],[-17.6,-50.8,1.5],[-18.9,-49.9,1.3]],bone),pTaper([[-15.8,-48.6,1.8],[-17.5,-48.5,1.5],[-18.7,-47.9,1.25]],bone)];
  /* the skull, turned to us and a little to the bow: a round cranium, the cheekbones, a narrower jaw,
     two dark eye sockets well apart, the nose's upturned heart and a thin grin with its teeth */
  const skull=[pTaper([[-1.4,-68.6,4.6],[-1.5,-72.8,4.4]],bone),
    pBlob([[-1.2,-97.7],[5.8,-96.5],[10.9,-92.5],[12.7,-86.7],[12,-81.1],[9.7,-77.8],[6.8,-75.7],[-1.5,-74.9],[-9.4,-75.7],[-12.6,-78.4],[-14.4,-84],[-13.9,-90.9],[-9.7,-96.1]],bone),
    pBlob([[-9.9,-76.7],[-9.2,-72.8],[-6.7,-70.5],[-2.8,-69.7],[1.3,-70.3],[4.9,-72.1],[7,-75.9],[-1.5,-77.3]],bone),
    pBlob([[.8,-84.2],[1.8,-86.7],[4.2,-87.2],[6.2,-85.6],[6.6,-82.6],[5.4,-80.3],[3,-80],[1.2,-81.6]],"eye"),
    pBlob([[-5.1,-84.4],[-6.1,-86.6],[-8.1,-87],[-9.9,-85.4],[-10.1,-82.6],[-8.9,-80.4],[-6.9,-80.1],[-5.3,-81.6]],"eye"),
    pBlob([[-2.1,-79.9],[-1.45,-80.4],[-1.2,-79.7],[-2.1,-78.5],[-3,-79.7],[-2.75,-80.4]],"nose"),
    pTaper([[-8,-74.7,.4],[-5.4,-73.75,.65],[-2.1,-73.4,.7],[1.4,-73.7,.65],[4.4,-74.7,.4]],"grin",{},in_),
    ...[-6.4,-4.3,-2.1,.1,2.3].map(x=>pTaper([[x,-75.2,.34],[x+.05,-72,.34]],"detail",flat,in_))];
  /* the cap: a crown of panels on the dome, a button on top and the seams down the front, the band
     over the brow, and the bill out to the bow with its old green underbrim showing under its edge */
  const cap=[pBlob([[-14.4,-90.4],[-14,-94.2],[-10.6,-98.4],[-4,-100.9],[2.9,-100.9],[8.6,-98.6],[12,-94.6],[12.9,-91.2],[12,-90.3],[5.4,-90.8],[-1.9,-91.1],[-9,-91]],"cap"),
    pBlob([[-2.8,-91.7],[-9.4,-92.7],[-16.5,-92.9],[-22.2,-91.9],[-24,-90.2],[-22.2,-89.2],[-16.5,-89],[-9.7,-89.6],[-4.2,-90.4]],"cap"),
    pTaper([[-4.4,-90.3,.65],[-10.4,-89.65,1.2],[-17.6,-89.55,1.1],[-23.2,-90,.4]],"underbrim",{},in_),
    pTaper([[-.6,-100.6,.5],[-3.4,-96.2,.6],[-5.4,-91.6,.45]],"seam",{},in_),pTaper([[-.6,-100.6,.45],[3.8,-96.6,.55],[5.8,-91.4,.4]],"seam",{},in_),
    pDot(-.6,-101.1,.9,"cap")];
  /* the waving arm: the near shoulder out to the elbow; the forearm and the hand are the joint */
  const armUp=[pDot(10.6,-66,3.4,bone),pTaper([[11,-65.6,5],[15.4,-63.6,4.4],[19.8,-62,4.8]],bone),pDot(20,-62,3,bone)];
  /* the forearm's two bones, the wrist, an open palm and four fingers spread, the thumb toward his
     head: waving at the house */
  const hand=[pTaper([[20.2,-62.2,4.4],[20.9,-67.6,3.6],[21.3,-72.6,4]],bone),
    pTaper([[20.5,-64.6,.5],[20.9,-68,.9],[21.05,-71,.5]],"hollow",{},in_),
    pDot(21.4,-73.4,2.5,bone),
    pBlob([[19.2,-73.8],[18.6,-76.6],[19.4,-79],[21.6,-79.8],[23.8,-79],[24.4,-76.2],[23.4,-73.8]],bone),
    pTaper([[19.7,-78.6,1.8],[18.9,-81.8,1.45],[18.4,-84,1.25]],bone),pTaper([[20.9,-79.2,1.8],[20.6,-82.8,1.45],[20.4,-85.2,1.25]],bone),
    pTaper([[22.2,-79.2,1.8],[22.4,-82.8,1.45],[22.5,-85,1.25]],bone),pTaper([[23.4,-78.6,1.75],[24.1,-81.4,1.4],[24.5,-83.4,1.2]],bone),
    pTaper([[19.2,-76.6,1.8],[17.6,-78,1.45],[16.6,-79.4,1.25]],bone)];
  /* the gunwale: a still clip over his legs and pelvis along the boat's sheer, so they go behind the
     hull side. The clip is in his units and never moves; the boat's rock carries it with him */
  let low=[{parts:legFar},{parts:hips}];
  if(cut){const id=`bftBonesGw${++BFT_BONES_N}`,xs=[];for(let x=-30;x<=30;x+=5)xs.push(`${f1(x)} ${f1(bftBonesGunwale(x,k))}`);
    low=[{open:`<g clip-path="url(#${id})"><clipPath id="${id}"><path d="M -30 -130 L 30 -130 L ${xs.reverse().join(" L ")} Z"/></clipPath>`,pivot:[0,0],layers:low}]}
  return[{parts:wheel},...low,{parts:cage},{parts:armFar},{parts:skull},{parts:cap},{parts:armUp},
    {open:`<g class="bft-bones-wave"${wave?` style="${wave}"`:""}>`,pivot:[20,-62],layers:[{parts:hand}]}];
}

/* ── the looks ───────────────────────────────────────────────────────────────────────────────
   "skeleton" is him in the family's boat as the scene draws him: the boat first, inked with its own
   palette and line (BFT_BOAT_O), then him over it at BFT_BONES_AT with his. The look tool inks a part
   once per panel with one line, so the boat comes in under him through `extra`, which is told the
   panel's light but not its scale; it is called in look.mjs's fixed order (the close-up, then noon,
   golden and night at phone size, then beside the heron), and the order says which scale to ink the
   boat at. It is called just before draw() in each panel, so it hands draw() that scale too. rigBftBoat is in dock.js, which the page loads before this file; the look tool loads each
   part file on its own, so there (in node, and only there) dock.js is read into this file's scope */
let BFT_BONES_DOCK=null,BFT_BONES_LOOK_LAST=null,BFT_BONES_LOOK_K=1.22;
function bftBonesBoat(){
  if(typeof rigBftBoat==="function")return{rig:rigBftBoat(),pal:INK.bftBoat};
  if(!BFT_BONES_DOCK){
    const gb=typeof process!=="undefined"&&process.getBuiltinModule;
    if(!gb)throw new Error("the skeleton captain's look needs rigBftBoat (tools/beaufort/parts/dock.js)");
    const fs=gb("fs"),pth=gb("path");
    BFT_BONES_DOCK=eval(fs.readFileSync(pth.join(pth.dirname(process.argv[1]),"parts","dock.js"),"utf8")+"\n;rigBftBoat");
  }
  return{rig:BFT_BONES_DOCK(),pal:INK.bftBoat};
}
function bftBonesLookBoat(st,lt){
  const kind=lt.night?"night":lt.gold?"golden":BFT_BONES_LOOK_LAST==="close"?"noon":BFT_BONES_LOOK_LAST==="night"?"heron":"close";
  BFT_BONES_LOOK_LAST=kind;
  const L=LOOK.skeleton,[,,bw]=L.box,args=typeof process!=="undefined"?process.argv:[],sc=args.indexOf("--scale");
  const big=sc>=0?+args[sc+1]:Math.max(1,Math.min(14,620/(bw*L.s)));
  /* screen px to a boat unit in this panel, which draw() is then handed for the cut at the gunwale */
  const px=BFT_BONES_LOOK_K=(kind==="close"?big:1.22)*L.s/BFT_BONES_AT.s;
  const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const mix=(a,b,t)=>"#"+hex(a).map((v,i)=>Math.round(v+(hex(b)[i]-v)*t).toString(16).padStart(2,"0")).join("");
  const{rig,pal}=bftBonesBoat(),d=L.dist,p={};
  for(const[k,v]of Object.entries(pal)){let c=v;
    if(kind!=="close"&&/^#[0-9a-f]{6}$/i.test(v)&&!["ink","shade","lit"].includes(k)){if(lt.warm)c=mix(c,lt.warm,.3*lt.gold);if(lt.night)c=mix(c,"#15223D",.62*lt.night);c=mix(c,lt.haze,d*.72)}
    p[k]=c}
  if(kind!=="close")Object.assign(p,{ink:mix(lt.ink,lt.haze,d*.7),shade:lt.shade,lit:lt.lit,litOp:(pal.litOp??.5)*(lt.night?.55:1)});
  const k=1/BFT_BONES_AT.s;
  return `<rect x="-400" y="${f1(-BFT_BONES_AT.y*k)}" width="800" height="100" fill="${lt.water||"#7FB2C9"}" opacity=".7"/>`
    +inkAt(-BFT_BONES_AT.x*k,-BFT_BONES_AT.y*k,k,1,inkRig(rig,p,{s:px,light:kind==="close"?[1,-.5]:lt.light,line:.85,heavy:.45,shade:1.2,lit:.8}));
}
const BFT_BONES_STATES={day:{glow:false},night:{glow:true}};
/* the boat's box (-15,-21 to 15,3 in boat units) in his units */
LOOK["skeleton"]={pal:INK.bftBones,box:[-192,-201,300,240],s:.1,dist:.04,o:BFT_BONES_O,ground:false,
  states:BFT_BONES_STATES,css:BFT_BONES_CSS.replace(/#sceneFx /g,""),
  draw:st=>rigBftBones({...st,k:BFT_BONES_LOOK_K}),extra:(st,lt)=>bftBonesLookBoat(st,lt)};
/* him alone, legs and all, for the close-up */
LOOK["skeleton-alone"]={pal:INK.bftBones,box:[-26,-104,54,106],s:.1,dist:.04,o:BFT_BONES_O,ground:false,
  states:BFT_BONES_STATES,css:BFT_BONES_CSS.replace(/#sceneFx /g,""),
  draw:st=>rigBftBones({...st,cut:false})};
