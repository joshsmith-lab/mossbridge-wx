/* ── Beaufort: the town's steeples over the far shore ─────────────────────────────────────────
   Josh, on the first Beaufort drawing: "the bridge looks great but the background behind it steals
   its silhouette a bit. use church steeples instead as if looking from the waterway out to the bridge
   with the steeples behind." So the far line is the town seen from the Beaufort River, low and pale,
   and out of it stand the two steeples that make Beaufort's skyline: steeples are the tallest things
   downtown, and a local painter's river views name St. Helena's and the Baptist Church of Beaufort as
   the ones that dominate it.

   Where they stand, from the water. The Woods Memorial Bridge runs north and south, from Carteret
   Street on the bluff to Lady's Island, and the waterway passes through it east and west, so a boat on
   it sees the bridge side on. Both steeples stand north and west of the bridge's town end
   (OpenStreetMap: St. Helena's 32.4340 -80.6745, the Baptist church 32.4346 -80.6733, the swing span
   about 32.4275 -80.6691), so from the river they stand behind the town end of the bridge and beyond
   it, never over its middle. Coming in from the east, the town end is on the right: St. Helena's first,
   then the Baptist church about four degrees further right. The scene keeps that order and side, and
   pulls the pair in toward the bridge (truly they are 25 to 30 degrees off), into the open sky between
   the swing span and the palmettos.

   The town stands between the bridge and them. Its waterfront oaks crest a little over the town
   approach's rail, from just past the first street light to the palmettos, and the steeples rise out of
   those trees: with nothing between the rail and the belfries they read as towers built on the bridge.
   (Roofs among the oaks, drawn in the trees' own colour, did not read at phone size, and pale house
   fronts under them read as one more thing on the rail beside the steeples, so the town is its trees.) Behind the swing span and over Lady's Island the far line stays
   low, so the truss stands in open sky.

   The two, drawn from photographs (HABS SC-460 and SC-290, Wikimedia Commons):
   - The Parish Church of St. Helena (1724; this steeple 1942, by Albert Simons after a period design,
     the old spire having come down in 1861). A white stuccoed square tower at the west end: a tall
     shaft with a round-arched window and corner quoins under a full cornice, a shorter stage with a
     round oculus, then an octagonal open belfry, round arches between pilasters with a balustrade in
     each, its own entablature, and a verdigris copper spire, bell-cast at its foot, with a ball and a
     cross. The green spire is the one on the postcards, and it is what tells the two apart at any
     distance, so its copper is kept a clear green after the air has had it.
   - The Baptist Church of Beaufort (1844, Greek Revival, white stucco; the steeple added in 1961).
     The temple front's pediment with its round window, and rising behind it off the ridge a white
     clapboard square tower with a round louvred wheel on each face, a deep cornice, a square belfry
     with tall arched louvres, little pediments over each face, and a tall white needle spire with a
     ball and vane. The taller and slimmer of the two.
   Not drawn: Tabernacle Baptist (its red spire is a block further inland and nothing shows it on the
   river skyline; at phone size it was a red cone on the rail), Carteret Street Methodist and First
   Presbyterian (no steeple found that shows from the river).
   Heights: no published figures were found, so they are measured off the photographs against doors
   and windows (St. Helena's about 115 ft, the Baptist church about 125), and drawn true to each other
   at 6.75 ft a scene unit: with the bluff under them they stand 18.6 and 20.2 units over the far
   waterline, a few units over the swing span's 15.8. (Strictly, a mile off beside a bridge drawn at 5.4
   ft a unit half a mile off they would be smaller still; at that size they were hairlines on a phone.)

   Units: each is drawn in its own units, 0.75 ft each, and placed at s=1/BFT_STEEPLE_Z (nine of them to
   the scene unit), the way the faces in the oak and the loft are drawn large and scaled down, so the
   kit's tenth-of-a-unit rounding never stair-steps a belfry arch. y=0 is the ground at the church's
   foot, x=0 the tower's centreline. */
INK.bftSteeple={
  wall:"#F3F0E6",trim:"#D9D5C8",roof:"#5A5E61",copper:"#3E9C66",copperLt:"#71C493",spire:"#F7F5EE",
  louvre:"#5E6468",glass:"#4C545A",gilt:"#C7A250",detail:"#FBFAF6",
  ink:"#2A2130",shade:"#3A2350",lit:"#FFE6B0",shadeOp:.26,litOp:.36};
const BFT_STEEPLE_Z=9;
/* the line the scene inks them with, in screen pixels: lighter than the bridge's, because they stand
   further off and must never out-ink it */
const BFT_STEEPLE_INK={line:.48,heavy:.16,shade:.45,lit:.34};
/* the town's ground over the far waterline (the bluff is twenty-odd feet over the river), scene units */
const BFT_STEEPLE_BLUFF=1.6;

/* shapes, in drawing units, y up is negative */
const bftSteeplePoly=(P,role,x)=>part(`M ${P.map(p=>`${f1(p[0])} ${f1(p[1])}`).join(" L ")} Z`,role,x);
const bftSteepleBox=(x0,y0,x1,y1,role,x)=>bftSteeplePoly([[x0,y0],[x1,y0],[x1,y1],[x0,y1]],role,x);
/* a round-headed opening: its sill at yb, h tall to the top of the arch, w wide */
function bftSteepleArch(cx,yb,w,h,role,x){
  const r=w/2,yt=yb-h+r;
  return part(`M ${f1(cx-r)} ${f1(yb)} L ${f1(cx-r)} ${f1(yt)} A ${f1(r)} ${f1(r)} 0 0 1 ${f1(cx+r)} ${f1(yt)} L ${f1(cx+r)} ${f1(yb)} Z`,role,x);
}
/* a ring and a disc: an oculus, a louvred wheel, a ball */
const bftSteepleRing=(cx,cy,r0,r1,role,x)=>part(`M ${f1(cx-r1)} ${f1(cy)} a ${f1(r1)} ${f1(r1)} 0 1 0 ${f1(2*r1)} 0 a ${f1(r1)} ${f1(r1)} 0 1 0 ${f1(-2*r1)} 0 Z M ${f1(cx-r0)} ${f1(cy)} a ${f1(r0)} ${f1(r0)} 0 1 1 ${f1(2*r0)} 0 a ${f1(r0)} ${f1(r0)} 0 1 1 ${f1(-2*r0)} 0 Z`,role,x);
/* a spire: octagonal and seen square on, so a middle face between two hip lines. From its foot at y0
   (half width w0) to its tip at y1 (half width w1); flare bell-casts the foot out over an eave,
   flare wide and flareH tall */
function bftSteepleSpire(y0,w0,y1,w1,role,{flare=0,flareH=0,lt=null}={}){
  const out=[],P=[];
  if(flare){P.push([-flare,y0],[-w0-(flare-w0)*.35,y0-flareH*.45],[-w0,y0-flareH])}else P.push([-w0,y0]);
  P.push([-w1,y1],[w1,y1]);
  if(flare){P.push([w0,y0-flareH],[w0+(flare-w0)*.35,y0-flareH*.45],[flare,y0])}else P.push([w0,y0]);
  out.push(bftSteeplePoly(P,role));
  /* the middle face catches the light a shade differently from the two diagonal faces beside it */
  if(lt){const k=.41,yb=y0-flareH;out.push(bftSteeplePoly([[-w0*k,yb],[-w1*k,y1],[w1*k,y1],[w0*k,yb]],lt,{noSil:true}))}
  return out;
}
/* a cross on a rod: from y0 up to y1, its arm at ya */
function bftSteepleCross(y0,y1,ya,arm,w,role){
  return[bftSteepleBox(-w/2,y0,w/2,y1,role),bftSteepleBox(-arm/2,ya-w/2,arm/2,ya+w/2,role)];
}

/* The Parish Church of St. Helena: 153 drawing units, about 115 ft, to the top of the cross. The
   proportions are the photographs': the spire about as tall as the belfry's cornice is wide, its flared
   foot a little over half that width, the octagon about three quarters as tall as it is wide */
function bftSteepleStHelena(){
  const P=[];
  /* the shaft: square, quoined, a tall round-arched window under its cornice */
  P.push(bftSteepleBox(-14.5,0,14.5,-64,"wall"));
  for(let y=-2;y>-62;y-=6){const l=(Math.round(-y/6)%2)?3.4:2.2;
    P.push(bftSteepleBox(-14.5,y,-14.5+l,y-3.5,"trim",{noSil:true}),bftSteepleBox(14.5-l,y,14.5,y-3.5,"trim",{noSil:true}))}
  P.push(bftSteepleArch(0,-43,6,16,"glass",{noSil:true}),bftSteepleBox(-4.2,-43,4.2,-41.6,"detail",{noSil:true}));
  P.push(bftSteepleBox(-15.4,-62.6,15.4,-63.8,"trim"),bftSteepleBox(-16.4,-63.6,16.4,-67.2,"trim"));
  /* the oculus stage, a step in, its round louvred oculus in a moulded ring */
  P.push(bftSteepleBox(-13,-67,-13+26,-87,"wall"));
  for(const sd of[-1,1])P.push(bftSteepleBox(sd*13-(sd>0?2.6:0),-67.4,sd*13+(sd<0?2.6:0),-86.6,"trim",{noSil:true}));
  P.push(bftSteepleRing(0,-77,4,5.3,"trim",{noSil:true}),pDot(0,-77,4,"louvre",{noSil:true}));
  for(const dy of[-2.1,0,2.1])P.push(bftSteepleBox(-3.3,-77+dy-.35,3.3,-77+dy+.35,"detail",{noSil:true}));
  P.push(bftSteepleBox(-15.2,-86.6,15.2,-90,"trim"));
  /* the octagonal belfry on its plinth: three faces show, the middle one full and the two diagonal
     ones foreshortened, each a round arch between pilasters with a balustrade across its foot */
  P.push(bftSteepleBox(-11.6,-89.8,11.6,-93,"wall"),bftSteepleBox(-11.6,-92.8,11.6,-110.6,"wall"));
  for(const[cx,w]of[[0,6],[-8.15,3.4],[8.15,3.4]]){
    P.push(bftSteepleArch(cx,-93.8,w,15.2,"louvre",{noSil:true}));
    P.push(bftSteepleBox(cx-w/2,-97.6,cx+w/2,-98.8,"detail",{noSil:true}));
    const n=w>4?4:2;for(let i=0;i<n;i++){const bx=cx-w/2+w*(i+.5)/n;P.push(bftSteepleBox(bx-.35,-93.8,bx+.35,-97.6,"detail",{noSil:true}))}
  }
  for(const x of[-4.85,4.85])P.push(bftSteepleBox(x-.45,-93.4,x+.45,-110.2,"trim",{noSil:true}));
  P.push(bftSteepleBox(-12.8,-110.4,12.8,-112.8,"trim"),bftSteepleBox(-13.6,-112.6,13.6,-114.2,"trim"));
  /* the spire: verdigris copper, bell-cast over the belfry's cornice, a band near the top, the ball
     and the cross. Its foot is a shade broader than the photographs' (5.8 for about 5.2), so the green
     is still a patch and not a thread at phone size */
  P.push(...bftSteepleSpire(-114,5.8,-143.4,1,"copper",{flare:8.9,flareH:3.8,lt:"copperLt"}));
  P.push(bftSteepleBox(-2.1,-137.6,2.1,-138.7,"copper"));
  P.push(pDot(0,-145.1,1.7,"gilt"));
  P.push(...bftSteepleCross(-146.5,-153,-150.4,3.6,.8,"gilt"));
  /* the nave, seen from the river at its east end, in front of the tower's foot: stuccoed, its hipped
     roof's eave about 28 ft up. The trees hide it from the water */
  P.push(bftSteepleBox(-26,0,26,-34,"wall"),bftSteeplePoly([[-27.6,-33.6],[-15,-44.5],[15,-44.5],[27.6,-33.6]],"roof"));
  for(const x of[-17,17])P.push(bftSteepleArch(x,-8,5,15,"glass",{noSil:true}));
  return P;
}
/* The Baptist Church of Beaufort: 167 drawing units, about 125 ft, to the vane */
function bftSteepleBaptist(){
  const P=[];
  /* the steeple stands on the ridge behind the temple front, so it goes down first */
  P.push(bftSteepleBox(-13,-50,13,-87,"wall"));
  for(let y=-53;y>-86;y-=2.4)P.push(bftSteepleBox(-12.4,y,12.4,y-.32,"trim",{noSil:true}));
  P.push(bftSteepleRing(0,-71,4.6,5.9,"trim",{noSil:true}),pDot(0,-71,4.6,"louvre",{noSil:true}));
  for(let a=0;a<8;a++){const t=a*Math.PI/8,c=Math.cos(t),s=Math.sin(t);
    P.push(bftSteeplePoly([[-c*4.4-s*.28,-71-s*4.4+c*.28],[c*4.4-s*.28,-71+s*4.4+c*.28],[c*4.4+s*.28,-71+s*4.4-c*.28],[-c*4.4+s*.28,-71-s*4.4-c*.28]],"detail",{noSil:true}))}
  P.push(bftSteepleBox(-16.2,-86.6,16.2,-91.4,"trim"),bftSteepleBox(-14.6,-85.8,14.6,-87.2,"trim"));
  /* the square belfry, corner pilasters, one tall arched louvre a face, a little pediment over each */
  P.push(bftSteepleBox(-9.6,-91.2,9.6,-114,"wall"));
  for(const s of[-1,1])P.push(bftSteepleBox(s*9.6-(s>0?2:0),-91.6,s*9.6+(s<0?2:0),-113.6,"trim",{noSil:true}));
  P.push(bftSteepleArch(0,-95,5.2,15.6,"louvre",{noSil:true}));
  for(let y=-96.8;y>-108;y-=1.9)P.push(bftSteepleBox(-2.3,y,2.3,y-.45,"detail",{noSil:true}));
  P.push(bftSteepleBox(-11.6,-113.8,11.6,-117.6,"trim"),bftSteeplePoly([[-11.2,-117.4],[0,-122.8],[11.2,-117.4]],"wall"));
  P.push(bftSteeplePoly([[-11.6,-117.2],[0,-123.4],[11.6,-117.2],[10.4,-117.2],[0,-121.9],[-10.4,-117.2]],"trim",{noSil:true}));
  /* the needle */
  P.push(...bftSteepleSpire(-120,6.6,-160.4,.55,"spire",{lt:"detail"}));
  P.push(bftSteepleBox(-1.9,-131,1.9,-132,"trim",{noSil:true}));
  P.push(pDot(0,-161.6,1.35,"gilt"));
  P.push(bftSteepleBox(-.35,-162.6,.35,-167,"gilt"),bftSteeplePoly([[-3.4,-165.4],[2.4,-165.4],[3.6,-166],[2.4,-166.6],[-3.4,-166.6]],"gilt"));
  /* the temple front: its pediment (the round window in it) over the eave, the cornice along the rakes;
     the body and its portico, hidden by the trees from the river, go under it */
  P.push(bftSteepleBox(-40,0,40,-40,"wall"),bftSteepleBox(-17,-4,17,-35,"glass",{noSil:true}));
  for(const x of[-7.5,7.5])P.push(bftSteepleBox(x-2.6,-3,x+2.6,-35.4,"wall",{noSil:true}));
  P.push(bftSteepleBox(-42,-37.6,42,-41.4,"trim"));
  P.push(bftSteeplePoly([[-43.2,-41],[0,-59.6],[43.2,-41]],"wall"));
  P.push(bftSteeplePoly([[-43.6,-40.6],[0,-60.4],[43.6,-40.6],[40.6,-40.6],[0,-57.6],[-40.6,-40.6]],"trim",{noSil:true}));
  P.push(bftSteepleRing(0,-47.6,2.6,3.5,"trim",{noSil:true}),pDot(0,-47.6,2.6,"louvre",{noSil:true}));
  return P;
}
/* the steeples by name: their drawing, and how wide they stand at their widest over the trees and how
   tall, in drawing units */
const BFT_STEEPLES={
  sthelena:{draw:bftSteepleStHelena,half:17,tall:153,box:[-34,-158,68,162]},
  baptist:{draw:bftSteepleBaptist,half:16.5,tall:167,box:[-46,-172,92,176]},
};
/** propBftSteeple(name): the parts of one steeple, "sthelena" or "baptist", in drawing units
 *  (BFT_STEEPLE_Z to the scene unit, so placed at s=1/BFT_STEEPLE_Z), y=0 its ground and x=0 its
 *  tower's centreline. */
function propBftSteeple(name){
  const S=BFT_STEEPLES[name];
  return S?S.draw():[];
}

/* the approach's street lights, {x, lx} from the pivot: the bridge's own (bftBridgePoles) when bridge.js
   is loaded, as it is in the scene; otherwise (tools/beaufort/look.mjs loads each part on its own) the
   same rule written out: a bent about every 9.8 units out from each rest pier, a pole on every third
   one starting with the first, set 1.2 in from it, its head 1.25 further toward the river */
function bftSteeplePoles(br){
  if(typeof bftBridgePoles==="function")return bftBridgePoles(br);
  const P=[];
  for(const[side,len]of[[-1,br.left],[1,br.right]]){const run=len-23,n=Math.max(1,Math.round(run/9.8)),sp=run/n;
    for(let i=1;i<=n;i++){const x0=side*(23+i*sp);if(Math.abs(x0)>=len-.01||(i-1)%3)continue;const x=x0-side*1.2;P.push({x,lx:x-side*1.25})}}
  return P;
}
/* how far apart the two stand, in scene units (St. Helena's to the Baptist church): about three of the
   four degrees between them, so the pair sits to the left of its street-light bay and never centred in
   it, the way a pair of the bridge's own posts would be */
const BFT_STEEPLE_GAP=12.6;
/* the town's oaks over the approach's rail, in scene units over the far waterline: the rail's top is
   at about 8.1 beside the swing span, the street lights' heads at 12.3 */
const BFT_STEEPLE_TOWN={crest:9.3,rise:1.2,stH:.5,bap:-.3,rail:8.3};
/**
 * bftSkyline({W, brX, yFar, seed, keep, bridge, palms, clear}) lays out the far shore for a frame W scene
 * units wide with the bridge's pivot at brX and the far waterline at yFar. Returns
 *   d:        the far shore's silhouette, one closed path in scene units: Lady's Island's low wood on the
 *             left, dipping lower behind the swing span, the town on the right, and over the town
 *             approach's rail from just past its first street light to the palmettos, the town's
 *             waterfront oaks, out of which the steeples rise;
 *   palms:    a path of two low palmettos on Lady's Island, standing where the far line is open (left
 *             of the swing span's band, right of clear, off the street lights), or "" when there is no
 *             such room, as on every phone (clear is where the oak's crown ends, .5W by default);
 *   steeples: [{name, x, y, s}], where each stands (y its ground, the bluff's top), s a multiplier on
 *             the steeple's own scale (always 1: they are drawn true to each other and to the bridge);
 *   top(x):   the silhouette's height over the waterline at x, for anything that wants to stand on it.
 * The steeples stand in the town approach's first street-light bay, measured off the bridge's own
 * layout (bridge: the {left, right} the scene gives propBftBridge, by default the scene's own), so the
 * bridge, its lights and the steeples make the same picture at every width: St. Helena's just past the
 * first light, the Baptist church BFT_STEEPLE_GAP on. They keep out of the swing span's band (brX±30,
 * which holds the span at every angle it turns through), the palmettos (x > .78W) and the lights, or
 * only out of keep ([[x0,x1], ...]) when that is given; with no room the Baptist church goes first.
 */
function bftSkyline({W=320,brX=W*.6,yFar=161,seed=4423,keep=null,bridge=null,palms=true,clear=W*.5}={}){
  const g=mulberry(seed),band=30,Z=BFT_STEEPLE_Z,half=n=>BFT_STEEPLES[n].half/Z,T=BFT_STEEPLE_TOWN;
  const ss=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t)};
  /* the street lights stand up over the rail: a steeple keeps a couple of units clear of each pole and
     its head */
  const br=bridge||{left:Math.max(70,brX-W*.27),right:W-brX+30};
  const lamps=bftSteeplePoles(br).map(p=>[brX+Math.min(p.x,p.lx)-.6,brX+Math.max(p.x,p.lx)+.6]);
  const zones=keep||[[brX-band,brX+band],[W*.78,W+40],...lamps.map(([a,b])=>[a-2,b+2])];
  const free=(x,h)=>x-h>brX&&!zones.some(([a,b])=>x+h>a&&x-h<b);
  /* ── the steeples: St. Helena's at the first open sky right of the span's band with a unit and a half
     to spare, so just past the first street light, and the Baptist church BFT_STEEPLE_GAP on (a little
     less or more if a light is in the way); the pair moves on only when the Baptist church cannot stand
     anywhere near its place */
  let steeples=[];
  const at=(n,x)=>({name:n,x:+x.toFixed(2),y:+(yFar-BFT_STEEPLE_BLUFF).toFixed(2),s:1});
  const gaps=[0,-.5,.5,-1,1,-1.5,1.5,-2,2,2.5,3].map(d=>BFT_STEEPLE_GAP+d);
  search:for(const pair of[true,false]){
    for(let x0=brX+band;x0<W;x0+=.25){
      if(!free(x0,half("sthelena")+1.5))continue;
      if(!pair){steeples=[at("sthelena",x0)];break search}
      for(const gp of gaps)if(free(x0+gp,half("baptist")+.6)){steeples=[at("sthelena",x0),at("baptist",x0+gp)];break search}
    }
  }
  const xsH=steeples[0]?.x,xsB=steeples[1]?.x;
  /* ── the town's waterfront oaks over the rail: from just past the first street light to under the
     first palmetto, feathered down into the rail at both ends; a shade higher in front of St. Helena's
     and a shade lower in front of the Baptist church, so the two do not stand up out of the trees by the
     same amount, and the shorter one shows the less */
  const firstLamp=lamps.filter(([a])=>a>brX).sort((p,q)=>p[0]-q[0])[0];
  const cA=Math.max(brX+band+2.5,firstLamp?firstLamp[1]-.4:0),cB=Math.min(W*.81,W+12);
  const run=cB-cA>8;
  /* the shore's height over the waterline where there are no oaks: Lady's Island's wood on the left,
     the river's further reach lower still behind the swing span, the town's low bluff under the deck
     on the right */
  const base=x=>{const dl=1-ss(band-2,band+8,brX-x),dr=1-ss(band-2,band+2,x-brX);
    return x<brX?3.3*(1-dl)+1.7*dl:4.5*(1-dr)+1.7*dr};
  const crest=x=>{let h=T.crest;
    if(xsH!=null)h+=T.stH*(1-ss(2,4.5,Math.abs(x-xsH)));
    if(xsB!=null)h+=T.bap*(1-ss(2,4.5,Math.abs(x-xsB)));
    return h};
  let d=`M -12 ${f1(yFar+.6)} L -12 ${f1(yFar-base(-12))}`,x=-12;
  const tops=[[-12,base(-12)]];
  const to=(nx,h,arc,rr)=>{d+=arc?` A ${f1(rr)} ${f1(rr)} 0 0 1 ${f1(nx)} ${f1(yFar-h)}`:` L ${f1(nx)} ${f1(yFar-h)}`;tops.push([nx,h]);x=nx};
  /* the low line, up to the oaks */
  const lowRun=end=>{while(x<end-.01){const near=Math.abs(x-brX)<band+6,bw=near?3+g()*3:3.6+g()*4.4,nx=Math.min(x+bw,end);
    if(nx-x<.8){to(nx,base(nx),false);continue}
    to(nx,Math.max(1.1,base(nx)+(g()-.5)*(near?.7:1.5)),true,(nx-x)*(.55+g()*.2))}};
  if(run){
    lowRun(cA-1.2);
    /* the oaks: the first crown comes up out of the rail, then crown after crown; the last steps back
       down behind the first palmetto */
    to(cA,T.rail+.2,false);
    while(x<cB-.01){
      /* a crown: two and a half to six units across, the broad ones flatter, the way a live oak's
         spread reads from a mile off; now and then a low one, so the line is not a hedge */
      const nx=Math.min(x+2.6+g()*3.6,cB);
      if(nx-x<1.2){to(nx,crest(nx)-.6,false);continue}
      const edge=Math.min(ss(cA,cA+5,nx),1-ss(cB-4,cB,nx)),low=g()<.22?-.9:0;
      const h=T.rail+(crest(nx)+(g()-.5)*T.rise+low-T.rail)*(.25+.75*edge);
      to(nx,h,true,(nx-x)*(.62+g()*.3));
    }
    to(cB+1.2,base(cB+1.2),false);
  }
  lowRun(W+12);
  d+=` L ${f1(W+12)} ${f1(yFar+.6)} Z`;
  const top=xx=>{for(let i=1;i<tops.length;i++)if(xx<=tops[i][0]){const[a,ha]=tops[i-1],[b,hb]=tops[i];return ha+(hb-ha)*(xx-a)/((b-a)||1)}return tops[tops.length-1][1]};
  /* ── two low palmettos on Lady's Island, each a far fan of drooping fronds on a thin stem, where the
     far line is open: left of the swing span's band by a few units, right of clear (the oak's crown),
     and off every street light, the pair to the left of its bay and never centred in it; on a phone
     there is no such room and there are none. Six and a half units apart and of two heights, because
     two crowns that touch read as one animal */
  let pd="";
  if(palms){
    const lz=lamps.map(([a,b])=>[a-2.4,b+2.4]),ok=xx=>xx>clear+3&&xx<brX-band-4&&!lz.some(([a,b])=>xx+3>a&&xx-3<b);
    let px=null;for(let xx=clear+3;xx<brX-band-4;xx+=.25)if(ok(xx)&&ok(xx+6.5)){px=xx;break}
    if(px!=null){
      const pg=mulberry(seed+7);
      for(const[dx,h,lean]of[[0,10.2,-.3],[6.5,11.4,.35]]){const xx=px+dx,ty=yFar-h,cx=xx+lean;
        pd+=taper([[xx,yFar,.5],[xx+lean*.5,yFar-h*.5,.42],[cx,ty+.4,.34]],{per:3})+" ";
        /* a ragged burst, not an umbrella: fronds of uneven length all the way round, the upper ones
           standing up stiff, the side ones arching out and down at their tips, the lowest hanging */
        for(const a0 of[-205,-182,-158,-134,-112,-90,-68,-46,-22,2,25]){const a=a0+(pg()-.5)*14,r=a*Math.PI/180,c=Math.cos(r),sn=Math.sin(r);
          const L=(a0<-180||a0>0?1.7:a0>-125&&a0<-55?2.2:2.7)+pg()*.9,droop=(.25+.75*Math.abs(c))*L*.32;
          pd+=taper([[cx,ty,.4],[cx+c*L*.55,ty+sn*L*.55,.3],[cx+c*L,ty+sn*L+droop,.06]],{per:3})+" "}}
    }
  }
  return{d,palms:pd.trim(),steeples,top};
}
/**
 * bftSteepleMarkup(sky, {farC, farLine, steeple, tex, texOp}): the far shore as the scene paints it,
 * back to front: the steeples (steeple(name, x, y, s) gives each one's markup, the scene's look()) and
 * Lady's Island's palmettos, then the silhouette over their feet, and its grain.
 */
function bftSteepleMarkup(sky,{farC,farLine,steeple,tex="",texOp=.5}={}){
  return `<g data-prop="steeples">${sky.steeples.map(t=>steeple(t.name,t.x,t.y,t.s)).join("")}</g>`
    +(sky.palms?`<path d="${sky.palms}" fill="${farC}" stroke="${farLine}" stroke-width=".45" stroke-linejoin="round"/>`:"")
    +`<path d="${sky.d}" fill="${farC}" stroke="${farLine}" stroke-width=".55" stroke-linejoin="round"/>`
    +(tex?`<path d="${sky.d}" fill="${tex}" opacity="${texOp}"/>`:"");
}

/* ── looking: each steeple close up and at phone size, and the whole far shore with the bridge's
   outline, the oak's crown, the dock's flag and the palmettos stood in where the scene puts them, to
   see that the truss keeps its sky */
const BFT_STEEPLE_LOOK={pal:INK.bftSteeple,s:1/BFT_STEEPLE_Z,dist:.6,o:BFT_STEEPLE_INK};
for(const n of Object.keys(BFT_STEEPLES))LOOK[`steeple-${n}`]={...BFT_STEEPLE_LOOK,box:BFT_STEEPLES[n].box,draw:()=>propBftSteeple(n)};
const bftSteepleHex=(a,b,t)=>{const h=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));const A=h(a),B=h(b);
  return "#"+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,"0")).join("")};
const bftSteepleAir=(c,d,lt)=>{let t=c;if(lt.warm)t=bftSteepleHex(t,lt.warm,.3*lt.gold);if(lt.night)t=bftSteepleHex(t,"#15223D",.62*lt.night);return bftSteepleHex(t,lt.haze,d*.72)};
/* the swing span's outline (bridge.js's numbers: x -23..23, roadway -7, the top chord's panel points),
   the approaches' deck, rail and street lights, and the scene's near things, as flat grey stand-ins */
function bftSteepleStandIns(W,brX,lt){
  const T=[-7,-12,-13.9,-15.8,-15.8,-13.9,-12,-7],N=Array.from({length:8},(_,i)=>-23+i*46/7);
  const truss=`M ${N.map((x,i)=>`${f1(brX+x)} ${T[i]}`).join(" L ")} L ${f1(brX+23)} -5.6 L ${f1(brX-23)} -5.6 Z`;
  let web="";for(let i=1;i<7;i++)web+=`M ${f1(brX+N[i])} -7 L ${f1(brX+N[i])} ${T[i]} `;
  for(const i of[1,2])web+=`M ${f1(brX+N[i])} -7 L ${f1(brX+N[i+1])} ${T[i+1]} M ${f1(brX+N[7-i])} -7 L ${f1(brX+N[6-i])} ${T[6-i]} `;
  const steel=bftSteepleAir("#EEEEE8",.55,lt),deck=bftSteepleAir("#D9D3C6",.55,lt),ink=bftSteepleHex(lt.ink,lt.haze,.55*.7);
  let piers="";for(let x=brX-110;x<W+5;x+=10)if(Math.abs(x-brX)>26)piers+=`M ${f1(x-.5)} -5 L ${f1(x+.5)} -5 L ${f1(x+.5)} 0 L ${f1(x-.5)} 0 Z `;
  let rail=`M ${f1(brX-110)} -8.1 L ${f1(W+5)} -8.1 L ${f1(W+5)} -7.8 L ${f1(brX-110)} -7.8 Z `;
  for(let x=brX-110;x<W+5;x+=2.6)if(Math.abs(x-brX)>23)rail+=`M ${f1(x-.1)} -7.9 L ${f1(x+.1)} -7.9 L ${f1(x+.1)} -7 L ${f1(x-.1)} -7 Z `;
  const near=bftSteepleAir("#3F5A3A",.08,lt),fl=bftSteepleAir("#2B4C8C",.05,lt);
  /* the oak's crown, its right end where the scene's reaches (157 at a 320 frame, 214 at 620) at y
     -44..-19, the palmettos' trunks and crowns from .815W, the flag on its staff at .66W+13 */
  const oR=157+(W-320)*.19;
  const oak=`M -10 -70 L ${f1(oR-5)} -44 Q ${f1(oR+2)} -32 ${f1(oR-5)} -19 L ${f1(oR*.7)} -12 L -10 -8 Z`;
  const palms=[[W*.815,-45,72],[W*.88,-31,58],[W*.945,-19,46]].map(([x,cy])=>`M ${f1(x-1)} 28 L ${f1(x-1)} ${cy} L ${f1(x+1)} ${cy} L ${f1(x+1)} 28 Z M ${f1(x-15)} ${cy+6} Q ${f1(x)} ${cy-14} ${f1(x+15)} ${cy+6} Q ${f1(x)} ${cy-2} ${f1(x-15)} ${cy+6} Z`).join(" ");
  let lamps="";for(const p of bftSteeplePoles({left:Math.max(70,brX-W*.27),right:W-brX+30}))lamps+=`M ${f1(brX+p.x-.15)} -7.9 L ${f1(brX+p.x+.15)} -7.9 L ${f1(brX+p.x+.15)} -12.2 L ${f1(brX+p.lx-.4)} -12.2 L ${f1(brX+p.lx-.4)} -12.6 L ${f1(brX+p.x-.15)} -12.6 Z `;
  const fx=W*.66+13;
  const flag=`M ${f1(fx-.25)} 6 L ${f1(fx+.25)} 6 L ${f1(fx+.25)} -6.6 L ${f1(fx-.25)} -6.6 Z M ${f1(fx+.25)} -6.4 L ${f1(fx+6.4)} -5.8 L ${f1(fx+6.2)} -1.8 L ${f1(fx+.25)} -2.2 Z`;
  return `<path d="${piers}" fill="${deck}"/><path d="M ${f1(brX-110)} -7 L ${f1(W+5)} -7 L ${f1(W+5)} -5.5 L ${f1(brX-110)} -5.5 Z" fill="${deck}" stroke="${ink}" stroke-width=".3"/>`
    +`<path d="${rail}" fill="${deck}"/>`
    +`<path d="${truss}" fill="none" stroke="${ink}" stroke-width="1.15" stroke-linejoin="round"/><path d="${truss}" fill="none" stroke="${steel}" stroke-width=".7" stroke-linejoin="round"/>`
    +`<path d="${web}" fill="none" stroke="${steel}" stroke-width=".45"/>`
    +`<path d="${lamps}" fill="${ink}"/><path d="${oak}" fill="${near}" opacity=".9"/><path d="${palms}" fill="${near}" opacity=".9"/><path d="${flag}" fill="${fl}"/>`;
}
/* the look harness's three lights (tools/beaufort/look.mjs), for the stand-ins' colours only */
const BFT_STEEPLE_LIGHTS={d:{haze:"#B4D3DE",warm:null,gold:0,night:0,ink:"#2A2130"},g:{haze:"#D9A58F",warm:"#FFA24E",gold:1,night:0,ink:"#2A2130"},n:{haze:"#2A3A52",warm:null,gold:0,night:1,ink:"#0A1020"}};
/* the far shore in front of the steeples' feet, the way the scene paints it, and the stand-ins in
   front of that, once for each light: the page's CSS shows the golden one in the golden panel and the
   night one in the night panel (the third and fourth in each row) */
function bftSteepleShore(W){
  const sky=bftSkyline({W,brX:W*.6,yFar:0,seed:32431});
  return Object.entries(BFT_STEEPLE_LIGHTS).map(([k,lt])=>{const fc=bftSteepleAir("#6E8C82",.62,lt),fl=bftSteepleHex(lt.ink,lt.haze,.62*.7);
    return `<g class="bftsk-${k}" transform="scale(${BFT_STEEPLE_Z})">`
    +(sky.palms?`<path d="${sky.palms}" fill="${fc}" stroke="${fl}" stroke-width=".45" stroke-linejoin="round"/>`:"")
    +`<path d="${sky.d}" fill="${fc}" stroke="${fl}" stroke-width=".55" stroke-linejoin="round"/>`
    +bftSteepleStandIns(W,W*.6,lt)+`</g>`}).join("");
}
LOOK.skyline={pal:INK.bftSteeple,s:1/BFT_STEEPLE_Z,dist:.6,o:BFT_STEEPLE_INK,box:[0,-300,3170,340],
  states:{w320:{W:320},w352:{W:352}},
  css:`.bftsk-g,.bftsk-n{display:none}figure:nth-child(3) .bftsk-d,figure:nth-child(4) .bftsk-d{display:none}figure:nth-child(3) .bftsk-g,figure:nth-child(4) .bftsk-n{display:inline}`,
  draw:(st)=>{const W=st.W||320,sky=bftSkyline({W,brX:W*.6,yFar:0,seed:32431});
    return[...sky.steeples.map(t=>({open:`<g transform="translate(${f1(t.x*BFT_STEEPLE_Z)} ${f1(t.y*BFT_STEEPLE_Z)})">`,pivot:[0,0],layers:[{parts:propBftSteeple(t.name)}]})),
      {open:`<g>${bftSteepleShore(W)}</g><g>`,pivot:[0,0],layers:[]}]}};
/* the same at the widest frame the scene draws, a 760 tablet's (not a scene key) */
LOOK["skyline-wide"]={...LOOK.skyline,box:[0,-300,5580,340],states:{w620:{W:620}}};
