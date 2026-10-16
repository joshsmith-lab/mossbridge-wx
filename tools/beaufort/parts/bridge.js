/* ── Beaufort: the Woods Memorial Bridge ───────────────────────────────────────────────
   The Richard V. Woods Memorial Bridge (1959, the Lady's Island Bridge until 1971), US 21
   Business over the Beaufort River between downtown and Lady's Island, on the National Register
   since January 2023. A Pratt through-truss swing span that turns on a central pivot pier to
   open its two channels, a long timber fender round the pivot, and long concrete approaches on
   rows of columns rising to meet it both ways.

   Drawn from the photographs on Wikimedia Commons ("Woods Bridge Open", "Woods Bridge at Night",
   "Woods Bridge from Ladys Island", "Woods Memorial Bridge"):
   - the truss is painted white, and its top chord is polygonal, rising from the end posts to the
     middle: the end panel is a little over half as deep as the middle one. "Pratt" on the Register
     is the web (verticals, and diagonals that all rise toward the pivot), not parallel chords;
   - the tender's house hangs under the top chord at the middle, painted with the truss, a dark band
     of windows all the way round and a catwalk rail at its foot, a mast over it;
   - the rest piers are massive concrete walls and the pivot pier a round drum with a flared cap;
   - the fender is weathered grey timber with sage-green wales and a railed cap;
   - the street lights are single-arm, and sparse; the approaches stand on close-set column bents;
   - at night: red lanterns over each end of the span and a higher one in the middle, and red lights
     low on the piers and the fender (33 CFR 118.70), which the night photograph shows.

   What has to survive at d .55 and 1.22px a unit: a white hump of triangles on a long low deck, a
   dark window band in its middle with a pin over it, three pale masses in the water under it (the
   drum and the two rest piers), and the deck's rhythm of legs running off both ways. So the truss is
   seven panels: the middle one holds the house, and the three each side are the inclined end post
   and two diagonals rising toward the pivot (a swing span hangs as two cantilevers while it is open,
   and those are its tension diagonals). The far truss is seen through the near one, a shade darker,
   a touch smaller (the way a truss 36 feet further off sits behind it), as its chords, end posts and
   verticals only: it never shows outside the near truss, and its diagonals would only double the near
   ones into a grey smear at phone size.

   Units: y=0 is the waterline, x=0 the pivot. The swing span runs x -23..23 (about 250 ft, 5.4 ft a
   unit) with its roadway at y=-7; the top chord runs straight from -12 over the end posts to -15.8 over
   the middle panel; the mast tops out at -19.3. The approaches run from x=-left to x=+right, easing
   down toward each shore.

   The turn: the span is a rigid box of two truss planes 6.6 apart round the house, and the house is an
   octagon on the pivot, so it looks the same from every side. propBftBridge({turn}) draws it turned θ
   (the right end swinging toward us) in true perspective from an eye a thousand feet off and about 26
   degrees off the river's line (BFT_BRIDGE_EYE); open is the real 90°. Drawn flat, with no perspective,
   the open span was a dome or a white post; in perspective its near end stands a third bigger than its
   far one, the near portal frames it, and it reads as the bridge swung open. The scene swings it by
   crossfading turns (see propBftBridge). */
INK.bftBridge={
  steel:"#EEEEE8",steelFar:"#B7BEC1",house:"#E4E3DA",glass:"#36414B",gear:"#A3A8A8",
  deck:"#D9D3C6",band:"#A59E91",pier:"#CFC8BB",
  fender:"#8A8270",fenderLt:"#8FAA88",cap:"#CFC8B8",mark:"#6A6356",
  rail:"#DCD6CA",lamp:"#9AA1A4",detail:"#D2D4CE",
  ink:"#2A2130",shade:"#3A2350",lit:"#FFE6B0",shadeOp:.3,litOp:.4};

/* the swing span: half its length, its panels, the roadway, the top chord's height at each panel
   point (the ends are the end posts' feet), its depth at the middle, member widths, its width (truss
   to truss), the house (width, floor, roof), the mast's top, the open angle, and how much smaller the
   far truss stands behind the near one, closed */
const BFT_BRIDGE={half:23,panels:7,road:-7,tops:[-7,-12,-13.9,-15.8,-15.8,-13.9,-12,-7],depth:8.8,
  chord:.8,web:.5,width:6.6,house:{w:4.6,floor:-12.3,roof:-15.4},mast:-19.3,open:90,far:.985};

/* the approach roadway's height at x: level where it meets the span, then easing down toward each
   shore over the outer two thirds of its run */
function bftBridgeRoad(x,{left=95,right=150}={}){
  const H=BFT_BRIDGE.half,r=BFT_BRIDGE.road;
  if(Math.abs(x)<=H)return r;
  const run=x<0?left-H:right-H,drop=x<0?3.6:3.2,t=Math.min(1,(Math.abs(x)-H)/run);
  const u=Math.max(0,(t-.3)/.7);
  return r+drop*u*u*(3-2*u);
}
/* a straight member from (x1,y1) to (x2,y2), w wide, its ends run on a little past the node so
   members meet solid */
function bftBridgeBar(x1,y1,x2,y2,w,role,o={}){
  const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,e=o.run??w*.35,h=w/2;
  const a=[x1-ux*e,y1-uy*e],b=[x2+ux*e,y2+uy*e];
  const P=[[a[0]-uy*h,a[1]+ux*h],[b[0]-uy*h,b[1]+ux*h],[b[0]+uy*h,b[1]-ux*h],[a[0]+uy*h,a[1]-ux*h]];
  return part(`M ${P.map(p=>`${f1(p[0])} ${f1(p[1])}`).join(" L ")} Z`,role,o.x||{});
}
/* a box from x0..x1, y0..y1, and any four-cornered shape */
const bftBridgeBox=(x0,y0,x1,y1,role,x)=>part(`M ${f1(x0)} ${f1(y0)} L ${f1(x1)} ${f1(y0)} L ${f1(x1)} ${f1(y1)} L ${f1(x0)} ${f1(y1)} Z`,role,x);
const bftBridgeQuad=(P,role,x)=>part(`M ${P.map(p=>`${f1(p[0])} ${f1(p[1])}`).join(" L ")} Z`,role,x);
/* the swing span's panel points along the chords, x from the left end to the right */
function bftBridgeNodes(){
  const{half,panels}=BFT_BRIDGE,p=2*half/panels;
  return Array.from({length:panels+1},(_,i)=>-half+i*p);
}
/* the truss's top outline at x: the end post's line over the end panels, the polygonal top chord
   between (with no x, the middle: the peak) */
function bftBridgeTop(x=0){
  const N=bftBridgeNodes(),T=BFT_BRIDGE.tops;
  if(x<=N[0]||x>=N[N.length-1])return BFT_BRIDGE.road;
  let i=0;while(x>N[i+1])i++;
  return T[i]+(T[i+1]-T[i])*(x-N[i])/(N[i+1]-N[i]);
}
/* where the eye is that sees the span turned, in the bridge's units: a little over the water, about a
   thousand feet off (5.4 ft a unit), and well left of the pivot, about 26 degrees off the river's line,
   from a bank the way the town sees it. Nearer the river's line the open span is a white post or a dome;
   from here it shows its side, slanting toward us, and reads as the bridge swung open */
const BFT_BRIDGE_EYE={x:-90,y:-1.5,d:185};
/* the view of the span turned θ degrees (the right end swinging toward us): where a point of the near
   truss (z=+3.3), the far truss (z=-3.3) and the span's axis lands, [x, y, scale]. Turned, it is the
   eye's own perspective: the open span points at us, so its near end stands a third bigger than its
   far one, and that convergence is what says "a bridge, end on" (drawn flat it is a dome, or a white
   post). Closed, the near truss is drawn as it is and the far one is that truss seen 36 feet further
   off, a touch smaller about the pivot and toward the eye's level, so it sits inside the near one's
   outline and shows only through it */
function bftBridgeView(deg=0,eye=BFT_BRIDGE_EYE){
  const t=deg*Math.PI/180,c=Math.cos(t),s=Math.sin(t),hw=BFT_BRIDGE.width/2,E=eye,kf=BFT_BRIDGE.far;
  if(!deg){const id=(x,y)=>[x,y,1];return{deg,c:1,s:0,near:id,axis:id,far:(x,y)=>[x*kf,E.y+(y-E.y)*kf,kf]}}
  const at=z=>(x,y)=>{const X=x*c-z*s,Z=x*s+z*c,f=E.d/(E.d-Z);return[E.x+(X-E.x)*f,E.y+(y-E.y)*f,f]};
  return{deg,c,s,near:at(hw),far:at(-hw),axis:at(0)};
}
/* one truss plane's members along the span, [x1,y1,x2,y2,width]: the top chord (split at the pivot,
   so a turned span can be drawn half by half), the inclined end posts, the verticals, and the
   diagonals, each rising toward the pivot. The middle panel has none: it holds the house */
function bftBridgeMembers(web=true){
  const N=bftBridgeNodes(),T=BFT_BRIDGE.tops,r=BFT_BRIDGE.road,C=BFT_BRIDGE.chord,W=BFT_BRIDGE.web,M=[];
  for(let i=1;i<6;i++){if(i===3)M.push([N[3],T[3],0,T[3],C],[0,T[3],N[4],T[4],C]);else M.push([N[i],T[i],N[i+1],T[i+1],C])}
  M.push([N[0],r,N[1],T[1],C],[N[7],r,N[6],T[6],C]);
  for(let i=1;i<=6;i++)M.push([N[i],r,N[i],T[i],W]);
  if(web)M.push([N[1],r,N[2],T[2],W],[N[2],r,N[3],T[3],W],[N[4],T[4],N[5],r,W],[N[5],T[5],N[6],r,W]);
  return M;
}
/* a truss plane in a view: plane "near" or "far", half -1 or 1 for one side of the pivot (0 for all),
   k thins it, and web:false leaves its diagonals out */
function bftBridgePlane(V,plane,half,role,k=1,web=true){
  const P=V[plane],out=[];
  for(const[x1,y1,x2,y2,w]of bftBridgeMembers(web)){
    if(half&&Math.sign(x1+x2)!==half)continue;
    const a=P(x1,y1),b=P(x2,y2);out.push(bftBridgeBar(a[0],a[1],b[0],b[1],w*k*(a[2]+b[2])/2,role));
  }
  return out;
}
/* the span's deck edge along a truss plane, with the girders' shadow under it */
function bftBridgeFascia(V,plane,half,role="steel"){
  const P=V[plane],r=BFT_BRIDGE.road,H=BFT_BRIDGE.half+.2,a=half>0?0:-H,b=half<0?0:H;
  return[bftBridgeQuad([P(a,r-.05),P(b,r-.05),P(b,r+1.25),P(a,r+1.25)],role),bftBridgeQuad([P(a,r+.62),P(b,r+.62),P(b,r+1.25),P(a,r+1.25)],"band")];
}
/* the sidewalk's rail along the outside of the span and the approaches: a top rail and its posts.
   P maps a point (so a turned span's rail turns with it); its posts go when they would crowd */
function bftBridgeRail(a,ya,b,yb,role="rail",P=(x,y)=>[x,y],dense=1){
  const p0=P(a,ya-.95),p1=P(b,yb-.95),out=[bftBridgeBar(p0[0],p0[1],p1[0],p1[1],.34,role,{run:0})];
  if(dense<.6)return out;
  const n=Math.max(2,Math.round((b-a)/2.6));
  for(let j=0;j<n;j++){const x=a+(j+.5)*(b-a)/n,y=ya+(yb-ya)*(x-a)/(b-a),q=P(x,y),u=P(x,y-.95);out.push(bftBridgeBar(q[0],q[1],u[0],u[1],.22,role,{run:0}))}
  return out;
}
/* where the house's windows are, {x, y, w, h}, for the scene to light at night. The house is on the
   pivot's axis and round, so it is in the same place open, closed and turning */
function bftBridgeTender(){
  const{roof}=BFT_BRIDGE.house;
  return{x:-2.05,y:f1(roof+.45),w:4.1,h:1.65};
}
/* the tender's house, hanging under the top chord in the middle panel: the octagon's walls painted
   with the truss, its band of windows all round (two of the corner posts show as mullions), the
   catwalk at its foot with its rail, and the mast carrying the middle lantern. lit cuts the windows
   through the wall, so a glow drawn under the bridge shows through them */
function bftBridgeHouse(lit=false){
  const{w,floor,roof}=BFT_BRIDGE.house,h=w/2,f=h*Math.tan(Math.PI/8),g=bftBridgeTender(),P=[];
  const hole=lit?` M ${f1(g.x)} ${f1(g.y)} L ${f1(g.x)} ${f1(g.y+g.h)} L ${f1(g.x+g.w)} ${f1(g.y+g.h)} L ${f1(g.x+g.w)} ${f1(g.y)} Z`:"";
  P.push(part(`M ${f1(-h)} ${f1(floor)} L ${f1(h)} ${f1(floor)} L ${f1(h)} ${f1(roof)} L ${f1(-h)} ${f1(roof)} Z${hole}`,"house"));
  if(!lit)P.push(bftBridgeBox(g.x,g.y,g.x+g.w,g.y+g.h,"glass",{noSil:true}));
  for(const x of[-f,f])P.push(bftBridgeBox(x-.13,g.y-.05,x+.13,g.y+g.h+.05,"detail"));
  /* the catwalk round its foot: a floor a little wider than the house, and its rail on stanchions,
     which stand clear of the walls only at the ends */
  const cw=h+.6;
  P.push(bftBridgeBar(-cw,floor+.1,cw,floor+.1,.36,"steel",{run:0}));
  for(const x of[-cw,cw]){P.push(bftBridgeBar(x,floor-.85,x+Math.sign(x)*-.6,floor-.85,.16,"steel",{run:0}),bftBridgeBar(x,floor,x,floor-.85,.15,"steel",{run:0}))}
  /* the mast, on the axis, and the middle lantern on it (the glow is its light at night) */
  P.push(bftBridgeBar(0,BFT_BRIDGE.tops[3]-.3,0,BFT_BRIDGE.mast,.24,"lamp",{run:0}));
  const m=bftBridgeNavLights().find(l=>l.kind==="span"&&l.x===0);
  if(!lit)P.push(bftBridgeBox(-.3,m.y-.3,.3,m.y+.3,"lamp"));
  return P;
}
/* the bents under each approach: [x, roadway y], about every ten units from the rest pier out to the
   end of the approach (the left one ends on its abutment, the right one runs off the frame) */
function bftBridgeBents({left=95,right=150}={}){
  const H=BFT_BRIDGE.half,B=[];
  for(const[side,len]of[[-1,left],[1,right]]){
    const run=len-H,n=Math.max(1,Math.round(run/9.8)),sp=run/n;
    for(let i=1;i<=n;i++){const x=side*(H+i*sp);B.push([x,bftBridgeRoad(x,{left,right})])}
  }
  return B;
}
/* the street lights: single-arm poles on the near rail at every third bent, the first one bent out
   from each rest pier, each arm reaching toward the river's middle. Returns the poles' feet and their
   lamps, {x, y, lx, ly} */
function bftBridgePoles({left=95,right=150}={}){
  const P=[],bents=bftBridgeBents({left,right});
  for(const[side,len]of[[-1,left],[1,right]]){
    bents.filter(([x])=>Math.sign(x)===side&&Math.abs(x)<len-.01).forEach(([x0],i)=>{
      if(i%3)return;
      const x=x0-side*1.2,y=bftBridgeRoad(x,{left,right})-.95;
      P.push({x:f1(x),y:f1(y),lx:f1(x-side*1.25),ly:f1(y-4.35)});
    });
  }
  return P;
}
/* the street lights' lamps, [x, y] (the head; its light falls just under it), for the scene to light */
const bftBridgeLamps=(o={})=>bftBridgePoles(o).map(p=>[p.lx,p.ly]);
/* the navigation lights the Coast Guard asks of a through swing span (33 CFR 118.70): three lanterns
   on top of the span, one over each end and one over the middle at least ten feet higher (on the
   house's mast), red with the span closed and green with it open, in a line over the span's long axis;
   and red lights low on the ends of the piers beside the channels and on the pivot's fender, which
   never change. The scene lights them at night as points: {x, y, c: "red" | "green", kind}. turn (or
   open) puts the span's three where the turned span carries them */
function bftBridgeNavLights({open=false,turn=null}={}){
  const deg=turn??(open?BFT_BRIDGE.open:0),V=bftBridgeView(deg),N=bftBridgeNodes(),c=deg>=45?"green":"red";
  const y=BFT_BRIDGE.tops[1]-1.15,L=[];
  for(const x of[N[1],N[6]]){const q=V.axis(x,y);L.push({x:f1(q[0]),y:f1(q[1]),c,kind:"span"})}
  L.push({x:0,y:-17.2,c,kind:"span"});
  for(const x of[0,-20.2,20.2])L.push({x,y:x?-2.1:-2.75,c:"red",kind:"pier"});
  return L;
}
/* the span's end lanterns, each on a short post over the end post's head; lit, the lantern itself is
   left off, because its glow is the lantern. P maps them onto a turned span's axis */
function bftBridgeLanterns(lit=false,P=(x,y)=>[x,y]){
  const out=[],N=bftBridgeNodes(),T=BFT_BRIDGE.tops[1],y=T-1.15;
  for(const x0 of[N[1],N[6]]){const a=P(x0,T-.3),b=P(x0,y+.25),q=P(x0,y);
    out.push(bftBridgeBar(a[0],a[1],b[0],b[1],.22,"lamp",{run:0}));if(!lit)out.push(bftBridgeBox(q[0]-.3,q[1]-.3,q[0]+.3,q[1]+.3,"lamp"));
  }
  return out;
}
/* a turned span's portal at one end (side 1, the end swung toward us, or -1): the strut across the
   end posts' heads and its knee braces, the top struts across the top chord's panel points, and, at
   the near end, the end of the deck */
function bftBridgePortal(V,side){
  const N=bftBridgeNodes(),T=BFT_BRIDGE.tops,r=BFT_BRIDGE.road,H=BFT_BRIDGE.half+.2,out=[];
  const e=side>0?6:1,ft=side>0?7:0,lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  const n1=V.near(N[e],T[e]),f1p=V.far(N[e],T[e]);
  /* at the near end both end posts face us in the light, so the portal is a whole white frame */
  if(side>0)for(const P of[V.near,V.far]){const a=P(N[ft],r),b=P(N[e],T[e]);out.push(bftBridgeBar(a[0],a[1],b[0],b[1],BFT_BRIDGE.chord*(a[2]+b[2])/2,"steel"))}
  out.push(bftBridgeBar(n1[0],n1[1],f1p[0],f1p[1],.6,"steel"));
  /* knee braces from each end post, a third of the way down it, to the strut */
  const nk=lerp(V.near(N[e],T[e]),V.near(N[ft],r),.36),fk=lerp(V.far(N[e],T[e]),V.far(N[ft],r),.36);
  const s1=lerp(n1,f1p,.26),s2=lerp(n1,f1p,.74);
  out.push(bftBridgeBar(nk[0],nk[1],s1[0],s1[1],.36,"steel"),bftBridgeBar(fk[0],fk[1],s2[0],s2[1],.36,"steel"));
  /* the top struts at the next two panel points in */
  for(const i of side>0?[5,4]:[2,3]){const a=V.near(N[i],T[i]),b=V.far(N[i],T[i]);out.push(bftBridgeBar(a[0],a[1],b[0],b[1],.38,"steel"))}
  if(side>0){const a=V.near(H,r-.05),b=V.far(H,r-.05),c=V.far(H,r+1.25),d=V.near(H,r+1.25);
    out.push(bftBridgeQuad([a,b,c,d],"steel"),bftBridgeQuad([[a[0],a[1]+.67],[b[0],b[1]+.67],c,d],"band"))}
  return out;
}
/* the bridge's lights at night, as markup in the bridge's own units, drawn over the bridge: the street
   lights' warm halos and the light under each head, their broken streaks on the water, the tender's
   lit windows (over the glass, its corner posts still showing), the red (open, green) lanterns over
   the span, and the red pier lights low on the piers and the fender with their own short streaks. They
   are light, so the sky never tones them; k (0..1) is how far into the night it is. The streaks are on
   the water (y>0), so a scene that paints the river over the bridge's feet draws them in a second call
   over the river: lights:false for the streaks, refl:false for the rest. Both calls make the same
   seeded draws, mulberry(4170), so they agree */
function bftBridgeGlow({left=95,right=150,open=false,turn=null,k=1,lights=true,refl=true}={}){
  const a=v=>Math.round(v*100)/100,r=mulberry(4170),g=bftBridgeTender(),f=BFT_BRIDGE.house.w/2*Math.tan(Math.PI/8);
  let out=`<defs><radialGradient id="bftBridgeHaloW"><stop offset="0" stop-color="#FFE2A6" stop-opacity=".75"/><stop offset=".35" stop-color="#FFC877" stop-opacity=".26"/><stop offset="1" stop-color="#FFB45A" stop-opacity="0"/></radialGradient>`
    +`<radialGradient id="bftBridgeHaloR"><stop offset="0" stop-color="#FF5A48" stop-opacity=".7"/><stop offset="1" stop-color="#FF3A2E" stop-opacity="0"/></radialGradient>`
    +`<radialGradient id="bftBridgeHaloG"><stop offset="0" stop-color="#6CFFB0" stop-opacity=".7"/><stop offset="1" stop-color="#3AE08A" stop-opacity="0"/></radialGradient></defs>`;
  out+=`<g opacity="${a(k)}">`;
  /* a light's streak down the water: dashes at uneven steps, each nudged sideways, some dropped, thinning
     and fading fast with depth. Every dash makes its draws whether or not it is drawn */
  const streak=(x,len,col,w0)=>{let d="";
    for(let yy=.9;yy<len;){const step=.8+r()*1.2,jit=(r()-.5)*1.1,wd=(.25+r()*.75)*w0*(1-yy/len*.6),drop=r()<.3,op=.62*Math.pow(1-yy/len,1.7);
      if(!drop&&op>.04)d+=`<path d="M ${f1(x+jit-wd)} ${f1(yy)} L ${f1(x+jit+wd)} ${f1(yy)}" opacity="${a(op)}"/>`;yy+=step}
    return refl?`<g stroke="${col}" stroke-width=".42" stroke-linecap="round">${d}</g>`:""};
  for(const[x,y]of bftBridgeLamps({left,right})){
    out+=streak(x,-y*1.2,"#FFC877",1);
    if(lights)out+=`<circle cx="${x}" cy="${f1(y+.6)}" r="2.8" fill="url(#bftBridgeHaloW)"/><ellipse cx="${x}" cy="${f1(y+.34)}" rx=".46" ry=".26" fill="#FFF2CC"/>`;
  }
  const nav=bftBridgeNavLights({open,turn});
  for(const l of nav.filter(l=>l.kind==="pier"))out+=streak(l.x,4.6,"#FF6A55",.55);
  if(lights){
    out+=`<circle cx="0" cy="${f1(g.y+g.h/2)}" r="3.6" fill="url(#bftBridgeHaloW)" opacity=".7"/><rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="#FFD58A"/>`
      +[-f,f].map(x=>`<rect x="${f1(x-.12)}" y="${g.y}" width=".24" height="${g.h}" fill="#7A5A36" opacity=".6"/>`).join("");
    for(const l of nav)
      out+=`<circle cx="${l.x}" cy="${l.y}" r="1.5" fill="url(#bftBridgeHalo${l.c==="red"?"R":"G"})"/><circle cx="${l.x}" cy="${l.y}" r=".34" fill="${l.c==="red"?"#FF6A55":"#8DFFC0"}"/>`;
  }
  return out+`</g>`;
}
/* the whole bridge, as a rig, back to front: the piers (the round pivot drum and the two concrete
   rest piers), the approaches (deck, rail, street lights) on their bents, the swing span, and the
   timber fenders at the waterline in front.
   The span is the joint .bft-bridge-swing, pivoting at [0,-7]. The rest pose is closed. open (90°)
   or turn θ: the span turned, in the eye's perspective, with its portals, drawn half by half so the
   end swung toward us is in front. A turn is a projection, which no 2D transform makes, so the scene
   swings it by crossfading the .bft-bridge-swing groups of a few turns (0, 30, 60, 90: opacity alone,
   the rest of the bridge is the same in every one), and the open drawing is the last of them, so
   nothing pops. lit: drawn to have bftBridgeGlow under it (the windows cut through; the glow drawn
   over it, as the scene does, covers them anyway). eye: where the turned span is seen from.
   foot: how far under the waterline the columns, piers and fenders run (the river is painted over
   them; give it room for the tide if the scene moves the far waterline) */
function propBftBridge({left=95,right=150,open=false,turn=null,lit=false,foot=.6,eye=BFT_BRIDGE_EYE}={}){
  const deg=turn??(open?BFT_BRIDGE.open:0),H=BFT_BRIDGE.half,road=BFT_BRIDGE.road,o={left,right};
  /* the approaches: straight spans between the bents, the girders' shadow under the deck, the rail */
  const A=[],bents=bftBridgeBents(o);
  for(const side of[-1,1]){
    const pts=[[side*H,road],...bents.filter(b=>Math.sign(b[0])===side)];
    for(let i=0;i<pts.length-1;i++){
      const[x0,y0]=pts[i],[x1,y1]=pts[i+1],a=Math.min(x0,x1),b=Math.max(x0,x1),ya=x0<x1?y0:y1,yb=x0<x1?y1:y0;
      A.push(part(`M ${f1(a)} ${f1(ya)} L ${f1(b)} ${f1(yb)} L ${f1(b)} ${f1(yb+1.35)} L ${f1(a)} ${f1(ya+1.35)} Z`,"deck"));
      A.push(part(`M ${f1(a)} ${f1(ya+.72)} L ${f1(b)} ${f1(yb+.72)} L ${f1(b)} ${f1(yb+1.35)} L ${f1(a)} ${f1(ya+1.35)} Z`,"band"));
      A.push(...bftBridgeRail(a,ya,b,yb));
    }
  }
  /* the street lights: a pole, its arm curving out over the road, and the head the arm ends in */
  for(const p of bftBridgePoles(o)){
    const d=Math.sign(p.lx-p.x);
    A.push(pTaper([[p.x,p.y+.2,.32],[p.x,p.y-2.8,.28],[p.x+d*.08,p.ly+.55,.24],[p.x+d*.45,p.ly-.02,.22],[p.lx-d*.42,p.ly-.05,.2]],"lamp",{capStart:false,capEnd:false}));
    A.push(pBlob([[p.lx-d*.55,p.ly-.16],[p.lx+d*.1,p.ly-.24],[p.lx+d*.55,p.ly-.02],[p.lx+d*.1,p.ly+.2],[p.lx-d*.5,p.ly+.12]],"lamp"));
  }
  /* the bents: a cap under the deck and a column, a little wider at its foot, down into the water; the
     left shore end is an abutment */
  for(const[x,y]of bents){
    if(Math.abs(x)>=(x<0?left:right)-.01){if(x<0)A.push(bftBridgeBox(x-1.8,y+1.2,x+1.3,y+1.85,"pier"),bftBridgeQuad([[x-1.5,y+1.8],[x+1.05,y+1.8],[x+1.25,foot],[x-1.7,foot]],"pier"));continue}
    A.push(bftBridgeBox(x-1.2,y+1.25,x+1.2,y+1.95,"pier"),bftBridgeQuad([[x-.45,y+1.9],[x+.45,y+1.9],[x+.55,foot],[x-.55,foot]],"pier"));
  }
  /* the piers: two concrete rest piers under the span's ends, walls with a cap and a little batter,
     and the pivot pier, a round drum: its flared cap's edge and the shadow under it curve the way a
     round thing over the eye's level does, and the turntable sits on it */
  const piers=[];
  for(const s of[-1,1]){const c=s*H;
    piers.push(bftBridgeBox(c-2.95,road+1.25,c+2.95,road+1.95,"pier"),bftBridgeQuad([[c-2.55,road+1.9],[c+2.55,road+1.9],[c+2.8,foot],[c-2.8,foot]],"pier"),
      bftBridgeQuad([[c-2.55,road+1.95],[c+2.55,road+1.95],[c+2.56,road+2.35],[c-2.56,road+2.35]],"band"));
  }
  const dr=3.4,cap=3.95,cy0=road+1.75,cy1=road+2.15,sag=.35;
  piers.push(bftBridgeBox(-3,road+1.2,3,road+1.8,"gear"));
  piers.push(part(`M ${f1(-cap)} ${f1(cy0)} L ${f1(cap)} ${f1(cy0)} L ${f1(cap)} ${f1(cy1)} Q ${f1(dr+.05)} ${f1(cy1+.2)} ${f1(dr)} ${f1(cy1+.6)} L ${f1(dr)} ${f1(foot)} L ${f1(-dr)} ${f1(foot)} L ${f1(-dr)} ${f1(cy1+.6)} Q ${f1(-dr-.05)} ${f1(cy1+.2)} ${f1(-cap)} ${f1(cy1)} Z`,"pier"));
  piers.push(part(`M ${f1(-dr)} ${f1(cy1+.6)} Q 0 ${f1(cy1+.6+sag*2)} ${f1(dr)} ${f1(cy1+.6)} L ${f1(dr)} ${f1(cy1+1)} Q 0 ${f1(cy1+1+sag*2)} ${f1(-dr)} ${f1(cy1+1)} Z`,"band"));
  piers.push(part(`M ${f1(-cap)} ${f1(cy1)} Q 0 ${f1(cy1+sag*2)} ${f1(cap)} ${f1(cy1)} L ${f1(cap)} ${f1(cy1-.12)} Q 0 ${f1(cy1-.12+sag*2)} ${f1(-cap)} ${f1(cy1-.12)} Z`,"band"));
  /* the timber fenders, end on: the pivot's runs away down the river round the drum, and the two
     short ones guard the channels' outer edges at the rest piers. Weathered grey piles, sage-green
     wales across them, a pale cap and a handrail */
  const fender=[];
  const fend=(x0,x1,top)=>{
    fender.push(bftBridgeBox(x0,top,x1,foot,"fender"));
    for(const[y0,y1]of[[top+.35,top+.62],[top+1.0,top+1.27]])fender.push(bftBridgeBox(x0,y0,x1,y1,"fenderLt"));
    const n=Math.max(2,Math.round((x1-x0)/.85));
    for(let i=0;i<=n;i++){const x=x0+.18+(x1-x0-.36)*i/n;fender.push(bftBridgeBox(x-.09,top+.25,x+.09,foot,"mark"))}
    fender.push(bftBridgeBox(x0-.1,top-.22,x1+.1,top+.08,"cap"));
    fender.push(bftBridgeBar(x0,top-.82,x1,top-.82,.14,"rail",{run:0}));
    const m=Math.max(1,Math.round((x1-x0)/2));
    for(let i=0;i<=m;i++){const x=x0+.06+(x1-x0-.12)*i/m;fender.push(bftBridgeBar(x,top-.2,x,top-.82,.14,"rail",{run:0}))}
  };
  fend(-5.2,5.2,-1.75);
  fend(-21.7,-19.3,-1.45);fend(19.3,21.7,-1.45);
  /* the swing span, in .bft-bridge-swing (pivoting at [0,-7]; an opacity crossfade between two turns
     is how the scene swings it). Back to front: closed, the far truss, the house, the near truss with
     the deck's edge and the sidewalk rail, and the end lanterns. Turned, the far end's portal and the
     deck's underside, the far end's half of each truss, the house, the near end's half of each truss,
     then the near end's portal and the lanterns */
  const V=bftBridgeView(deg,eye);
  let inner;
  if(deg===0){
    inner=[{parts:bftBridgePlane(V,"far",0,"steelFar",.8,false)},{parts:bftBridgeHouse(lit)},
      {parts:[...bftBridgeFascia(V,"near",-1),...bftBridgeFascia(V,"near",1),...bftBridgePlane(V,"near",0,"steel"),...bftBridgeRail(-H-.2,road,H+.2,road,"steel"),...bftBridgeLanterns(lit)]}];
  }else{
    const Hd=H+.2,rail=s=>bftBridgeRail(s<0?-Hd:0,road,s<0?0:Hd,road,"steel",V.near,V.c);
    const under=bftBridgeQuad([V.near(-Hd,road+1.25),V.near(Hd,road+1.25),V.far(Hd,road+1.25),V.far(-Hd,road+1.25)],"band");
    const half=s=>[{parts:[...bftBridgeFascia(V,"far",s,"steelFar"),...bftBridgePlane(V,"far",s,"steelFar",.8,false)]},
      {parts:[...bftBridgeFascia(V,"near",s),...bftBridgePlane(V,"near",s,"steel"),...rail(s)]}];
    inner=[{parts:[under,...(V.s>.15?bftBridgePortal(V,-1):[])]},...half(-1),{parts:bftBridgeHouse(lit)},...half(1),
      {parts:[...(V.s>.15?bftBridgePortal(V,1):[]),...bftBridgeLanterns(lit,V.axis)]}];
  }
  const span={open:`<g class="bft-bridge-swing">`,pivot:[0,road],layers:inner};
  return[{parts:piers},{parts:A},span,{parts:fender}];
}
/* the scene draws it far off and small, so its line is light and its crescents narrow. These are the
   widths on the phone: the scene inks it at s = its screen pixels a unit, the way look.mjs does */
const BFT_BRIDGE_INK={line:.5,heavy:.18,shade:.5,lit:.4};
LOOK["bridge"]={pal:INK.bftBridge,box:[-99,-24,252,26],s:1,dist:.55,o:BFT_BRIDGE_INK,draw:()=>propBftBridge()};
LOOK["bridge-open"]={pal:INK.bftBridge,box:[-99,-24,252,26],s:1,dist:.55,o:BFT_BRIDGE_INK,draw:()=>propBftBridge({open:true})};
/* the swing span alone, close, for looking at the truss: closed, partway round and open (not a scene key) */
LOOK["bridge-span"]={pal:INK.bftBridge,box:[-34,-22,68,24],s:1,dist:.55,o:BFT_BRIDGE_INK,states:{closed:{},turning:{turn:45},open:{open:true}},draw:(st)=>propBftBridge({left:40,right:40,...st})};
/* the bridge in its place, for looking only: Lady's Island's low hazy treeline behind it at its own
   waterline, lit and hazed roughly the way the scene will (the treeline is another drawing's; this
   is only here to check that the deck, the legs and the house read against it) */
const bftBridgeHex=(a,b,t)=>{const h=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));const A=h(a),B=h(b);
  return "#"+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,"0")).join("")};
function bftBridgeShorePreview(lt){
  let c="#4A6648";if(lt.warm)c=bftBridgeHex(c,lt.warm,.3*lt.gold);if(lt.night)c=bftBridgeHex(c,"#15223D",.62*lt.night);
  c=bftBridgeHex(c,lt.haze,.6*.72);
  const r=mulberry(160),P=[];
  for(let x=-120;x<170;){const rr=2.2+r()*2.6,y=-4.6-r()*2.2;P.push(`M ${f1(x-rr)} ${f1(y+rr)} A ${f1(rr)} ${f1(rr*1.05)} 0 1 1 ${f1(x+rr)} ${f1(y+rr)} Z`);x+=rr*(1.2+r()*.8)}
  return `<path d="${P.join(" ")} M -125 -4 L 175 -4 L 175 0 L -125 0 Z" fill="${c}"/>`;
}
LOOK["bridge-shore"]={pal:INK.bftBridge,box:[-99,-24,252,26],s:1,dist:.55,o:BFT_BRIDGE_INK,states:{closed:{},open:{open:true}},
  draw:(st)=>propBftBridge(st),extra:(st,lt)=>bftBridgeShorePreview(lt)};
/* the bridge at night with its lights on, drawn over it the way the scene draws them (for looking: the
   glow rides in a layer after the ink, and the page's CSS shows it only in the moonlit panel, the
   fourth in each row) */
LOOK["bridge-night"]={pal:INK.bftBridge,box:[-99,-24,252,40],s:1,dist:.55,o:BFT_BRIDGE_INK,states:{closed:{},open:{open:true}},
  css:`.bft-glow{display:none}figure:nth-child(4) .bft-glow{display:inline}`,
  draw:(st)=>[...propBftBridge({...st,lit:true}),{open:`<g class="bft-glow">${bftBridgeGlow(st)}</g><g>`,pivot:[0,0],layers:[]}],
  extra:(st,lt)=>bftBridgeShorePreview(lt)};
