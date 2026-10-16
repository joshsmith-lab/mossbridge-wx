/* ── Beaufort: the Lowcountry dock and the family's boat ─────────────────────────────────
   A long private walkway on pilings out over the marsh to a covered pierhead (the dock house: a
   hip roof of silver standing-seam tin on its corner pilings, a back rail with a bench along it,
   a dock light hung under the roof), a hinged aluminium gangway down to a floating dock that
   rides the tide, and the family's Carolina center console lying alongside the float.

   Beaufort's tide runs about seven and a half feet, so the gangway's angle and the float's height
   ARE the tide made visible: at high water the float sits just under the deck and the gangway is
   nearly flat (about 10°); at dead low the float has dropped ten units, the gangway stands steep
   (about 39°), and every piling shows its wet dark band and a crust of barnacles through the middle
   of the tidal range.

   Dock units: y=0 is the top of the walkway deck, x=0 the pierhead's river edge, +x landward (the
   walkway runs off the frame to the right), the float on the river side. The water is
   bftDockWater(tide) below the deck: 7 at high, 17 at dead low, or wherever the scene says (o.water,
   o.hw, o.lw). Scale: about 1.33 units to the foot, so the 24-unit boat is an 18 ft center console.

   Back to front, one story: the guide pilings, the dock house and walkway, the gangway, the float,
   the dock light, and the boat last, in front of everything (o.boat). Nothing of the dock is ever in
   front of the boat, so a scene that inks the boat with its own options draws it straight after the
   dock at BFT_DOCK_BOAT(tide,o) and gets exactly the same picture. */
INK.bftDock={deck:"#B4A58D",wood:"#837463",piling:"#7B6C5C",detail:"#4E4336",rail:"#BAAC94",bench:"#9C8264",slat:"#B49A78",
  roof:"#C3CCCF",seam:"#9AA6AC",ridge:"#A8B2B6",trim:"#ECE6D8",soffit:"#2A1B33",gap:"#4E4336",
  floatEdge:"#D6CBB1",float:"#7A6955",drum:"#2A2D32",gangway:"#C9CFD2",wet:"#4A4235",crust:"#625949",
  hoop:"#9AA2A6",cleat:"#3A3C40",lampShade:"#33363B",lamp:"#D8D2C2",
  /* the lit lamp is its own light: written as rgb(), which neither renderScene's palAt nor the look's
     litPal tones toward the night, the way the barn's lit windows skip air(). The glow is the flame's orange, not gold, because dim
     gold over the night's blue goes green */
  lampOn:"rgb(255,226,168)",lampGlow:"rgb(255,182,98)",
  ink:"#2A1B33",shade:"#3A2350",lit:"#FFE6B0",shadeOp:.3,litOp:.45};
INK.bftBoat={hull:"#F3EEE2",boot:"#2B5D7E",cove:"#2B5D7E",rub:"#6A6F77",console:"#EEE8DA",glass:"#3D5B6B",ttop:"#2E5470",tframe:"#C4CBCF",
  motor:"#2D2E34",decal:"#C9CED3",rod:"#4A3F46",reel:"#C9CFD3",bowrail:"#A3ABB1",seat:"#D9CDB4",sub:"#6F9AA2",
  ink:"#2A1B33",shade:"#3A2350",lit:"#FFE6B0",shadeOp:.3,litOp:.45};
/* the line weights the scene should ink them with: the dock is thin members, so a lighter line
   and a narrow crescent, or the posts and rails go to solid ink at phone size. The boat inked
   inside the dock (o.boat) takes the dock's; the two differ by a twentieth of a pixel */
const BFT_DOCK_O={line:.8,heavy:.4,shade:1.1,lit:.7};
const BFT_BOAT_O={line:.85,heavy:.45,shade:1.2,lit:.8};

/* small drawing helpers, straight members being most of a dock */
const bftDockRect=(x0,y0,x1,y1,role,x)=>part(`M ${f1(x0)} ${f1(y0)} L ${f1(x1)} ${f1(y0)} L ${f1(x1)} ${f1(y1)} L ${f1(x0)} ${f1(y1)} Z`,role,x);
const bftDockPoly=(pts,role,x)=>part("M "+pts.map(p=>`${f1(p[0])} ${f1(p[1])}`).join(" L ")+" Z",role,x);
const bftDockSeg=(x0,y0,x1,y1,w,role,x)=>pTaper([[x0,y0,w],[x1,y1,w]],role,{capStart:false,capEnd:false},x);
const bftDockClamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ── the tide and everything it moves ───────────────────────────────────────────────────── */
/* High water stands 7 under the deck, dead low 17; the float's deck rides 2 over the water; the
   gangway is 22 long (a 16 ft aluminium gangway), its handrail 3 over its walking surface */
const BFT_DOCK_HW=7,BFT_DOCK_LW=17,BFT_DOCK_FREE=2,BFT_DOCK_GANG=22,BFT_DOCK_RAIL=3;
/* the tide as a number from 0 to 1. An unknown tide (null, undefined, NaN, a word) is drawn at mid
   water, never at dead low: +null is 0, and a dead low is a claim about the river */
const bftDockTide=t=>{const v=typeof t==="number"?t:typeof t==="string"&&t.trim()!==""?+t:NaN;return Number.isFinite(v)?bftDockClamp(v,0,1):.5};
/* the water's surface in dock units below the deck. o.water puts it exactly (the scene's own river
   line, in dock units); otherwise the tide runs it between o.hw (default 7) and o.lw (default 17) */
function bftDockWater(tide,o={}){
  if(Number.isFinite(o.water))return o.water;
  const hw=Number.isFinite(o.hw)?o.hw:BFT_DOCK_HW,lw=Number.isFinite(o.lw)?o.lw:BFT_DOCK_LW;
  return lw-(lw-hw)*bftDockTide(tide);
}
/* the whole layout for one water level. The gangway hinges at the pierhead's river edge (its deck
   chord flush with the deck there) and rests on the float, so its foot walks along the float as the
   tide drops. The boat lies where the gangway's furthest reach, on the highest water this dock is
   drawn for, leaves at least two units of open water off its outboard (2.4, so a rocking boat keeps
   two), and the float runs from seven units in from the boat's centre to the dock house */
function bftDockGeo(tide,o={}){
  const hw=Number.isFinite(o.hw)?o.hw:BFT_DOCK_HW,lw=Number.isFinite(o.lw)?o.lw:BFT_DOCK_LW,F=BFT_DOCK_FREE;
  /* a longer gangway when the scene's river drops further, so dead low is never past about 42° */
  const gang=Number.isFinite(o.gang)?o.gang:Math.max(BFT_DOCK_GANG,(Math.max(lw,hw)-F-1.1)/Math.sin(42*Math.PI/180));
  const water=bftDockClamp(bftDockWater(tide,o),F+.6,F+1.1+gang*.9);
  const lay=w=>{const fy=w-F,hx=.4,hy=.55,dy=fy-.55-hy,dx=Math.sqrt(gang*gang-dy*dy),fx=hx-dx;
    const ux=(fx-hx)/gang,uy=dy/gang,nx=-uy,ny=ux;
    /* furthest out: the top of the end post on the float, or the lip plate at its foot */
    const reach=Math.min(fx+nx*(.55+BFT_DOCK_RAIL)-.3,fx-.9);
    return{hx,hy,fx,fy:fy-.55,deg:Math.atan2(dy,dx)*180/Math.PI,len:gang,ux,uy,nx,ny,reach,float:fy}};
  const G=lay(water),top=lay(Math.min(water,hw));
  const bx=Math.min(-38,top.reach-2.4-BFT_BOAT_AFT);
  return{hw,lw,gang,water,fy:water-F,G,boat:{x:bx,y:water},float:[bx-7,-2],reach:G.reach};
}
/* the gangway's geometry: its deck chord's centreline from the hinge (hx,hy) to the foot (fx,fy),
   its angle, length, unit direction (ux,uy) and up-normal (nx,ny), and its furthest reach out */
const bftDockGang=(tide,o={})=>bftDockGeo(tide,o).G;
/* where the family's boat lies alongside the float, its waterline centre, in dock units */
const BFT_DOCK_BOAT=(tide,o={})=>bftDockGeo(tide,o).boat;

/* ── the pilings ────────────────────────────────────────────────────────────────────────── */
/* the walkway's pilings run up through the deck as its rail posts. Each is a hair off the 10.5
   grid and a hair off level at the top, from its own seed, so a change of tide never moves one */
function bftDockWalkPosts(len=95){
  const P=[];
  for(let i=0,x=36.6;x<=len+.1;i++,x+=10.5){const r=mulberry(7500+i*13);P.push({x:+(x+(r()-.5)*.3).toFixed(2),top:-5.6+(r()-.5)*.5,seed:7600+i*13})}
  return P;
}
const bftDockWalkPiles=(len=95)=>bftDockWalkPosts(len).map(p=>p.x);
/* every piling that stands in the water, at the x it is drawn at, for the scene's ripples and
   reflections: the float's two guide piles, the dock house's three, and the walkway's */
const bftDockPiles=(len=95)=>[-20,-7,1.4,13,24.6,...bftDockWalkPiles(len)];
/* where things are fastened to the dock, for the other drawings, in dock units:
   flag: the foot of a staff on the dock house's ridge cap;
   windsock: the foot of a pole on top of the float's outer guide piling, at the river end (the
   piling is fixed, it does not ride the tide, and it stands clear of the gangway's path and the
   boat's T-top and rods at every tide);
   sign: the centre of the face of the first walkway post landward of the dock house, in front of
   its two rails, w and h the most a sign should span there;
   lamp: the dock light, hung under the roof in the middle of the dock house (the foot of its shade),
   and how far its glow reaches.
   top is a sensible height for a staff's top, w its width */
const BFT_DOCK_POLES={
  flag:{x:13,y:-15.15,top:-27,w:.55},
  windsock:{x:-20,y:-1.2,top:-19,w:.5},
  sign:{x:bftDockWalkPiles(40)[0],y:-3.6,w:5,h:2.3},
  lamp:{x:13,y:-7.5,glow:9.5}};

/* a piling from (top) down into the water (or onto the ground, where the scene says there is
   ground): a weathered pole, a hair irregular, its top rounded off. Below the high-water line it
   is wet and dark with a ragged splash line, and through the middle of the tidal range it carries a
   rough crust of barnacles a shade lighter than the wet, which shows only once the water is down */
function bftDockPile(x,top,w,D,seed,{cap=true}={}){
  const r=mulberry(seed),bot=D.bot(x),j=(r()-.5)*.18,wt=D.hw-.9,a=wt+(r()-.5)*.5,b=wt+(r()-.5)*.5,hw=w*.52;
  const P=[pTaper([[x,top,w*.94],[x+j,(top+bot)/2,w],[x-j*.5,bot,w*1.04]],"piling",{capStart:cap,capEnd:false})];
  if(bot>Math.max(a,b)+.25)P.push(bftDockPoly([[x-hw,a],[x-hw*.3,a+.25],[x+hw*.2,b-.2],[x+hw,b],[x+hw*1.04,bot],[x-hw*1.04,bot]],"wet",{noSil:true}));
  const c0=D.hw+(D.lw-D.hw)*.3,c1=D.hw+(D.lw-D.hw)*.66;
  for(let k=0;k<4;k++){
    const y=c0+r()*(c1-c0),xx=x+(r()-.5)*w*.5,ww=.28+r()*.3,hh=.16+r()*.1;
    if(y+hh<bot-.35&&y-hh>Math.max(a,b)+.3)P.push(bftDockPoly([[xx-ww,y+hh*.3],[xx-ww*.4,y-hh],[xx+ww*.5,y-hh*.6],[xx+ww,y+hh*.1],[xx+ww*.3,y+hh]],"crust",{noSil:true}));
  }
  return P;
}

/**
 * The dock. tide 0 (dead low) to 1 (high); an unknown tide is drawn at mid water. Options:
 *   len:    how far the walkway runs landward (default 95; the scene passes enough to run it off the
 *           frame's right edge)
 *   boat:   a rig (layers) to lie alongside the float at BFT_DOCK_BOAT(tide,o), drawn last, in front
 *           of the whole dock
 *   poles:  draw the bare flag staff and windsock pole (leave false when the flag and windsock
 *           drawings bring their own staffs)
 *   lamp:   the dock light is on (the scene lights it with the barn lamps, the sun under -0.83°)
 *   water:  the water's surface in dock units, to follow the scene's own river line exactly
 *   hw, lw: the scene's high and low water in dock units (defaults 7 and 17): the tide runs between
 *           them, the wet band starts at hw, and the gangway is lengthened if lw would stand it
 *           steeper than about 42°
 *   ground: optional x => y (dock units): where the ground or the mud is under the dock, so the
 *           landward pilings stand on the bank instead of running down to the river's level
 * Returns layers for inkRig, back to front.
 */
function propBftDock(tide=.5,o={}){
  o=o||{};
  const len=o.len??95,geo=bftDockGeo(tide,o),{water,hw,lw,G}=geo,fy=geo.fy;
  const ground=typeof o.ground==="function"?o.ground:null;
  const D={hw,lw,water,bot:x=>{const gy=ground?+ground(x):NaN;return Number.isFinite(gy)?Math.min(water+.5,gy+.35):water+.5}};
  const [fl0,fl1]=geo.float,posts=bftDockWalkPosts(len);
  const L=[];
  /* the float's two guide pilings, behind it; the float slides up and down them on its hoops */
  L.push({parts:[...bftDockPile(-20,-1,2.1,D,7401),...bftDockPile(-7,-1,2.1,D,7402)]});
  if(o.poles){
    const W=BFT_DOCK_POLES.windsock;
    L.push({parts:[bftDockSeg(W.x,W.y+.4,W.x,W.top,W.w,"hoop"),pDot(W.x,W.top-.2,.45,"hoop")]});
  }
  /* the pilings under the dock house and along the walkway; the walkway's run up through the deck
     as the rail posts, and the dock house's two corner pilings run up to carry its roof */
  const piles=[...bftDockPile(1.4,-9.4,2.1,D,7403,{cap:false}),...bftDockPile(13,1,2,D,7404),...bftDockPile(24.6,-9.4,2.1,D,7405,{cap:false})];
  for(const p of posts)piles.push(...bftDockPile(p.x,p.top,1.9,D,p.seed));
  L.push({parts:piles});
  /* X bracing under the dock house, its feet clear of the wet band at high water */
  {const by=Math.min(5.8,hw-1.2);
    if(by>3.4)L.push({parts:[bftDockSeg(2.4,2.4,12,by,.75,"wood"),bftDockSeg(12,2.4,2.4,by,.75,"wood"),
      bftDockSeg(14,2.4,23.6,by,.75,"wood"),bftDockSeg(23.6,2.4,14,by,.75,"wood")]});}
  /* the bench along the dock house's back rail, seen between the corner pilings */
  L.push({parts:[bftDockRect(2.4,-4.9,23.6,-4.2,"rail"),
    bftDockRect(3.6,-3.9,22.4,-3.3,"slat"),
    bftDockRect(3.4,-2.2,22.6,-1.5,"bench"),
    bftDockRect(4.4,-1.5,5.2,0,"bench"),bftDockRect(12.6,-1.5,13.4,0,"bench"),bftDockRect(20.8,-1.5,21.6,0,"bench")]});
  /* the deck: the plank ends along the top and the stringer bolted to the pilings under them */
  {const ends=[],pr=mulberry(7320);
    /* the deck boards run across the walkway, so from the side their ends make a row: a faint gap
       between each, a board a little over a unit wide, never quite even */
    for(let x=-.6+1.05;x<len+1.6;x+=.95+pr()*.25)ends.push(bftDockRect(x-.06,.08,x+.06,.74,"gap",{noSil:true,op:.32}));
    L.push({parts:[bftDockRect(-.6,0,len+2,.8,"deck"),bftDockRect(-.6,.8,26.2,2.6,"wood"),bftDockRect(26.2,.8,len+2,2.2,"wood"),...ends,
      /* the through-bolts where the stringer meets each piling */
      ...[1.4,13,24.6].map(x=>pDot(x,1.75,.24,"detail")),...posts.map(p=>pDot(p.x,1.5,.22,"detail"))]});}
  /* the walkway's rail: a top rail capping the posts from the dock house's corner piling, and a mid
     rail that starts at that piling's landward face */
  {const rr=mulberry(7311),xs=posts.map(p=>p.x),rail=(y,w,x0)=>pTaper([x0,...xs,len+2].map(x=>[x,y+(rr()-.5)*.16,w*(.92+rr()*.16)]),"rail",{capStart:false,capEnd:false});
    L.push({parts:[rail(-4.85,.72,24.6),rail(-2.45,.52,25.65)]});}
  /* the dock house roof: white trim, a hip of silver standing-seam tin, a ridge cap. The seams run
     down the slope, so in elevation they stand upright and end on the hips */
  {
    const e0=-2.6,e1=28.6,ey=-9.7,r0=7.6,r1=18.4,ry=-14.6;
    const roof=[bftDockRect(-1.8,-9.9,27.8,-8.9,"trim"),bftDockPoly([[e0,ey],[e1,ey],[r1,ry],[r0,ry]],"roof"),
      bftDockRect(r0-.5,ry-.55,r1+.5,ry+.15,"ridge")];
    for(let x=e0+1.3;x<e1-.8;x+=1.55){
      const t=x<r0?ey+(ry-ey)*(x-e0)/(r0-e0):x>r1?ey+(ry-ey)*(e1-x)/(e1-r1):ry;
      if(ey-t>.5)roof.push(bftDockRect(x-.13,t+.15,x+.13,ey-.05,"seam",{noSil:true}));
    }
    /* the shade under the eave, inside the house */
    roof.push(bftDockRect(2.5,-8.9,23.5,-7.7,"soffit",{noSil:true,op:.2}));
    L.push({parts:roof});
  }
  if(o.poles){
    const F=BFT_DOCK_POLES.flag;
    L.push({parts:[bftDockSeg(F.x,F.y+.2,F.x,F.top,F.w,"hoop"),pDot(F.x,F.top-.25,.5,"hoop")]});
  }
  /* the gangway: an aluminium truss, a deck chord you walk on and a handrail chord over it, an end
     post at each end and the diagonals between them in a W, a hinge plate on the deck at the top
     and a lip plate where it rests on the float */
  {
    const{hx,hy,fx,fy:gy,nx,ny}=G,at=(t,h)=>[hx+(fx-hx)*t+nx*h,hy+(gy-hy)*t+ny*h];
    const W0=.55,W1=.55+BFT_DOCK_RAIL,parts=[];
    const seg=(p,q,w)=>parts.push(bftDockSeg(p[0],p[1],q[0],q[1],w,"gangway"));
    seg(at(0,0),at(1,0),1.1);
    seg(at(0,W1-.25),at(1,W1-.25),.5);
    seg(at(0,W0),at(0,W1),.45);seg(at(1,W0),at(1,W1),.45);
    const N=4,Wr=W1-.25;
    for(let i=0;i<N;i++){const t0=i/N,t1=(i+1)/N;seg(at(t0,i%2?Wr:W0),at(t1,i%2?W0:Wr),.35)}
    parts.push(bftDockRect(-.4,-.3,2,0,"gangway"));
    parts.push(bftDockRect(fx-.9,gy+.3,fx+.6,gy+.55,"gangway"));
    L.push({parts});
  }
  /* the float: a pale deck-edge board, the darker frame under it, the black drums at the water;
     cleats on the deck; the hoops round the guide pilings ride with it */
  L.push({parts:[bftDockRect(fl0,fy,fl1,fy+.6,"floatEdge"),bftDockRect(fl0+.15,fy+.6,fl1-.15,water-.55,"float"),
    bftDockRect(fl0+.6,water-.6,fl1-.6,water+.2,"drum"),
    bftDockPoly([[fl0+2.4,fy],[fl0+2.7,fy-.5],[fl0+4.1,fy-.5],[fl0+4.4,fy]],"cleat"),
    bftDockPoly([[-13.9,fy],[-13.6,fy-.5],[-12.2,fy-.5],[-11.9,fy]],"cleat"),
    bftDockRect(-21.35,fy-.7,-18.65,fy+.1,"hoop"),bftDockRect(-8.35,fy-.7,-5.65,fy+.1,"hoop")]});
  /* the dock light: a pendant barn-light shade hung from the ridge beam in the middle of the dock
     house. Lit, the house glows round it (its bench, its posts, the underside of the tin), a warm
     pool lies on the deck under it, and its light is laid down the water below the house */
  {
    const Lp=BFT_DOCK_POLES.lamp,lx=Lp.x,ly=Lp.y,parts=[];
    if(o.lamp){
      /* the glow fills the house's open sides, under the eave and over the deck, brightest at the
         lamp: soft ellipses laid one inside the next, so the light falls off without a ring */
      const ell=(cx,cy,rx,ry,op)=>parts.push(part(`M ${f1(cx-rx)} ${f1(cy)} a ${f1(rx)} ${f1(ry)} 0 1 0 ${f1(2*rx)} 0 a ${f1(rx)} ${f1(ry)} 0 1 0 ${f1(-2*rx)} 0 Z`,"lampGlow",{soft:true,op}));
      ell(lx,ly+3.6,Lp.glow*1.45,8.2,.035);
      for(let i=0;i<10;i++){const k=1-i*.095;ell(lx,ly+3.4-i*.3,Lp.glow*1.18*k,5.1*k,.04)}
      parts.push(part(`M ${f1(lx-10.5)} -.1 a 10.5 1 0 1 0 21 0 a 10.5 1 0 1 0 -21 0 Z`,"lampGlow",{soft:true,op:.2}));
      const wr=mulberry(7333);
      for(let k=0;k<5;k++){const y=water+.8+k*1.3+wr()*.4,w=3.2-k*.45+wr()*.4,x=lx+(wr()-.5)*.8;
        parts.push(bftDockRect(x-w/2,y,x+w/2,y+.4,"lampGlow",{soft:true,op:+(.32-k*.05).toFixed(2)}));}
    }
    parts.push(bftDockSeg(lx,-8.9,lx,-8.1,.16,"lampShade"),
      bftDockPoly([[lx-.8,ly-.05],[lx-.38,ly-.65],[lx+.38,ly-.65],[lx+.8,ly-.05]],"lampShade"),
      part(`M ${f1(lx-.4)} ${f1(ly-.05)} a .4 .4 0 0 0 .8 0 Z`,o.lamp?"lampOn":"lamp",{noSil:true}));
    L.push({parts});
  }
  /* the boat lies alongside, in front of the float and of everything else */
  if(o.boat)L.push({open:`<g transform="translate(${f1(geo.boat.x)} ${f1(geo.boat.y)})">`,pivot:[0,0],layers:o.boat});
  return L;
}

/* ── the family's boat ─────────────────────────────────────────────────────────────────
   A Carolina center console, about 24 long (an 18-footer), facing -x, y=0 its waterline. What has
   to survive on a phone: the flared, raked bow and the sheer sweeping up to it, the cream hull with
   its blue stripes, the T-top standing over the console, the outboard on the transom, and the rods
   standing up off the T-top. The whole boat is one joint at its waterline centre, bft-boat-rock,
   so the scene can rock it with the chop. */
/* an open Catmull-Rom through points, sampled densely (the kit's own taper sampling), so a long
   curve is drawn as a curve and never shows its facets */
function bftBoatCR(pts,per=10,closed=false){
  const P=closed?[pts[pts.length-1],...pts,pts[0],pts[1]]:[pts[0],...pts,pts[pts.length-1]],S=[];
  for(let i=1;i<P.length-2;i++){
    const[a,b,c,e]=[P[i-1],P[i],P[i+1],P[i+2]];
    for(let j=0;j<per;j++){const t=j/per,t2=t*t,t3=t2*t,cr=(p0,p1,p2,p3)=>.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);
      S.push([cr(a[0],b[0],c[0],e[0]),cr(a[1],b[1],c[1],e[1])])}
  }
  if(!closed)S.push(pts[pts.length-1].slice(0,2));
  return S;
}
/* the boat is small and curved, so it is written to the hundredth: the kit's tenth, magnified in a
   close-up, set its long curves wobbling */
const bftBoatF=v=>Math.round(v*100)/100;
const bftBoatPoly=(pts,role,x)=>part("M "+pts.map(p=>`${bftBoatF(p[0])} ${bftBoatF(p[1])}`).join(" L ")+" Z",role,x);
const bftBoatRect=(x0,y0,x1,y1,role,x)=>bftBoatPoly([[x0,y0],[x1,y0],[x1,y1],[x0,y1]],role,x);
/* the kit's taper (a brush stroke along a Catmull-Rom centreline), written to the hundredth */
function bftBoatTaper(pts,{per=12,capEnd=true,capStart=true}={}){
  const S=bftBoatCR(pts.map(p=>[p[0],p[1]]),per),W=[];
  for(let i=1;i<pts.length;i++)for(let j=0;j<per;j++)W.push(pts[i-1][2]+(pts[i][2]-pts[i-1][2])*j/per);
  W.push(pts[pts.length-1][2]);
  const L=[],R=[],P=v=>`${bftBoatF(v[0])} ${bftBoatF(v[1])}`;
  S.forEach((p,i)=>{const a=S[Math.max(0,i-1)],b=S[Math.min(S.length-1,i+1)];let dx=b[0]-a[0],dy=b[1]-a[1];const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;
    const w=W[i]/2;L.push([p[0]-dy*w,p[1]+dx*w]);R.push([p[0]+dy*w,p[1]-dx*w])});
  const we=W[W.length-1]/2,ws=W[0]/2;
  let d=`M ${P(L[0])}`;for(let i=1;i<L.length;i++)d+=` L ${P(L[i])}`;
  d+=capEnd&&we>.05?` A ${bftBoatF(we)} ${bftBoatF(we)} 0 0 0 ${P(R[R.length-1])}`:` L ${P(R[R.length-1])}`;
  for(let i=R.length-2;i>=0;i--)d+=` L ${P(R[i])}`;
  return d+(capStart&&ws>.05?` A ${bftBoatF(ws)} ${bftBoatF(ws)} 0 0 0 ${P(L[0])}`:"")+" Z";
}
const bftBoatSeg=(x0,y0,x1,y1,w,role,x)=>part(bftBoatTaper([[x0,y0,w],[x1,y1,w]],{capStart:false,capEnd:false,per:1}),role,x);
const bftBoatIn=(P,x,y)=>{let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const[a,b]=P[i],[e,d]=P[j];if((b>y)!==(d>y)&&x<(e-a)*(y-b)/(d-b)+a)c=!c}return c};
/* where y=f(x), run from x0 (inside the shape) toward x1, leaves the shape */
const bftBoatExit=(P,f,x0,x1)=>{let a=x0,b=x1;for(let k=0;k<32;k++){const m=(a+b)/2;if(bftBoatIn(P,m,f(m)))a=m;else b=m}return a};
/* the hull: the sheer runs from the transom's top (10.4, -2.9) forward and up to the bow's tip
   (-13, -6.2), flat aft and sweeping up hard forward of the console; the stem rakes back down to a
   round forefoot under the water, and the keel runs aft to the transom's foot */
const bftBoatSheer=x=>{const s=Math.max(0,Math.min(1,(10.4-x)/23.4));return -2.9-.45*s-2.85*s**2.4};
const BFT_BOAT_KEEL=[[-13,-6.2],[-12.35,-4.6],[-11.45,-2.9],[-10.35,-1.25],[-9.25,-.15],[-7.8,.42],[-5,.6],[2,.62],[8.6,.52],[9.95,.42]];
const BFT_BOAT_STEM=bftBoatCR(BFT_BOAT_KEEL.slice(0,6),10);
/* the stem's x at a height y (from the bow's tip down to the forefoot) */
const bftBoatStem=y=>{const S=BFT_BOAT_STEM;if(y<=S[0][1])return S[0][0];
  for(let i=1;i<S.length;i++)if(S[i][1]>=y){const[a,b]=[S[i-1],S[i]];return a[0]+(b[0]-a[0])*(y-a[1])/((b[1]-a[1])||1)}
  return S[S.length-1][0]};
const BFT_BOAT_HULL=(()=>{const P=[];for(let i=0;i<=96;i++){const x=10.4-23.4*i/96;P.push([x,bftBoatSheer(x)])}
  return[...P,...bftBoatCR(BFT_BOAT_KEEL,14).slice(1)]})();
/* a stripe between two lines down the hull, ending a hair inside the hull's outline at the
   transom and at the stem, so it never runs past the boat */
function bftBoatBand(top,bot,role,inset=.22,x={noSil:true}){
  const H=BFT_BOAT_HULL,ta=bftBoatExit(H,top,0,14)-inset,tb=bftBoatExit(H,top,0,-16)+inset,ba=bftBoatExit(H,bot,0,14)-inset,bb=bftBoatExit(H,bot,0,-16)+inset,T=[],B=[];
  for(let i=0;i<=48;i++){const x=ta+(tb-ta)*i/48;T.push([x,top(x)])}
  for(let i=48;i>=0;i--){const x=ba+(bb-ba)*i/48;B.push([x,bot(x)])}
  return bftBoatPoly([...T,...B],role,x);
}
/* the outboard's cowl, and its span at a height, so the decal sits inside it */
const BFT_BOAT_COWL_PTS=[[10.55,-3.4],[10.4,-5],[10.85,-6.2],[12.2,-6.6],[13.45,-6.2],[13.95,-4.9],[13.7,-3.45]];
const BFT_BOAT_COWL=bftBoatCR(BFT_BOAT_COWL_PTS,8,true);
const bftBoatSpan=(P,y)=>{const xs=[];for(let i=0,j=P.length-1;i<P.length;j=i++){const[a,b]=P[i],[e,d]=P[j];if((b>y)!==(d>y))xs.push(a+(e-a)*(y-b)/(d-b))}return[Math.min(...xs),Math.max(...xs)]};
function rigBftBoat(){
  const sh=bftBoatSheer;
  const hull=bftBoatPoly(BFT_BOAT_HULL,"hull");
  const rub=bftBoatBand(x=>sh(x)+.04,x=>sh(x)+.48,"rub",.12);
  const cove=bftBoatBand(x=>sh(x)+.85,x=>sh(x)+1.32,"cove");
  const boot=bftBoatBand(()=>-1.02,()=>-.32,"boot");
  /* the bottom under the water, seen through it */
  const sub=bftBoatPoly(bftBoatCR([[-9.2,.02],[-7.6,.9],[-3,1.55],[3,1.7],[8,1.45],[9.9,.9],[9.95,.02]],8),"sub",{noSil:true,op:.5});
  /* the bow rail: one tube from the pulpit at the stem head, aft along the gunwale and down to it
     again forward of the console, on two stanchions */
  const rail=[[-12.62,sh(-12.62)+.25,.3],[-12.5,sh(-12.5)-.9,.3],[-11.4,sh(-11.4)-1.2,.3],[-9.2,sh(-9.2)-1.2,.3],[-7.2,sh(-7.2)-1.15,.3],[-5.9,sh(-5.9)-.95,.3],[-5.35,sh(-5.35)-.25,.3],[-5.25,sh(-5.25)+.25,.3]];
  const [c0,c1]=bftBoatSpan(BFT_BOAT_COWL,-5),[d0,d1]=bftBoatSpan(BFT_BOAT_COWL,-4.55);
  return[{open:`<g class="bft-boat-rock">`,pivot:[0,0],layers:[
    /* the rods in the T-top's rocket launchers, raked aft, behind the canopy that holds their butts */
    {parts:[part(bftBoatTaper([[4.3,-12.1,.36],[5.5,-15.6,.2],[6.9,-19.2,.06]],{capEnd:false}),"rod",{noSil:true}),
      part(bftBoatTaper([[5.4,-12.1,.36],[6.95,-15.3,.2],[8.7,-18.5,.06]],{capEnd:false}),"rod",{noSil:true}),
      pDot(4.82,-13.3,.3,"reel",{noSil:true}),pDot(5.98,-13.2,.3,"reel",{noSil:true})]},
    /* the console and its windshield, behind the hull side */
    {parts:[bftBoatPoly([[-2.5,-3.2],[-1.85,-6.5],[1.95,-6.5],[2.15,-3.2]],"console"),
      bftBoatPoly([[-1.85,-6.45],[-.6,-7.95],[1.35,-7.95],[1.8,-6.45]],"glass")]},
    /* the T-top on its legs, and the leaning post aft of the console: a bolster and its backrest */
    {parts:[bftBoatSeg(-1.5,-3.3,-2.25,-11.6,.42,"tframe"),bftBoatSeg(2,-3.3,2.85,-11.6,.42,"tframe"),
      bftBoatSeg(3.7,-3.3,3.75,-5.6,.32,"tframe"),bftBoatSeg(5.4,-3.3,5.35,-5.6,.32,"tframe"),bftBoatSeg(3.7,-4.5,5.4,-4.5,.26,"tframe"),
      pBlob([[3.05,-5.55],[3.2,-6.45],[4.6,-6.62],[5.75,-6.5],[5.95,-5.85],[5.7,-5.4],[4.4,-5.35]],"seat"),
      pBlob([[-4.35,-11.65],[-3.85,-12.4],[1,-12.62],[5.65,-12.45],[6.15,-11.95],[5.7,-11.5],[1,-11.62],[-3.95,-11.4]],"ttop")]},
    /* the bow rail, its feet on the gunwale behind the hull's sheer */
    {parts:[part(bftBoatTaper(rail,{capStart:false,capEnd:false}),"bowrail",{noSil:true}),
      bftBoatSeg(-10.2,sh(-10.2)+.2,-10.2,sh(-10.2)-1.15,.22,"bowrail",{noSil:true}),bftBoatSeg(-7.9,sh(-7.9)+.2,-7.9,sh(-7.9)-1.12,.22,"bowrail",{noSil:true})]},
    /* the hull, its rub rail, the blue cove stripe and boot stripe, and its bottom under the water */
    {parts:[hull,rub,cove,boot,sub]},
    /* the outboard on the transom: the clamp bracket, the cowl with its decal, the midsection, the
       leg and its plate down into the water */
    {parts:[bftBoatRect(10.2,-3.3,11,-2,"motor"),
      bftBoatPoly([[10.75,-3.55],[13.35,-3.55],[13.05,-1.7],[12.75,-1.25],[11.25,-1.25],[11,-1.7]],"motor"),
      bftBoatPoly([[11.3,-1.35],[12.7,-1.35],[12.45,.1],[12.25,.5],[11.65,.5],[11.5,.1]],"motor"),
      bftBoatRect(10.95,-.3,13.2,-.02,"motor"),
      pBlob(BFT_BOAT_COWL_PTS,"motor"),
      bftBoatPoly([[c0+.35,-5],[c1-.35,-5],[d1-.35,-4.55],[d0+.35,-4.55]],"decal",{noSil:true})]}]}];
}
/* how far aft the boat reaches from its centre (the outboard's cowl), for keeping it off the gangway */
const BFT_BOAT_AFT=(()=>{const ds=[];const walk=L=>L.forEach(l=>l.parts?l.parts.forEach(p=>ds.push(p.d)):walk(l.layers));walk(rigBftBoat());const b=pathBox(ds);return +(b[0]+b[2]).toFixed(2)})();

/* the float's x extent on the dock's own water, for anything that wants it without asking the
   geometry (bftDockGeo(tide,o).float when the scene moves the water) */
const BFT_DOCK_FLOAT=bftDockGeo(.5).float.map(v=>+v.toFixed(2));

/* the layout's promises, checked at every tide: two units of open water between the outboard and
   the gangway, and a long run of float showing clear of the boat */
function bftDockCheck(o={}){
  const errs=[];
  for(const t of[1,.75,.5,.25,0]){
    const g=bftDockGeo(t,o),aft=g.boat.x+BFT_BOAT_AFT;
    if(aft+2>g.reach+1e-6)errs.push(`tide ${t}: the outboard (x ${aft.toFixed(2)}) is within 2 of the gangway (x ${g.reach.toFixed(2)})`);
    if(g.float[1]-aft<15)errs.push(`tide ${t}: only ${(g.float[1]-aft).toFixed(1)} of float shows clear of the boat`);
  }
  return errs;
}

/* ── the looks ─────────────────────────────────────────────────────────────────────────── */
const bftDockWaterSvg=(tide,lt,o={},x0=-70,x1=120)=>{
  const w=bftDockGeo(tide,o).water,c=lt&&lt.water||"#7FB2C9";
  return `<rect x="${x0}" y="${f1(w)}" width="${x1-x0}" height="${f1(30-w)}" fill="${c}" opacity=".7"/>`
    +`<path d="M ${x0} ${f1(w)} L ${x1} ${f1(w)}" stroke="#FFFFFF" stroke-opacity=".35" stroke-width=".5"/>`;
};
LOOK["dock"]={pal:{...INK.bftBoat,...INK.bftDock},box:[-56,-30,154,50],s:1,dist:.04,o:BFT_DOCK_O,ground:false,
  states:{high:{tide:1},mid:{tide:.5},low:{tide:0},lit:{tide:.3,lamp:true}},
  draw:st=>{const e=bftDockCheck();if(e.length)throw new Error(e.join("; "));return propBftDock(st.tide,{boat:rigBftBoat(),poles:true,lamp:st.lamp})},
  extra:(st,lt)=>bftDockWaterSvg(st.tide,lt)};
LOOK["boat"]={pal:INK.bftBoat,box:[-15,-21,30,24],s:1,dist:.04,o:BFT_BOAT_O,ground:false,
  draw:()=>rigBftBoat(),
  extra:(st,lt)=>`<rect x="-30" y="0" width="60" height="10" fill="${lt&&lt.water||"#7FB2C9"}" opacity=".7"/>`};
