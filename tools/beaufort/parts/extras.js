/* ── Beaufort extras: two options for Josh ─────────────────────────────────────────────
   (a) The aviation nod. The family named their airframe: the F/A-18A Hornet, the Marine Corps'
   legacy Hornet, which flew out of Marine Corps Air Station Beaufort with Marine Aircraft Group 31
   for decades. So the jet is that airframe and nothing generic: seen from well below and a touch to
   the side in level flight, nearly her planform, which is what a Hornet passing over looks like and
   what carries at a dozen pixels. The long pointed nose, the leading-edge extensions running back
   from beside the windscreen nearly straight to a crisp corner with the wing, the plain trapezoid
   wing with its snag, its straight trailing edge and the Sidewinders on its tip rails, the big
   stabilators close behind it with their rounded tips and forward-swept trailing edges, the near
   tail's canted tip standing out between the two, and the two nozzles side by side. In the Marines'
   tactical greys, the lighter under the darker, with the markings toned down. It is worked out in
   metres on the real planform, measured off a scaled three-view, and projected, so the shapes agree
   with each other at every angle, then drawn about 12 units long, nose to -x.
   (b) A Lowcountry shrimp trawler, the Beaufort and Port Royal boats: worked out in feet on a
   70-foot Florida-style hull and projected the same way, seen off the bow quarter so the
   outriggers can read, standing up in a V running in and spread like wings trawling. */

/* ── (a) F/A-18A Hornet ────────────────────────────────────────────────────────────────── */
/* a straight-edged closed path through screen points, for the edges that are corners (a nose, a
   wing tip), where the kit's Catmull-Rom body would round them off */
const bftJetPoly=pts=>`M ${pts.map(p=>`${f1(p[0])} ${f1(p[1])}`).join(" L ")} Z`;
/* a thin ring along a closed outline, for the toned-down markings that are only a line: the
   outline and the same outline set in by w, run the other way round so the middle stays open */
const bftJetRing=(pts,w)=>{const n=pts.length,A=pts.reduce((a,p,i)=>{const q=pts[(i+1)%n];return a+p[0]*q[1]-q[0]*p[1]},0),sg=A>0?1:-1;
  const ins=pts.map((p,i)=>{const a=pts[(i+n-1)%n],b=pts[(i+1)%n];
    const n1=[-(p[1]-a[1]),p[0]-a[0]],n2=[-(b[1]-p[1]),b[0]-p[0]],l1=Math.hypot(...n1)||1,l2=Math.hypot(...n2)||1;
    const u=[n1[0]/l1+n2[0]/l2,n1[1]/l1+n2[1]/l2],lu=Math.hypot(...u)||1,c=Math.max(.3,(u[0]*n1[0]/l1+u[1]*n1[1]/l1)/lu);
    return[p[0]+sg*u[0]/lu*w/c,p[1]+sg*u[1]/lu*w/c]});
  return[pts,ins.reverse()]};
/* how far below the flight line we stand (0 dead level, 90 straight underneath) and how far she
   is turned away from us. From well underneath she is her planform, the long nose, the extensions,
   the wings and the stabilators in a cross, with the near tail's canted tip standing out between
   the wing and the stabilator. The far tail stands on her back behind the body, and from below it
   shows only as a sliver past it when she is nearly overhead (under, e 86), so it is drawn and
   honestly hidden rather than faked into view. Turned more than a few degrees, her straight trailing edge leans
   on the screen and the near wing reads as swept forward. She is drawn at ten units to the scene's
   unit and placed at s=.1, the way the faces in the loft and the oak are, because at twelve units the
   kit's tenth-of-a-unit rounding stair-steps every edge finer than a unit (the extensions' tips, the
   rails, the snag) */
const BFT_JET_E=70,BFT_JET_YAW=5,BFT_JET_Z=10;
/* the real planform, in metres, measured off a scaled three-view of the legacy Hornet: 17.07 long,
   11.43 across the wingtips and 12.31 across the Sidewinders, the wing's leading edge swept 26.7°
   from the extension's corner at 9 m to a straight trailing edge at 12.95 */
const BFT_JET_LEN=17.07,BFT_JET_UNITS=12.2;
function rigBftJet({trail=false,lights=false,e=BFT_JET_E,yaw=BFT_JET_YAW}={}){
  const Z=BFT_JET_Z,E=e*Math.PI/180,sE=Math.sin(E),cE=Math.cos(E),Y0=yaw*Math.PI/180,sY=Math.sin(Y0),cY=Math.cos(Y0),k=Z*BFT_JET_UNITS/BFT_JET_LEN,xc=8.7;
  /* x aft from the nose, y out toward us (the near side), Y up, all in metres. Given a yaw she
     flies a little away from us, which staggers the far side out behind the near one. The yaw is
     left out of the height on the screen: true to it, the nose sits lower than the tail, and at
     twelve pixels that reads as a dive and not as a jet going away level */
  const P=(x,y,Y)=>[((x-xc)*cY-y*sY)*k,-(y*cY*sE+Y*cE)*k];
  const reach=(w,h)=>Math.hypot(w*sE*cY,h*cE);
  /* the body's sections: x, half width, centre height, half depth. A slim pointed radome, the
     cockpit, then from 7.2 m the intakes under the extensions widen her to the engine bays */
  const S=[[0,0,-.06,0],[.45,.15,-.06,.14],[1.1,.28,-.04,.26],[1.9,.39,-.02,.36],[2.7,.47,0,.44],[3.6,.53,.03,.5],
    [4.6,.58,.04,.55],[5.6,.62,.04,.58],[6.6,.66,.02,.6],[7.2,.72,0,.62],[7.6,.96,-.06,.7],[8.4,1.02,-.06,.72],[9.4,1.05,-.04,.72],
    [10.8,1.05,0,.7],[12.2,1.02,.04,.67],[13.4,.98,.06,.62],[14.6,.95,.08,.56],[15.6,.93,.08,.5],[16.3,.9,.08,.47]];
  const halfW=x=>{for(let i=1;i<S.length;i++)if(x<=S[i][0]){const a=S[i-1],b=S[i],t=(x-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t}return S[S.length-1][1]};
  /* a section's silhouette: its centre on the screen, plus and minus how far it reaches up */
  const sec=([x,w,yc,h],sd,yo=0)=>{const[cx,cy]=P(x,yo,yc);return[cx,cy-sd*reach(w,h)*k]};
  const top=S.map(q=>sec(q,1)),bot=S.map(q=>sec(q,-1));
  const body=part(bftJetPoly([...top,...bot.slice(1).reverse()]),"body");
  /* seen from below, the lower edge of the body on the screen is its belly, turned away from the
     sky: a darker band from the bottom edge up to just under the centreline */
  const belly=part(bftJetPoly([...S.slice(1).map(q=>{const[cx,cy]=P(q[0],0,q[2]);return[cx,cy+.15*reach(q[1],q[3])*k]}),
    ...bot.slice(1).reverse()]),"belly",{noSil:true});
  /* the radome is its own grey, a shade off the airframe's, back to its joint ahead of the cockpit */
  const R=S.filter(q=>q[0]<=2.7);
  const radome=part(bftJetPoly([...R.map(q=>sec(q,1)),...R.slice(1).reverse().map(q=>sec(q,-1))]),"radome",{noSil:true});
  /* the nozzles: two barrels side by side out of the tail, each with its dark lip */
  const noz=sd=>{const yo=.47*sd,N=[[16.1,.42,.06,.42],[17.07,.4,.06,.4]],t=N.map(q=>sec(q,1,yo)),b=N.map(q=>sec(q,-1,yo));
    const[ncx,ncy]=P(17.07,yo,.06),nr=reach(.4,.4)*k,rx=Math.max(.16*k,.4*sY*k);
    return[part(bftJetPoly([...t,...b.reverse()]),"nozzle"),
      part(`M ${f1(ncx)} ${f1(ncy-nr)} a ${f1(rx)} ${f1(nr)} 0 1 1 0 ${f1(2*nr)} a ${f1(rx)} ${f1(nr)} 0 1 1 0 ${f1(-2*nr)} Z`,"mark")]};
  /* the canopy: the A's single seat, a tall bubble of clear glass from the windscreen at 3.75 m to
     about 6.3, drawn under the body so only what stands over the near shoulder shows, with the
     sky's own pale glint along it */
  const C=[[3.75,0,.6,0],[4.15,.28,.82,.24],[4.7,.37,.97,.32],[5.4,.36,.95,.3],[5.95,.26,.84,.2],[6.3,0,.74,0]];
  const canopy=part(bftJetPoly([...C.map(q=>sec(q,1)),...C.slice().reverse().map(([x,,yc])=>{const[cx,cy]=P(x,0,yc);return[cx,cy+.45*Z]})]),"canopy");
  const cg=[[4.0,.2,.76,.18],[4.5,.34,.9,.3],[5.0,.37,.96,.33]].map(q=>{const[x,y]=sec(q,1);return[x,y+.09*Z]});
  const glint=pTaper([cg[0].concat(.04*Z),cg[1].concat(.12*Z),cg[2].concat(.03*Z)],"canGlint",{per:8},{noSil:true});
  /* the wing and its extension are one plate. The extension comes off the fuselage beside the
     windscreen with a quick round shoulder, then runs back nearly straight, widening a little, to a
     crisp corner with the wing's leading edge at 9 m and 1.37 out. Out at the fold the leading edge
     steps forward, the snag, to the tip; the trailing edge runs straight back in to the fuselage */
  const wy=.12;
  const LEX=[[3.55,.52],[3.75,.6],[4.1,.67],[5.2,.86],[6.2,.99],[7.2,1.12],[8.1,1.24],[9,1.37]];
  const T=.503;/* tan 26.7° */
  const[jx,jy]=LEX[LEX.length-1],fold=4.15,TIP=5.72,LE=[[jx+(fold-jy)*T,fold],[jx+(fold-jy)*T-.13,fold+.02],[jx+(TIP-jy)*T-.13,TIP]];
  const TE=12.95,tipTE=[TE,TIP];
  const root=[];for(let x=TE;x>3.7;x-=.6)root.push([x,halfW(x)*.96]);
  const plate=sd=>bftJetPoly([...LEX,...LE,tipTE,...root].map(([x,y])=>P(x,y*sd,wy)));
  /* the wingtip: the launcher rail along the tip and an AIM-9 on it, its nose well out ahead of
     the leading edge and a cross of small fins at its tail */
  const tipLE=LE[2][0];
  const tip=sd=>{const yo=5.9*sd,my=wy-.06;
    return[part(bftJetPoly([P(tipLE-.1,5.66*sd,wy),P(tipLE,5.84*sd,wy),P(TE-.1,5.84*sd,wy),P(TE,5.66*sd,wy)]),"rail"),
      pTaper([P(9.85,yo,my).concat(.02*k),P(10.2,yo,my).concat(.11*k),P(12.7,yo,my).concat(.11*k)],"missile",{per:4,capStart:false}),
      part(bftJetPoly([P(12.4,yo,my),P(12.68,yo+.22*sd,my),P(12.74,yo+.22*sd,my),P(12.72,yo,my),P(12.74,yo-.22*sd,my),P(12.68,yo-.22*sd,my)]),"missileFin",{noSil:true})]};
  /* the stabilators, all-moving, close behind the wing: the leading edge swept 50° from 13.7 m at the
     root to the tip, the tip rounded off, and the trailing edge swept forward back in to the root
     beside the nozzles, which is the Hornet's own tailplane and nobody else's */
  const stab=sd=>part(bftJetPoly([[13.7,.95,0],[16.45,3.22,-.05],[16.85,3.28,-.05],[17.2,3.22,-.05],[17.45,3.02,-.05],[16.5,1.0,0]].map(([x,y,Y])=>P(x,y*sd,Y))),sd>0?"wing":"far");
  /* the twin tails, canted out 20°, standing on the engine bays between the wing and the
     stabilators: 2.4 m up the cant, the root from 11.8 to 14.6 m and the tip from 14 to 15.1, so
     the leading edge is swept about 43° */
  const cant=20*Math.PI/180,fh=2.4,dy=fh*Math.sin(cant),dY=fh*Math.cos(cant),fr=.95,fY=.45;
  const finPts=sd=>[[11.8,fr,fY],[14.0,fr+dy,fY+dY],[15.1,fr+dy,fY+dY],[14.6,fr,fY]].map(([x,y,Y])=>[x,y*sd,Y]);
  const fin=sd=>part(bftJetPoly(finPts(sd).map(q=>P(...q))),sd>0?"fin":"finFar");
  /* a point on a tail's outer face: f up the span from the root, g back along the chord */
  const finAt=(sd,f,g)=>{const[a,b,c,d]=finPts(sd),l=(p,q,t)=>p.map((v,i)=>v+(q[i]-v)*t);return P(...l(l(a,b,f),l(d,c,f),g))};
  const quad=(sd,f0,f1,g0,g1)=>[finAt(sd,f0,g0),finAt(sd,f0,g1),finAt(sd,f1,g1),finAt(sd,f1,g0)];
  /* a squadron's band across each tail near the tip, toned down to the darker grey, and under it on
     the near tail the two characters of its tail code, painted upright the way codes are, square to
     the fuselage and not leaning with the fin's sweep. Until the family names the squadron they are
     two plain blocks, a code too small to read, and spell nobody's */
  const upright=(sd,x0,x1,f0,f1)=>[[x0,f0],[x1,f0],[x1,f1],[x0,f1]].map(([x,f])=>P(x,(fr+f*dy)*sd,fY+f*dY));
  const finBand=sd=>[part(bftJetPoly(quad(sd,.78,.9,0,1)),"band"),
    ...(sd>0?[[13.62,13.98],[14.1,14.46]].map(([a,b])=>part(bftJetPoly(upright(sd,a,b,.4,.66)),"detail",{noSil:true,op:.42})):[])];
  /* the lower insignia, on the right wing: toned down to an outline only, the circle with its bars
     in one line, the bars half a radius deep with their upper edges level with the star's side arms,
     and the star in its own line inside. The scene flies her mirrored, nose to the right, and then
     the near wing is her right one */
  const insignia=sd=>{const cx=11.85,cy=4.92*sd,r=.36,w=.036;
    /* u along the span (out), v along the chord (forward), in metres, on the wing's underside */
    const W=([u,v])=>P(cx-v,cy+u*sd,wy-.01);
    const a18=Math.sin(Math.PI/10)*r,bt=a18,bb=a18-.5*r,bx=Math.sqrt(r*r-bt*bt),bx2=Math.sqrt(r*r-bb*bb);
    const arc=(a0,a1)=>{const o=[];for(let i=0;i<=8;i++){const a=a0+(a1-a0)*i/8;o.push([r*Math.cos(a),r*Math.sin(a)])}return o};
    const tA=Math.atan2(bt,bx),bA=Math.atan2(bb,bx2);
    /* the union of the disc and the two bars, counter-clockwise from the right bar's top */
    const outline=[[2*r,bt],...arc(tA,Math.PI-tA),[-2*r,bt],[-2*r,bb],...arc(Math.PI-bA,2*Math.PI+bA),[2*r,bb]];
    const star=[];for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,rr=i%2?r*.382:r;star.push([rr*Math.cos(a),rr*Math.sin(a)])}
    const ring=pts=>{const[o,i]=bftJetRing(pts,w);return bftJetPoly(o.map(W))+" "+bftJetPoly(i.map(W))};
    return[part(ring(outline),"insignia",{noSil:true,op:.8}),part(ring(star),"insignia",{noSil:true,op:.8})]};
  /* the pylons the Marines' jets nearly always fly with, empty: an inboard and an outboard under each
     wing, slim, hung a little below it and starting just behind the leading edge. Each is its flat
     underside and, darker, the one side face we see from below */
  const pylons=sd=>[2.3,3.85].flatMap(yp=>{const h=-.3,ww=.1,x0=jx+(yp-jy)*T+.18,x1=x0+2.3,yc=yp*sd;
    const nose=P(x0,yc,wy+h*.5),side=yc+ww;
    return[part(bftJetPoly([nose,P(x0+.3,side,wy+h),P(x1,side,wy+h),P(x1+.1,side,wy),P(x0+.25,side,wy)]),"pylonSide",{noSil:true}),
      part(bftJetPoly([nose,P(x0+.3,yc-ww,wy+h),P(x1,yc-ww,wy+h),P(x1+.12,yc,wy+h*.6),P(x1,side,wy+h),P(x0+.3,side,wy+h)]),"pylon",{noSil:true})]});
  /* two short, faint contrails, one off each engine, starting a little behind the nozzles and
     spreading as they thin out. Only for a jet up where the air makes them: one low enough to be
     this size over Beaufort is in the pattern and leaves none */
  const trails=!trail?[]:[-1,1].flatMap(sd=>{const yo=.47*sd,Y=.06,o=[];
    const seg=[[19,24,.06,.2,.32],[23.5,30,.2,.34,.22],[29.5,37,.34,.5,.12]];
    for(const[x0,x1,w0,w1,op]of seg)o.push(pTaper([P(x0,yo,Y).concat(w0*k),P(x1,yo*1.3,Y).concat(w1*k)],"trail",{capStart:false},{soft:true,op}));
    return o});
  /* under each extension, the intake's mouth, just ahead of the wing root: a dark opening looking
     forward. It hangs under the extension, so from below the near one is drawn over it */
  const intake=sd=>part(bftJetPoly([P(7.2,.7*sd,.02),P(7.32,.98*sd,-.18),P(7.36,1.0*sd,-.5),P(7.62,.98*sd,-.48),P(7.5,.95*sd,-.16),P(7.4,.72*sd,0)]),"intake",{noSil:true});
  /* the arresting hook, stowed under the tail between the nozzles */
  const hook=pTaper([P(15,0,-.42).concat(.1*k),P(16.5,0,-.4).concat(.08*k)],"mark",{capStart:false},{noSil:true,op:.45});
  /* at night, her position lights: green on the right wingtip, the near one as the scene flies her,
     red on the left, and white at the tail, between the nozzles. A light at that distance is a point
     with a bloom round it, bigger than the lamp, so each is a small bright core in a soft glow */
  const lamps=!lights?[]:[[P(tipLE+.6,5.84,wy),"lampGreen"],[P(tipLE+.6,-5.84,wy),"lampRed"],[P(17.0,0,.3),"lampWhite"]].flatMap(([[x,y],r])=>
    [pDot(x,y,1.25*k,r,{soft:true,op:.2}),pDot(x,y,.65*k,r,{soft:true,op:.4}),pDot(x,y,.32*k,r,{noSil:true})]);
  /* back to front as she is seen from below: the far tail stands on her back, behind everything, then
     the far wing, its rail and the far stabilator */
  const far=[fin(-1),...finBand(-1),part(plate(-1),"far"),...tip(-1),stab(-1),...pylons(-1)];
  const parts=[...far,fin(1),...finBand(1),canopy,glint,body,belly,radome,intake(-1),hook,...noz(-1),...noz(1)];
  /* the near tailplane and wing are their own units, so their ink runs across the body where they
     meet it and the planform reads as plates and not one grey mass */
  const layers=[{parts},{parts:[stab(1)]},{parts:[part(plate(1),"wing"),...tip(1),...insignia(1),...pylons(1),intake(1)]}];
  if(trails.length)layers.unshift({parts:trails});
  if(lamps.length)layers.push({parts:lamps});
  return[{open:`<g class="bft-jet">`,pivot:[0,0],layers}];
}
/* everything we see of her from below is underside, turned from the sky. She wears the Marines'
   tactical greys: the lighter (FS 36375) under, the darker (FS 36320) on the tails and her back, both
   in their own shadow here, so she stays a mid grey the haze can lift but never into the sky's own
   value, with the tails a step darker. The markings are toned down to the darker grey. The lamps are
   light, and the scene keeps them out of its toning the way it keeps the trawler's */
INK.bftJet={body:"#6A7279",wing:"#6A7279",far:"#5A6168",fin:"#525960",finFar:"#474D53",belly:"#565D64",radome:"#71777B",
  canopy:"#344050",canGlint:"#C4D6E2",nozzle:"#3A3D40",mark:"#1E2226",band:"#474D53",insignia:"#3F454B",detail:"#2A2E33",
  rail:"#4E545A",intake:"#24282C",missile:"#8C9398",missileFin:"#5E656B",pylon:"#626970",pylonSide:"#4A5056",trail:"#FFFFFF",
  lampGreen:"#7DF0A0",lampRed:"#FF5A4A",lampWhite:"#FFF6DC",
  ink:"#2A1B33",shade:"#2C2C46",lit:"#FFF3DA",shadeOp:.32,litOp:.6};
const BFT_JET_LOOKPAL={...INK.bftJet,lampGreen:"rgb(125,240,160)",lampRed:"rgb(255,90,74)",lampWhite:"rgb(255,246,220)"};
LOOK.jet={pal:BFT_JET_LOOKPAL,box:[-66,-50,134,100],s:1/BFT_JET_Z,dist:.5,ground:false,o:{line:.65,heavy:.5,shade:.55,lit:.5},
  states:{plain:{},trail:{trail:true},lights:{lights:true},under:{e:86,yaw:3},low:{e:40,yaw:14}},
  draw:st=>rigBftJet(st)};

/* ── (b) the shrimp trawler ────────────────────────────────────────────────────────────── */
/* seen off the bow quarter: the bow turned 38° toward us and looked at from a touch above, the
   way a boat out on the river is seen from the bluff. Feet, X aft from the stem head, Z out toward
   us, Y up from the waterline */
const BFT_SHRIMP_YAW=38,BFT_SHRIMP_ELEV=.04,BFT_SHRIMP_U=.66;
const bftShrimpPoly=pts=>`M ${pts.map(p=>`${f1(p[0])} ${f1(p[1])}`).join(" L ")} Z`;
/* feet on the boat to units on the screen, with 0 0 on the waterline amidships */
const bftShrimpP=(X,Z,Y)=>{const th=BFT_SHRIMP_YAW*Math.PI/180,cT=Math.cos(th),sT=Math.sin(th),K=BFT_SHRIMP_ELEV,U=BFT_SHRIMP_U;
  return[((X-35)*cT+Z*sT)*U,(-Y+K*(Z*cT-(X-35)*sT))*U]};
/* where her lights are, so the scene can glow them after dark: a white masthead light running, and
   trawling the green over white all round that the rules of the road give a trawler at work */
const bftShrimpLamps=booms=>booms==="out"?[[bftShrimpP(31,0,38.2),"green"],[bftShrimpP(31,0,35.4),"white"]]
  :[[bftShrimpP(31,0,44.6),"white"]];
function propBftShrimpBoat({booms="up",lamps=false}={}){
  const P=bftShrimpP;
  const lerp=(tab,X)=>{for(let i=1;i<tab.length;i++)if(X<=tab[i][0]){const[a,b]=[tab[i-1],tab[i]],t=(X-a[0])/(b[0]-a[0]||1);return a[1]+(b[1]-a[1])*t}return tab[tab.length-1][1]};
  /* the lines: the sheer springs up hard through the forward third to a high flared bow, and runs
     on down to a low working stern */
  const sheer=[[0,13.6],[1.5,12.9],[3,12.2],[5,11.5],[7,10.9],[10,10.2],[14,9.2],[18,8.5],[22,7.9],[28,7.3],[34,6.8],[48,5.8],[60,5.2],[70,4.9]];
  const deckB=[[0,0],[2,2.6],[5,5.2],[9,7.4],[14,8.9],[22,9.8],[30,10],[56,10],[64,9.7],[70,9.1]];
  const wlB=[[7,0],[11,3.6],[17,6.6],[25,8.5],[32,9.1],[56,9.1],[64,8.7],[70,8.1]];
  const Xs=[0,1.5,3,5,7,10,14,18,22,28,34,40,46,52,58,64,70];
  const nearSheer=Xs.map(X=>P(X,lerp(deckB,X),lerp(sheer,X)));
  const farSheer=Xs.map(X=>P(X,-lerp(deckB,X),lerp(sheer,X)));
  const wlXs=[7,9,11,14,17,21,25,32,40,48,56,64,70];
  const nearWl=wlXs.map(X=>P(X,lerp(wlB,X),0));
  /* the stem rakes forward and flares out over the water at the top, hollow below */
  const stem=[[7,0],[6.5,1.7],[5.9,3.4],[5.2,5.1],[4.4,6.8],[3.4,8.5],[2.3,10.2],[1.2,11.9],[0,13.6]].map(([X,Y])=>P(X,0,Y));
  const parts=[];
  /* the far bulwark's inside, the sliver between the two sheers that says we look down a little */
  parts.push(part(bftShrimpPoly([...farSheer,...nearSheer.slice().reverse()]),"band"));
  /* the winch just aft of the mast, its drum standing over the near bulwark: dark, working steel */
  {const wx=35,wy=8.4,r=1.2;
    parts.push(part(bftShrimpPoly([P(wx,-2.2,wy+r),P(wx,2.2,wy+r),P(wx,2.2,wy-r),P(wx,-2.2,wy-r)]),"winch"));
    const[ex,ey]=P(wx,2.4,wy),ew=r*Math.cos(BFT_SHRIMP_YAW*Math.PI/180)*BFT_SHRIMP_U*1.15,eh=r*1.25*BFT_SHRIMP_U;
    parts.push(part(`M ${f1(ex-ew)} ${f1(ey)} a ${f1(ew)} ${f1(eh)} 0 1 0 ${f1(2*ew)} 0 a ${f1(ew)} ${f1(eh)} 0 1 0 ${f1(-2*ew)} 0 Z`,"winchEnd"));
    for(const z of[-1,0,1])parts.push(pTaper([P(wx,z,wy+r*.9).concat(.12),P(wx,z,wy-r*.9).concat(.12)],"detail",{capStart:false,capEnd:false},{noSil:true,op:.5}))}
  /* the near side goes on after the house, so its bulwark hides the foot of the house the way
     the real one does */
  const hullSide=[];
  /* the near side: sheer aft, down the transom's corner, the waterline forward, up the stem */
  hullSide.push(part(bftShrimpPoly([...nearSheer,P(70,8.1,0),...nearWl.slice().reverse(),...stem.slice(1)]),"hull"));
  /* the boot stripe at the waterline and the rub rail under the sheer */
  const wlUp=wlXs.map(X=>P(X,lerp(wlB,X)+.15,1.1));
  hullSide.push(part(bftShrimpPoly([...nearWl,...wlUp.slice().reverse()]),"boot",{noSil:true}));
  const railXs=Xs.slice(1);
  hullSide.push(part(bftShrimpPoly([...railXs.map(X=>P(X,lerp(deckB,X),lerp(sheer,X)-.2)),...railXs.slice().reverse().map(X=>P(X,lerp(deckB,X)-.05,lerp(sheer,X)-1.1))]),"rail",{noSil:true}));
  /* rust: off the hawse pipe at the bow and the scuppers aft */
  const streak=(X,Y0,Y1,w)=>{const z=lerp(deckB,X)*.98;return pTaper([P(X,z,Y0).concat(w),P(X+.3,z,(Y0+Y1)/2).concat(w*.7),P(X+.5,z,Y1).concat(.08)],"rust",{},{noSil:true,op:.6})};
  hullSide.push(streak(4.6,lerp(sheer,4.6)-2.4,5.2,.55),streak(36.1,lerp(sheer,36)-2.1,1.8,.45),streak(47.1,lerp(sheer,47)-2.1,1.6,.4),streak(57.1,lerp(sheer,57)-2.1,1.5,.4));
  hullSide.push(pDot(...P(4,lerp(deckB,4),lerp(sheer,4)-2.1),.32,"detail"));
  /* her name on the bow: two short words of dark lettering, too small to read */
  for(const[X0,n]of[[8.6,5],[13.6,4]])for(let i=0;i<n;i++){const X=X0+i*.85,z=lerp(deckB,X)+.05,Y=lerp(sheer,X)-2.1;
    hullSide.push(part(bftShrimpPoly([P(X,z,Y),P(X+.55,z,Y),P(X+.55,z,Y-.85),P(X,z,Y-.85)]),"detail",{noSil:true,op:.85}))}
  /* the scuppers the rust runs from */
  for(const X of[36,47,57])hullSide.push(part(bftShrimpPoly([P(X-.3,lerp(deckB,X),lerp(sheer,X)-1.6),P(X+.7,lerp(deckB,X),lerp(sheer,X)-1.6),P(X+.7,lerp(deckB,X),lerp(sheer,X)-2.1),P(X-.3,lerp(deckB,X),lerp(sheer,X)-2.1)]),"detail",{noSil:true,op:.7}));
  /* the mast stands behind the house, a crosstree near its head */
  const mastTop=P(31,0,44);
  const spar=(a,b,w0,w1)=>pTaper([a.concat(w0),[(a[0]+b[0])/2,(a[1]+b[1])/2,(w0+w1)/2],b.concat(w1)],"spar");
  parts.push(spar(P(31,0,6),mastTop,.75,.5));
  parts.push(spar(P(31,-3,40),P(31,3,40),.35,.35));
  /* the pilothouse, forward, its front raked out at the top, a stack at its after corner. The roof
     barely overhangs, and its edge is a darker fascia, so it reads as a lid and not a sheet */
  const hz=7,y0=lerp(sheer,12)-2.2,y1=y0+8.4,ov=.15;
  const hf=[P(12.6,-hz,y0),P(12.6,hz,y0),P(11.6,hz,y1),P(11.6,-hz,y1)];
  const hs=[P(12.6,hz,y0),P(28,hz,y0-.6),P(28,hz,y1),P(11.6,hz,y1)];
  const roof=[P(11.6-ov,-hz-ov,y1),P(11.6-ov,hz+ov,y1),P(28+ov,hz+ov,y1),P(28+ov,-hz-ov,y1)];
  parts.push(part(bftShrimpPoly(hf),"houseFront"),part(bftShrimpPoly(hs),"house"),part(bftShrimpPoly(roof),"roof"));
  parts.push(part(bftShrimpPoly([P(11.6-ov,-hz-ov,y1),P(11.6-ov,hz+ov,y1),P(28+ov,hz+ov,y1),P(28+ov,hz+ov,y1-.7),P(11.6-ov,hz+ov,y1-.7),P(11.6-ov,-hz-ov,y1-.7)]),"fascia",{noSil:true}));
  /* three panes across the front, two and a door down the near side */
  for(const z of[-4.6,0,4.6])parts.push(part(bftShrimpPoly([P(12.15,z-1.8,y1-1.3),P(12.15,z+1.8,y1-1.3),P(12.35,z+1.8,y1-3.6),P(12.35,z-1.8,y1-3.6)]),lamps?"glassLit":"glass",{noSil:true}));
  for(const[x0,x1,b]of[[14,17.5,y1-3.6],[19,22.5,y1-3.6],[24.2,26.4,y0+.4]])parts.push(part(bftShrimpPoly([P(x0,hz,y1-1.3),P(x1,hz,y1-1.3),P(x1,hz,b),P(x0,hz,b)]),lamps&&b>y0+1?"glassLit":"glass",{noSil:true}));
  parts.push(pTaper([P(26.6,4.6,y1-.2).concat(1.1),P(26.6,4.6,y1+5).concat(.95)],"stack"),pTaper([P(26.6,4.6,y1+4).concat(1),P(26.6,4.6,y1+5.4).concat(.95)],"stackTop",{capStart:false}));
  /* on the roof: the radar bar on its post and the whip */
  parts.push(spar(P(18,0,y1),P(18,0,y1+3.2),.35,.3),pTaper([P(18,-2.6,y1+3.4).concat(.42),P(18,2.6,y1+3.4).concat(.42)],"spar"));
  parts.push(pTaper([P(24,-4,y1).concat(.22),P(24,-4,y1+9).concat(.08)],"spar"));
  parts.push(...hullSide);
  /* the trawl doors: tarred plank boards on a steel shoe that turns up at the leading end, hung on
     their chains at the rail by the outriggers' feet. The near one against the hull side, the far
     one standing just over the far bulwark */
  const door=(X0,X1,z,yt,h)=>{const sh=.38,lead=1.3,out=[];
    const yb=yt-h;
    out.push(part(bftShrimpPoly([P(X0+lead*.4,z,yt),P(X1,z,yt),P(X1,z,yb),P(X0+lead,z,yb),P(X0,z,yb+h*.42)]),"door"));
    out.push(part(bftShrimpPoly([P(X0+lead,z,yb+sh),P(X1,z,yb+sh),P(X1,z,yb),P(X0+lead,z,yb),P(X0,z,yb+h*.42),P(X0+.35,z,yb+h*.42+.1)]),"shoe",{noSil:true}));
    for(const f of[.36,.64])out.push(pTaper([P(X0+lead*(1-f)*.7+.3,z,yb+h*f).concat(.1),P(X1-.2,z,yb+h*f).concat(.1)],"plank",{capStart:false,capEnd:false},{noSil:true}));
    out.push(rig(P(X0+2,z,yt),P(X0+3.4,z-.3,yt+1.4),.12),rig(P(X1-1.5,z,yt),P(X1-2.8,z-.3,yt+1.4),.12));
    return out};
  const rig=(a,b,w=.12)=>pTaper([a.concat(w),b.concat(w)],"rig",{capStart:false,capEnd:false,per:1},{noSil:true});
  /* the outriggers stand off the rail beside the mast. Up, running in or tied up, they rise 65° in
     a V; out, trawling, they come down to 30° over the water, swept a touch aft, like wings */
  const up=booms!=="out",al=(up?65:30)*Math.PI/180,aft=up?0:.05,L=44;
  const boom=sd=>{const piv=[31.5,9.6*sd,6.4],d=[aft,Math.cos(al)*sd,Math.sin(al)],n=Math.hypot(...d);
    return{piv,tip:piv.map((v,i)=>v+L*d[i]/n),at:t=>piv.map((v,i)=>v+L*t*d[i]/n)}};
  const strand=(a,b,w=.1,role="netDark")=>pTaper([a.concat(w),b.concat(w)],role,{capStart:false,capEnd:false,per:1},{noSil:true});
  const side=sd=>{const b=boom(sd),out=[],r=mulberry(sd>0?71:73),j=a=>(r()-.5)*a;
    if(up){
      /* the net hauled up to dry: its head down at the rail where the doors hang, its body slung
         along the outrigger to the block at the end, so it hangs off the spar in a long sagging
         drape on the outboard side, the way the boats lie at the Port Royal docks. Tarred mesh is
         near black, and the sky shows through it: a dark see-through drape crossed both ways by
         its twine, no outline, so it stays netting and never a sail */
      const ts=[.22,.3,.38,.46,.54,.62,.7,.78,.86,.93,.98],B=ts.map(t=>P(...b.at(t)));
      /* the body of the net piles toward the block, so the drape runs on into the bag at the end and
         the two read as one net and never as a pod on a stick */
      const sag=t=>4.3*Math.pow(Math.max(0,Math.sin(Math.PI*(t-.2)/.78)),.55)+(t>.58&&t<.84?.6:0);
      const low=ts.map((t,i)=>[B[i][0]+j(.5),B[i][1]+sag(t)+j(.6)]);
      out.push(pBlob([...B,...low.slice().reverse()],"net",{noSil:true,op:.86}));
      /* the twine: diagonals both ways between the spar and the footrope, catching the light */
      const at=(i,f)=>[B[i][0]+(low[i][0]-B[i][0])*f,B[i][1]+(low[i][1]-B[i][1])*f];
      for(let i=0;i<ts.length-1;i++){out.push(strand(at(i,.08),at(i+1,.96),.09,"twine"),strand(at(i+1,.08),at(i,.96),.09,"twine"))}
      out.push(pTaper(low.map(p=>p.concat(.2)),"netDark",{capStart:false,capEnd:false},{noSil:true}));
      out.push(pTaper([P(...b.piv).concat(.7),P(...b.at(.5)).concat(.55),P(...b.tip).concat(.38)],"spar"));
      out.push(rig(P(31,0,43),P(...b.tip)));
      /* the bag, the net's cod end, hung off the block at the very end of the outrigger on a short
         pendant, so nothing of the spar stands up over it (a stub over a dark head is a cattail): a
         long narrow sack of mesh, pinched and tied at its neck, bellied in its lower third. It
         swings, pendant and all */
      const [hx,hy]=P(...b.at(.995)),k=j(.3);
      const sack=[[hx-.15,hy+1.3],[hx+.17,hy+1.3],[hx+.4,hy+2.3],[hx+.48+k,hy+3.6],[hx+.7+k,hy+5.1],[hx+.62,hy+6.3],[hx+.26,hy+6.95],[hx-.26,hy+6.9],[hx-.6,hy+6.2],[hx-.66+k,hy+4.9],[hx-.46+k,hy+3.4],[hx-.38,hy+2.2]];
      out.push({net:true,piv:[hx,hy],parts:[
        rig([hx,hy],[hx,hy+1.4],.14),
        pBlob(sack,"net"),
        strand([hx-.4,hy+2.5],[hx+.52,hy+4.1],.09,"twine"),strand([hx+.44,hy+2.6],[hx-.6,hy+4.5],.09,"twine"),strand([hx-.64,hy+4.6],[hx+.5,hy+6.6],.09,"twine"),strand([hx+.66,hy+4.7],[hx-.44,hy+6.6],.09,"twine"),
        pTaper([[hx-.28,hy+1.42,.32],[hx+.3,hy+1.42,.32]],"tie",{capStart:false,capEnd:false},{noSil:true})]});
    }else{
      out.push(pTaper([P(...b.piv).concat(.7),P(...b.at(.5)).concat(.55),P(...b.tip).concat(.38)],"spar"));
      out.push(rig(P(31,0,43),P(...b.tip)));
      /* trawling: the warp off the outrigger's end runs well aft and down into the water behind
         the transom, the far one just clear of the stern's quarter */
      const t=b.tip,w=sd>0?[80,44,0]:[116,-44,0];
      out.push(rig(P(...t),P(...w),.16));
      const[fx,fy]=P(...w);out.push(pTaper([[fx-1.2,fy,.3],[fx+1.3,fy+.1,.2]],"foam",{},{soft:true,op:.8}));
    }
    return out};
  const far=side(-1),near=side(1);
  /* the doors hang at the rail only while she is not fishing (trawling they are down on the net):
     the far one goes behind the hull, the near one in front of it, both just aft of the outriggers'
     feet so the boom, the winch and the door each keep their own place */
  const farDoor=up?door(38.5,49,-lerp(deckB,43)-.35,lerp(sheer,43)+1.5,3.2):[];
  const nearDoor=up?door(37.5,48,lerp(deckB,43)+.35,lerp(sheer,43)+.05,3.2):[];
  /* the forestay over the house to the stem head */
  parts.push(rig(P(31,0,43),P(.4,0,13.4),.12));
  /* after dark: the house lit, and the lights the rules of the road give her. Running, a white
     masthead light; trawling, green over white, all round, on the mast */
  if(lamps)for(const[[lx,ly],c]of bftShrimpLamps(booms))parts.push(pDot(lx,ly,.42,c==="green"?"lampGreen":"lampWhite",{noSil:true}));
  const lay=(list)=>{const L=[{parts:list.filter(p=>!p.net)}];
    for(const n of list.filter(p=>p.net))L.push({open:`<g class="bft-shrimp-net">`,pivot:n.piv,layers:[{parts:n.parts}]});return L};
  return[{open:`<g class="bft-shrimp-ride">`,pivot:[0,0],layers:[...lay(far),...(farDoor.length?[{parts:farDoor}]:[]),{parts},...(nearDoor.length?[{parts:nearDoor}]:[]),...lay(near)]}];
}
INK.bftShrimp={body:"#F2EFE6",hull:"#F2EFE6",band:"#D3D6CC",rail:"#2E4A3F",boot:"#8E3326",rust:"#985532",detail:"#2A2A33",
  house:"#F1EEE5",houseFront:"#E1E0D6",roof:"#C9D0C8",fascia:"#8F9790",glass:"#2B3A4C",stack:"#4A4542",stackTop:"#1E1C1E",
  winch:"#3A3634",winchEnd:"#55504C",door:"#3B3029",shoe:"#5E5A55",plank:"#241C17",
  spar:"#9C9A92",rig:"#5A5560",net:"#232B26",netDark:"#141A16",twine:"#5F6B62",tie:"#B59A6A",foam:"#FFFFFF",
  glassLit:"#FFCF7A",lampWhite:"#FFF6DC",lampGreen:"#7DF0A0",
  ink:"#2A1B33",shade:"#3A2350",lit:"#FFE6B0",shadeOp:.3,litOp:.45};
const BFT_SHRIMP_O={line:.55,heavy:.28,shade:.7,lit:.45};
/* the preview's night glow round the lamps. Light is not toned by the night or faded by the haze
   (the scene keeps lampWhite, lampGreen and glassLit out of its toning, the way the cat's eyeNight
   is), so the preview hands them over in a form its toning passes by */
const BFT_SHRIMP_LOOKPAL={...INK.bftShrimp,glassLit:"rgb(255,207,122)",lampWhite:"rgb(255,246,220)",lampGreen:"rgb(125,240,160)"};
const bftShrimpGlow=(st,lt)=>!st.lamps||!lt.night?"":bftShrimpLamps(st.booms).map(([[x,y],c])=>{const col=c==="green"?"#7DF0A0":"#FFF1C8";
  return`<circle cx="${f1(x)}" cy="${f1(y)}" r="2.2" fill="${col}" opacity=".22"/><circle cx="${f1(x)}" cy="${f1(y)}" r="1" fill="${col}" opacity=".5"/>`}).join("");
/* She is drawn about 40 units long and registered at s .55: the scene stands her beyond the bridge
   at the far shore, where a 70-foot boat's rig is shorter than the swing span's truss. Moved in
   front of the bridge onto open water (y 170 to 176) she wants about .85, passed as look()'s scale */
const BFT_SHRIMP_S=.55;
LOOK["shrimpboat-up"]={pal:BFT_SHRIMP_LOOKPAL,box:[-21,-35,46,38],s:BFT_SHRIMP_S,dist:.45,o:BFT_SHRIMP_O,
  states:{day:{booms:"up"},lamps:{booms:"up",lamps:true}},draw:st=>propBftShrimpBoat(st),extra:bftShrimpGlow};
LOOK["shrimpboat-out"]={pal:BFT_SHRIMP_LOOKPAL,box:[-23,-33,68,36],s:BFT_SHRIMP_S,dist:.45,o:BFT_SHRIMP_O,
  states:{day:{booms:"out"},lamps:{booms:"out",lamps:true}},draw:st=>propBftShrimpBoat(st),extra:bftShrimpGlow};
