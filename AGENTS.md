# Shared project guidance

Read this before touching anything. It exists so a fresh session does not
rediscover the same things the hard way.

## What this is

A single-file, build-free PWA. `index.html` is the whole application,
`sw.js` caches the shell, `manifest.json` makes it installable.

Production is <https://joshsmith-lab.github.io/mossbridge-wx/>, served from
`main`, and it is shared with family. The `LOCS` table holds
`mb` (Moss Bridge Ct, Porters Neck NC, coastal, gets marine + tides + tropics)
and `sp` (Bob Plumley Rd, Shady Spring WV, inland), the permanent family places.
`den` was the travel entry for the Denver trip. The trip is over, so it is
**parked**: still in `LOCS`, with its Front Range scene and the "What to wear" card,
as the template for the next trip, but out of `LOC_ORDER`, so nobody can tap to it.
A saved `mbwx-loc` only counts while its id is in `LOC_ORDER`; anything else opens
at Porters Neck. Give the next destination a new unique id and add it to
`LOC_ORDER`; reusing `den` would briefly show cached Denver weather under the new
place name.

## Ground rules

- Work on a feature branch and open a pull request. Never push directly to
  `main`, never force-push, never rename the repository.
- Never change the Pages URL, `start_url` in the manifest, or the
  `localStorage` keys (`mbwx-loc`, `mbwx-<id>`). Those are what keep the shared
  link and already-installed copies working.
- Bump `CACHE` in `sw.js` whenever the shell changes.
- Keep weather and marine guidance honest. If a source is unavailable, hide the
  element or label it unavailable. Never substitute an invented value.
- Preserve the existing UI and UX unless Josh explicitly asks for a design
  change.
- Run `node --test test.mjs` before requesting review. The tests are prose
  guardrails: they assert that specific decisions are still in the file, so when
  you deliberately change one, update the assertion in the same commit rather
  than deleting it.

## Design principles, established with Josh

- **Less text.** If the graphic already says it, delete the words. High and low
  are obvious from a tide curve. "Reapply after two hours" is nagging. Josh asked for
  addition by subtraction in September 2026, and most of what went was the page saying a
  thing twice. The headline no longer names the sky, because the condition beside the
  number and the scene under it already do. Feels-like gets its line only when it is 3° or
  more off the air, the rule the hourly readout already used, because inside that it is the
  same number twice. The hourly note is the golden-hour span or nothing.
- **The page reads top down, and the first screen is the answer.** What the family opens it
  for is now, today and the weekend, so that is the first screen on a phone: the sky (the
  reading, the headline, the chips, the scene), the next 24 hours, then the week. The week
  used to sit at the foot of the page, which put the weekend a scroll away. Under it come the
  outside call, the tide on the coast, the tropics when a system is out, Sun and Tonight side
  by side, and one credit. The charts draw in in that same order (see The charts' entrance),
  and test.mjs checks both.
- **Josh's words.** Plain, short, direct. Windy, never blustery, breezy or wind-whipped, and
  test.mjs checks the whole file for those three. No semicolons and no em dashes in the
  app's sentences (an en dash in a range like 4–7p is fine), and no "not X, it's Y". The
  family's own words stay, because they are the character: piddle, soupy (earned: real
  humidity on real heat), "Not really today", "Feed early and keep a path open", "Cold one.
  Bundle up for the morning rounds.", "Stay off the hill until it turns over", golden hour,
  "Keep the middle of the day short", "Plan on slow going", "Reading the sky…".
- **Never promise what the forecast cannot keep.** The headline is built from
  the hourly run, not from 7-day weather codes, because those flip between model
  runs and made the app name a storm date that moved every few hours. The headline's
  look-ahead is capped at three days and always prints the odds. It names what is coming from
  the wet hours' own codes, freezing rain before snow before rain (`Snow likely around 4 p.m.`,
  `Freezing rain could start any time.`, `Maybe a few flurries.`), because it once called the
  snow the Tonight card named "Rain likely". After dark the small hours before morning are
  tonight's (`Showers possible around 1 a.m.`) and only daylight is "tomorrow", so one night is
  not given two names. Windy is said from the first hour the gusts reach 28, not the windiest,
  so a gust the chip is already showing is `windy now`. The week reaches further
  because it is a chart of the run's own numbers, and the weekend note beside it stays
  numbers: a high, and the odds wherever there is rain to talk about.
- **Scales are honest.** The tide chart is measured up from the chart datum
  (0 ft MLLW), never autoscaled to the window, so the height of the water on
  screen is the water that is there.
- **Motion tracks the weather.** Cloud drift, grass and tree sway, and the
  skiff's rocking all scale with the actual wind and gusts, and the skiff's burgee hangs
  in calm air, flies level by 15 mph and flutters harder the further the gusts run above it. Everything respects
  `prefers-reduced-motion` through the `PRM` flag.
- **A picture and its label must agree.** The old wind dial pointed downwind
  while the text beside it read upwind. The vane now points into the wind, the
  way a rooftop vane does. The wind chip carries the same vane: the speed and an arrow
  into the wind. Josh does not care about "NNW", the arrow already says it, so the compass
  point is spoken only (`dirLong`, sr-only) and `dirTxt` is left to the tropics rows. Under
  1 mph the chip says `calm` with no arrow, because calm air has no direction to point, and
  gusts running 6 or more over it are still said (`calm, gusts 9 mph`): the burgee and the
  trees are moving to them.
- **Alignment comes from a rule, not a magic number.** The now block uses
  `align-items: last baseline`; the degree mark is its own flex column so
  numeral tracking can never crowd it.
- **Today means today.** Cards about today do not silently recommend tomorrow.
  Mornings almost always outscore afternoons, so `bestOutsideWindow` stays on
  today unless today is out of daylight or genuinely rough. "Out of daylight" is
  literal: a window runs from sunrise minus 30 minutes to sunset plus 30, so in
  December nobody is offered 4–7p on the water, and from about three the window is
  tomorrow's. It is said on the hour (`4–7p`, `11a–2p`, `now–5p`); today goes unsaid
  and tomorrow is always said. It is picked against the wall clock
  (`bestOutsideWindow(h,coastal,dy,now)`), because a cache opened hours after it was written
  still starts at its own first hour and offered `now–12p` at 1:40. Nothing that has ended is
  offered, `now–` is said only while now is inside the window, and a window under way is graded
  on the hours it has left.
- **The outside call is one word.** Boating season is almost over, so in September 2026
  the "On the water" card became `#outSection`: Go, Iffy or No go, with a dot in the
  call's colour, graded over the window `bestOutsideWindow` picked rather than the moment
  you look, so the word and the time beside it cannot disagree. On the coast in boat
  season (`LOCS.mb.boatSeason`, March 15 to October 31, from Josh's club trips) it is the
  boat call, titled `On the water · Figure 8`, with the window beside the word and one line
  under it: that window's top gust and that day's seas. Gusts 30 or seas 5 is No go, gusts
  22 or seas 3 is Iffy ("Stick to the ICW"), no seas reading is Iffy and never Go, rain
  likely and a feels-like under 50 are Iffy. The reading that tipped it wears the call's
  colour and nothing else is said. Off season the coast is `Outside · Porters Neck`, the
  plain outside ladder, and no marine forecast is asked for. The farm keeps its own
  sentences as the why ("Windy up here.", "Cold one. Bundle up for the morning rounds.")
  and its piddle window on a line of its own, so the word there only ever says
  "tomorrow". A warning or a storm overhead is No go with the event's name. Any No go (a
  warning, a storm overhead, thunder in the window, ice, a gale) takes the window, the piddle
  line and the bite times with it: the bite line once sat under `No go · Thunder around 4p`
  with a window inside the thunder hour. Thunder in the hour under way is `Thunder nearby`. A
  gust or a rain chance the run does not carry is unknown, never calm or dry: at best Iffy,
  `gusts unavailable` on the boat's line, `Rain odds unavailable` (and off the water
  `Gusts unavailable`) as the why, and a known No go still wins. There is no wind arrow or speed on
  the card: the chip is now and the card is the window, which is why the two gusts can
  differ. The marine run is two days, because after dark the call is tomorrow's, and a day
  it does not reach is unavailable. `boatCall`, `outsideCall` and `outsideCard` (the whole
  card: title, word, when, the boat's line, the piddle and bite lines) are pure and test.mjs
  runs them. `render()` only paints the card.
- **The sun card is the rest of today, and it steps aside.** In September 2026 the card became
  `Sun` over one bar on the 0-12 scale: the pin is now and carries the reading, the bar is lit
  as high as the rest of today goes and dims past it, and a peak still to come today is a ring
  with its hour. The four scale words stay as a quiet ruler, because they are the only thing
  that says what 8.4 means, and none of them is inked: they are laid out by CSS, and EXTREME,
  set flush right, covers about 10.2 to 12, so an inked HIGH once sat 100px left of a 10.6 pin
  standing under EXTREME. The pin's number and the lit bar carry the reading, and the bar's
  label speaks the band and the peak (`UV 4.1 now, moderate, peaking at 7.0 around 11 a.m.`). A
  peak within half a point of the pin and in its band is the pin and gets no ring. One that
  crosses into a higher band keeps its ring, its dot nudged clear of the pin, or
  `Sunscreen if you're out a while.` sat over a bar that showed nothing past LOW. The peak is
  searched from the hour now is in, so a cache opened late rings nothing that has passed, and
  the loading and error shell hide the scale with the bar. One sentence survives: the coast's
  sunscreen clock for the kids ("Sunscreen until 4 p.m.", "Sunscreen if you're out a while."),
  the farm's "Strongest sun until 4 p.m.". When nothing left today reaches 3, which is every
  evening, a storm and most winter days, both sentence functions return null, `#sunCard` is
  hidden and Tonight goes wide. A peak is never borrowed from tomorrow. The hourly run's first
  hour carries the live UV, so the sentence and the pin read the same number. The UV chip
  shows from 3 and only while the card does (`sunAdvice&&`), because a cache opened after the
  strong sun still holds a 3 from an hour that has passed.
- **The foot of the page is one credit.** `Weather data by Open-Meteo.com`, linked, in faint
  mono, because Open-Meteo's data is CC BY 4.0 and asks for it. The paragraph of sources, the
  per-place footnotes (`LOCS.*.foot`) and the refresh instructions went in September 2026:
  nobody reads them on a phone, the sources are in the README, and the stamp is already the
  retry. The one thing they said that the page needed, that the bite windows are the almanac's,
  now rides on the bite line itself (see Motion rules). Do not grow the footer back.
- Golden hour is sun elevation +6° to -4°, the convention the photo apps use.
  Blue hour is -4° to -6°. The displayed sunrise and sunset times come from the
  forecast API; sun and moon positions and the golden-hour boundaries are
  computed locally from `sunPos`.

## Storybook Ink: how the scene is drawn

In September 2026 Josh chose the scene's art direction: the storybook look of Prince of
Persia (2008). Hand-inked outlines that run heavier on the shadow side, flat colour per part,
a hard form-shadow crescent and a warm lit edge, paper grain, curled clouds. Fun, but crafted:
never clip-art, and never a deer that reads as a bean. The approved mockup put the heron,
buck, raccoon and oystercatcher at close range next to the phone-size scene; hold every new
drawing to both views.

- **Everything is drawn from parts.** The kit (`Storybook ink: the drawing kit` in
  index.html) makes smooth bodies (`pBlob`), brush strokes that change width along a
  centreline (`pTaper`: legs, bills, antlers, limbs, blades), scalloped masses (`scallop`:
  canopies, cumulus) and curls. `inkUnit()` paints a list of parts: outline, flat colour per
  role, shadow crescent, lit edge. Roles decide colour; `mark`, `band`, `eye`, `eyeRing`,
  `nose` and `detail` sit inside the silhouette and take no outline.
- **Animals are rigs.** `rigDeer`, `rigHeron` and the rest (`Storybook cast`) are layers
  back to front. Every moving joint is written out as its own group, and `joint()` wraps it
  so the group's origin is the real joint; the `#sceneSvg` CSS gives those classes
  `transform-box:view-box;transform-origin:0 0`. Never go back to pivoting a redrawn part on
  a fill-box percentage: redraw the part and the percentage walks off the shoulder. The
  keyframes themselves did not change unless a comment says so (the heron's strike and the
  buck's graze had to reach further, because the new birds and deer stand taller).
- **Colour comes from the sky.** Palettes are day colours. `renderScene` lights them with
  the sky it actually sits under: `skyStops()` gives the air that distance fades into
  (`air(c,d)`), the grey of overcast and the slate of a storm; golden hour warms toward rose
  on the way up and amber on the way down, over the same window `goldenHour()` uses; night
  drains colour before shape (`tone()`); fog takes the far things first. The light comes
  from where the sun or moon really is (`lightAt`), so the lit edge and the cast shadows are
  on the true side, fade under cloud, and are not drawn when the sun is down or veiled.
- **Outlines and shading add nothing to an animal's footprint.** The harness measures fill
  geometry, so the heavier edge is a stroke and the shadow and lit edge are the silhouette
  itself, masked. A padded rectangle there once made the oystercatcher read as clipped.
- **Grain is baked once** (`paperTex()`, a seeded tile) and laid over the big still shapes as
  a pattern. Never an SVG filter on anything inside an animated subtree: the scene repaints
  every frame something moves.
- **The picture still does not make claims.** Clouds are drawn in the scene only when there
  are clouds (10 to 85 per cent, dry, no fog) and drift with the wind. The barn lamps come on
  after sunset. The oyster rake is part of the creek and is drawn in every weather, whether or
  not the oystercatcher is on it; it is not a statement about the tide.
- **To change an animal, look at it.** `node tools/rig.mjs deer ".deer-head=rotate(100deg)"`
  renders any rig straight out of index.html, close up, in any pose and at phone size.

## Deploying

GitHub CLI (`gh`) is installed on WorkMacPro and signed in as `joshsmith-lab`.
Push the feature branch, create the PR with `gh pr create`, and check its CI with
`gh pr checks`. Use a body file for the PR description. For an authorized live
update, merge the PR after checks pass, then verify both the served HTML and
`sw.js` on the Pages URL before calling it live. Never push straight to `main`.

If authentication fails, check `gh auth status`; do not assume a different Mac's
keychain is available here. `gh auth login` followed by `gh auth setup-git` restores
the CLI route. The browser remains a fallback, but preserve UTF-8 and verify that
the resulting files match the reviewed local copies.

## Verifying visually

Three harnesses, sharing their mocked upstreams through `tools/fixtures.mjs`.

```sh
npm i playwright && npx playwright install chromium
TZ=America/New_York node tools/shots.mjs          # the copy
TZ=America/New_York node tools/interactions.mjs   # the charts, keys, warnings and retry
TZ=America/New_York node tools/scene.mjs          # the picture and its motion
TZ=America/New_York node tools/scene.mjs fog storm  # just the scenes you are working on
node tools/rig.mjs heron                          # one animal, close up and at phone size
```

`tools/shots.mjs` renders sixteen scenarios (day, night, after midnight, storm, dusk,
both family locations, an afternoon that should recommend today, a washout, a
shoulder-season moderate-UV day, and two shaped weeks: a cool snap into a warm run on a
Thursday, and a stormy Sunday week with 100% odds and a 101° high, which is also the
eight-column week), then four for the outside call and the weekend: a Saturday at the
coast in boat season, where the weekend is today and tomorrow; a mid-November Saturday at
the coast, off season, so the call is `Outside · Porters Neck` and no seas are asked for; a
cold January morning on the coast, Iffy on the cold with the sun card stepped aside; and a
boat-season day whose marine run carries no seas, which is Iffy with `seas unavailable` and
never Go. It writes screenshots to `tools/shots/` and prints the generated copy (the
headline, the chips as they are seen, the call's title, word, when, why and lines, the sun
sentence, tonight and the week's note, with the banded weekend in brackets), so wording
changes are reviewable as text. A scenario can carry an `expect`: the week's columns and
banded days, the call's title, word, why and lines, the sun card, the sun bar's spoken label,
and how many times the seas were asked for. The loading-shell check at the end also holds
the sun scale hidden while there is no bar. It exits non-zero when one does not show what it is there for.

`tools/scene.mjs` is for anything that moves. Nineteen scenes force the light
and weather that are hard to wait for: calm noon, a hard blow, golden hour, a warm
clear night, a storm, a fog morning, drizzle against a downpour, freezing rain on
the coast, a night of rain over the marsh, and the ridge by day, by evening with
the buck out, in warm rain, on a snow day, on a cold January night and in a night
downpour. The Denver scenes (and the skyline check) went out with the trip; they are
in git history before the commit that parked `den`, if the next trip wants a model.
The ridge night downpour is there on purpose: dark theme, code 82, two rain layers
and a frog, which is where the animation count goes looking for trouble. It found
some, which is the point of having it. The marsh night rain is there for the same
reason from the other direction: it is the only frame that puts the raccoon and
the fiddler crab out at the same time, so it is where two grounded animals can
collide and where either of them can end up floating. Per scene it writes the sky
and the scene on their own, counts the animations *still running* grouped by keyframe, reads
`LayoutCount` off CDP while the scene idles, and proves the page holds perfectly
still under `prefers-reduced-motion` by comparing two screenshots taken 1.4s
apart. It exits non-zero on a page error, on layout thrash, or on anything that
survives reduced motion.

Two numbers worth knowing before you change motion: every scene idles at **0-2
layouts per 6 seconds**, and the busiest scene runs **115 animations**. If either
jumps, you have added something that is not a `transform` or an `opacity`.

## Time and place

Every forecast this app reads arrives as naive local times for the place it describes, and
nearly every comparison in the file is a Date built from one of those strings. That worked
only while the phone and the place shared a clock. It stopped being true when Denver joined.

So each entry in `LOCS` carries `tz` and `tzLabel`, and the app reasons entirely in the
**location's wall clock**: `wallNow()` is this instant shifted so its local fields read as
the clock on the wall there, and the forecast is requested in that same zone, so both sides
of every comparison agree. `trueTime()` converts back, and `sunPos`, `moonPos` and
`moonPhase` call it at their own door, because astronomy needs a real instant rather than a
wall clock.

Two consequences worth knowing:

- For the two family locations with the phone at home the shift is exactly zero, so their
  behaviour is unchanged. Away from home it quietly starts being right instead of showing
  the phone's clock against home data.
- `tools/fixtures.mjs` writes each fixture on the location's own clock too. Without that the
  Denver scenes were fed Eastern sunrise and sunset, which is how a mid-August Denver
  morning came out reading 8:12am.

If you add a location, give it a `tz` and a `tzLabel`. Nothing else needs to know.

## On file size

`index.html` is about 400 KB of source (September 2026), and an early plan set
160 KB as a ceiling. That number was about the source file and it is not the
number that matters. GitHub Pages serves the file gzipped, so what a phone
actually downloads is **about 130 KB**, once, and the service worker caches it
after that. Measure both rather than trusting this paragraph: `wc -c index.html`
for the source and `gzip -6c index.html | wc -c` for roughly what is sent.

So: do not delete working code to stay under a self-imposed source limit. Write
what the app needs. If the transferred size ever approaches a few hundred KB,
revisit it then, and measure the transferred size rather than the source size.

A cycle longer than about a minute cannot be reviewed by watching it. Pause
everything (`document.getAnimations().forEach(a => a.pause())`), then walk
`currentTime` on the one animation under test and screenshot each step.
`currentTime` is measured from the start of the delay, so the negative `phase()`
delay offsets where in the loop a given value lands — read the delay off
`a.effect.getTiming()` before you trust the numbers. The heron's 97-second scan
was confirmed that way: nine tenths of the loop is a bird that does not move.

Notes: both shim `Date` rather than freezing the clock, because `page.clock`
would also stop the CSS animations that `scene.mjs` exists to look at; run them
with `TZ=America/New_York` or the mocked data and the page will disagree about
what time it is; set `PORCH_FONT_DIR` to a folder holding `bricolage.woff2` and
`spline.woff2` if Google Fonts is unreachable, otherwise type metrics are wrong
and any alignment work is misleading. If the Playwright package is present but
its bundled browser is not, set `PORCH_CHROME_PATH` to the Chrome executable
already installed on the machine.

## Motion rules

Established with Josh and enforced by `test.mjs`:

- Every motion is driven by a real reading (wind, gusts, tide, UV, temperature,
  the WMO code). Nothing moves because movement is nice.
- `transform` and `opacity` only. The one exception is the charts' entrance (below), which
  also moves a stroke's dash offset and the pen light's colour, and is one-shot and PRM-gated.
- Randomness goes through `mulberry(seed)`. `render()` re-runs on every refresh,
  visibility change and resize, so `Math.random()` reshuffles the scene under you.
- Long ambient cycles take their phase from the wall clock (`phase(seconds)`),
  so a re-render drops them back where they were instead of restarting the wait.
  A 92-second heron strike that restarts on every foreground is never seen.
- **Rain is two layers, lit against two different things.** The sky layer falls behind
  the scene and takes its ink from the sky's luminance. That is enough on the marsh,
  where the horizon is low and almost every drop crosses open sky. On the ridge a
  mountain sits under two thirds of the frame, so those same drops run dark on a dark
  fold and the picture reads as dry. The label said light rain and there was nothing
  under it to find. The fix that did **not** work was inking Shady Spring's sky drops
  heavier: the same weather drawn differently at two places reads as the app changing
  rather than the weather, and it was a rule invented to rescue a fix that belonged
  somewhere else. The sky layer is identical at all three locations and should stay
  that way. What works is a second layer *inside* the scene SVG, in front of the fold
  and pale rather than dark, fewer and longer, masked so it fades in across the crest
  instead of starting on a cut line. Count, speed and lean still come off the WMO code
  and the wind in both layers. If you add a scene with a tall silhouette in it, it
  needs the near layer too.
- **Two things falling in one picture have to fall at the same rate.** The near rain
  was first timed by feel and came out four times slower than the layer above it,
  which is what made a long drop read as a slash drawn across the scene rather than as
  rain: long and quick is a raindrop, long and slow is a scratch. A scene unit is a
  screen pixel (the viewBox width is the rendered width), so the two are directly
  comparable and the near drops are timed off the sky layer's 880px / `fallSec`,
  landing 10% quicker because they are nearer. This is worth measuring rather than
  eyeballing; four times off was invisible in a still and obvious in a strip of frames
  60ms apart.
- **A falling drop has to be longer than one frame's fall, and it has to land.** At the
  downpour rate the near drops move about 26px a frame, and at 32px long each one barely
  overlapped the frame before it, so heavy rain at Shady Spring came out as white dashes
  jumping about rather than rain. Their length now comes off that per-frame step (about
  2.6 frames, capped to the frame), tapered from tail to head the way the sky layer's
  drops fade in. They also used to run all the way to the foot of the scene, across the
  pond and straight into the page below; the mask now fades them out at the grass line,
  so the pond's rings and ticks carry the rain on the water. Check both in a strip of
  frames, not a still.
- **Draw silhouettes, not anatomy, for anything that small.** The residents now carry real
  anatomy (see Storybook Ink), but a bird in this sky is still fourteen pixels across.
  Literal feather detail at that size does not read as detail, it reads as the
  wrong animal: constant-width wings with two short strokes at each tip for
  spread primaries is exactly a bat's hand, and a zigzag trailing edge on a
  drying cormorant fills in to a mitten. Wings are filled tapers that come to a
  clean point. This was found twice, from two different directions, before it
  was written down.
- One local wildlife **cue** at a time. That rule is about the performing cue,
  the thing that moves and takes the eye, and it still holds: refine the cues,
  do not stack them.
- Under the cue sits a **resident**, unless the cue is itself the grounded animal
  occupying that habitat. It stays subordinate, but it must be large enough for
  posture, negative space and a species landmark to survive a phone screen.
  Residents move only at real joints, with long rests between gestures. The
  scene should feel alive, never busy.
- **The marsh's water band is the whole lower frame, so "in the scene" is not the
  same as "on the ground."** The ridge has a pond you can test a position against;
  the marsh does not, and the pond check in `tools/scene.mjs` exempts it for exactly
  that reason. That exemption is how the raccoon came to be drawn sixteen units out
  in the channel with its belly on the water and nothing under its feet. A heron
  standing there reads as wading; a four-footed animal standing there reads as
  floating. Waders and the fiddler crab work the flat. Anything else keeps its body
  above the bank line and wets no more than its feet, and the harness now fails a
  marsh scene where more than 45% of a land animal sits below the waterline.
- **A dark animal on the dark bank is a smudge, and a dash behind the reeds is not
  a dash.** The fiddler crab sat on the grass line, where its outline merged into
  the spartina and its ten-pixel scuttle had nothing to travel against, so the one
  cue the wet marsh has did not read as motion at all. Down on the flat with open
  water behind it the whole animal reads and the run reads as a run. It is the same
  lesson the oystercatcher's bill taught: a few units into the water buys the entire
  silhouette.
- **Positions are fractions of the frame; animals are not.** Residents are drawn at
  a fixed scale while the frame is a fraction of the screen, so a fixed fraction that
  separates two animals at 430px can run them through each other at 320. Where two
  grounded animals can be out at once, measure one off the other rather than giving
  each its own fraction.
- **Lightning is one event on one clock.** The bolt used to run on a 37-second loop and
  the sky wash on a 7-second one, so the sky lit with nothing under it and the bolt struck
  into a sky that stayed dark. They now share `STORM_P`: beats at 0, 34 and 61 per cent
  carry a strike, 17 per cent is wash only, which is a discharge inside the cloud. If you
  change one, change both, and `tools/scene.mjs` walks the cycle on a single clock to check
  that no two bolts fire together and none fires into an unlit sky.
- **Lightning is a sky effect, not a scene one.** Drawn inside the scene SVG it can only
  start a third of the way down the page, which is a bolt appearing out of clear air under
  the forecast card. It lives in the sky layer now, at z-index 0, so it runs from under the
  masthead to the horizon behind the type and the scene's treeline covers its foot. Its
  path needs the sky in real pixels, because SVG path data has no percentage units, and it
  is painted at the very end of `render()`: the alert strip, headline, chips, card and
  scene all add height to the header, and a bolt measured before them stops in mid-air.
- **A storm is more than the grid cell's own code.** Requiring `weather_code` to be 95, 96
  or 99 at the moment you look drew no lightning at all on the ordinary Wilmington August
  afternoon, where the cell reports showers and the cell next door is throwing bolts. Three
  readings say there is thunder about: the current code puts it overhead, the next three
  hours of the hourly run or an NWS thunderstorm warning put it in the area. A watch does
  not count. It says conditions are favourable, not that anything is happening.
- **Two grounded residents cannot share a lane.** The open ground beside the
  Denver skyline is about 115px wide on a phone. Standing a mule deer next to a
  magpie there forced the deer down to magpie height, and a deer the size of a
  magpie is not a deer, it is a rodent. Give the lane to one animal at a time and
  gate them on something true: mule deer take it at first and last light, the
  magpie has the rest of the day. Where a resident's size is fighting the frame,
  the answer is a schedule, not a smaller animal.
- Animals only appear in weather they would actually be out in. Frogs go under
  below 45F, fiddler crabs below 48F, and the cormorant and the cardinal exist
  because something still has to be out there when they do.
- The farm's "fish bite" windows are solunar tables: almanac folklore built on
  real moon transits from the app's own astronomy. That framing is deliberate.
  Do not upgrade them into a forecast, and do not replace them with an API; the
  honesty is that the moon times are real and the theory is the almanac's. The
  pond's extra rise rings during a window read the same moon as the card, and
  the windows disappear under any No go, a warned storm and thunder in the window among
  them, so they never read as an invitation to stand in a thunderstorm with a rod. The footer used to carry that
  framing. Now the line carries it, `fish bite · by the moon`, with the full sentence in
  its title and for screen readers.

## Interaction and reading refinements

- The hourly tooltip is measured against the visible scroll area, not the full
  820-unit chart. Keep its intrinsic width independent of its current position
  (`width:max-content`), or moving from a short reading to a long one at an edge
  measures the old constrained width and clips the next reading. Its background
  is opaque so the chart's text cannot show through.
- Hour labels, night shading, golden-hour shading, and forecast samples share one
  horizontal scale. The right edge is the final sample's time, not an extra hour
  beyond it. Snow and freezing rain keep their names in the hourly readout.
- Display the actual temperature immediately. Counting through other readings
  added motion to the numbers and let an old animation overwrite a new location.
- Only the latest refresh can paint, cache, or end the busy state. Checking the
  location alone misses home → farm → home while the first request is still in
  flight. A failed first load ends its loading state and offers the timestamp as
  retry; a failed refresh with a valid cache keeps the reading and shows its age.
- Filter expired alerts before rendering them or using them for lightning and
  outdoor advice. Active severe/extreme warnings take precedence over an otherwise
  pleasant outdoor reading and suppress fishing/best-window invitations. Include
  the NWS instruction text in the expanded alert; do not invent an instruction.
- Small labels need enough ink on both the plain paper and the tinted evening
  paper. Keep long condition names wrappable beside three-digit temperatures.
- **Chart labels are placed, not stamped.** On a phone an hour of the hourly chart is about
  twelve pixels wide, so a label every fourth hour printed straight through the high beside
  it (78° under 79°, 62° under the 61° low), and only at some widths, which is why it came
  and went between the phone and the desktop. Each label gets a box in chart units (screen
  pixels, off the mono face's .6em advance) and goes down in priority order against what is
  already drawn: the bars and key dots, then the high, now and the low, then the regular
  hours where they have room, then the rain odds, then the moon on the night band (the words
  AFTER DARK went: the band and the moon already say it, so the moon has only its own box). The high always
  keeps the space above its dot; now or the low take the space under their own dot when the
  space above is taken. Check it at 320, 375, 393 and 430, not only at one width.

- **The week is lines, not bars, and says only what the picture does not.** Josh asked for lines
  in September 2026, then sent the first version back as "too overwhelming with text and info".
  What stayed: the highs as one line with the day's number over it, the lows as a fainter line
  with smaller, fainter numbers under it, the range washed between them, drawn in by the same pen
  as the hourly chart (`week` in `REVEAL`; the lows ride along as `.rv-line2`). The warmest day is
  the one key point (ties keyed, up to three). Under a hairline sits the hourly chart's own quiet axis: the
  day in faint mono caps (TODAY in marker red, like NOW), then its sky, then the odds only where
  there is rain to talk about: from `WEEK_WET` (35%, shared with `dailyBrief`) in water, or faint
  under a wet sky on poorer odds so a rain cloud is never unqualified. A missing chance is a dash,
  never a number. What went: dates (the tapped brief carries them), chevrons, a drop and a percent
  on every dry day, and ringed dots on every point. Rain is not a third line: a daily chance is one
  reading per day, and a line through seven of them invents odds for the nights between. Every day
  but today is a button that opens its `dailyBrief`; the open day is washed under the hairline only,
  because a wash behind the chart boxed every label it crossed. Check it at 320 with a three-digit
  high and 100% odds.

- **The weekend is marked, not described.** Josh is always after the weekend (September 2026).
  With seven days the coming Sunday was missing on exactly one day of the week, Sunday itself,
  when next Saturday is the last column. So the forecast asks for eight days, and `weekSpan()`
  takes the Saturday and Sunday of the first weekend that still has a day after today: on
  Saturday, today and tomorrow; on Sunday, next weekend, because today is the rest of the page.
  The week shows seven columns, and an eighth only when that Sunday needs it, so the least
  skilful day is off the chart the other six days. Every daily series is cut to the columns shown
  in that one place, so the note and the tapped briefs never name a day the chart does not draw.
  The weekend's columns get one quiet ink band above the hairline (`.wk-we`, and `.we` on the
  columns as a hook), laid over the chart rather than under it so the labels' paper halos are
  tinted with everything else and never box. It fades in as the pen reaches Saturday. No WEEKEND
  tag: SAT and SUN are printed under it. The note beside the eyebrow is the weekend in numbers,
  `Sat 84° · Sun 82° 60% rain`, odds from `WEEK_WET`, no adjectives and never "dry weekend",
  which five to seven days out is a claim without its odds. An old seven-day cache on a Sunday
  bands the Saturday it has and invents no Sunday. Eight columns on a 320 phone are 35px, so the
  day names tighten their tracking there. Check a Sunday at 320 with three-digit highs.

- **The skiff is a Carolina center console.** Josh picked it (September 2026) from four
  drawn directions, because it is the boat that actually goes out of Wrightsville: a cream
  hull in an ink outline that runs heavier along the keel, a rust boot stripe, a water-blue
  T-top, a small outboard and a burgee, at the chart's restraint rather than the header's.
  It stands about 21px over the curve at the top of a roll, so a high label steps over it by
  the boat's actual box (23px behind now, 19px ahead), only as far as it needs to. A sweep of
  "now" across a day and a half of tides at 320, 393 and 760 found no label it touches.

## The charts' entrance

Josh asked for the temperature and tide lines to draw themselves in, left to right, "not
crazy, but appropriately cool". When the app opens, and again when you switch places, each
chart is drawn along its own time axis: a pen runs the line with a small light at its tip
(coloured by the hour it is passing on the hourly, a glint on the water on the tide) and a
comet of glow trailing it that gathers as the pen speeds up and folds away as it lands, the fill comes in behind it, the rain bars rise as it passes, each label
and dot arrives as the pen reaches it, the high rings once, and the skiff settles onto the
water at now with a ripple. The sun card's bar is drawn by the same pen (`sun` in `REVEAL`),
up the UV scale rather than along a clock: its light takes the colour of the level it passes,
the pin drops onto the bar the way the skiff settles when the pen reaches now, and a peak still
to come today pops and rings once. The hourly takes about 2.3s on a phone. Charts on screen
together draw down the page: the week follows the hourly by 0.4s, and the tide and then the sun
bar follow whichever drawing above them is still running (`REVEAL`'s keys are in page order,
and so is `RV_OF`, the observer's map). All of it is in `REVEAL` in index.html.

- **It plays to someone.** It waits until the chart is at least 30% on screen, so on a
  phone the tide plays when you scroll to it. It waits for the live forecast, or 0.9s when
  there is only the cache, so the pen does not draw one line and then swap it for another.
  The observer's word can be a render old, so a chart is measured once more before it plays.
  One that measures off screen is looked at again a frame later, because the alerts, the
  nowcast strip and the call are painted after the charts and move them again; one that
  passes mid-render plays. That look only ever holds a chart back. It never
  clears the observer's word: cleared mid-render, a week that grew back on screen stayed blank
  until the next scroll crossed a threshold.
- **A re-render continues it.** The live data landing or a resize while it runs re-applies
  the same clock with the elapsed time, instead of restarting it or snapping it to full. The
  old draw-in restarted on the live paint, so a cached line vanished and redrew.
- **One clock.** The pen's x follows `REVEAL_EASE`; the line's dash, the glow, the light and
  the fill are keyframed from that x, and each mark's delay is when the pen reaches its own
  x. The line is revealed by x, not by length, or the tide's steep flanks race the fill.
- **The wipe is WebKit-safe.** The fill is a static clip (the area under the curve) over a
  rect that slides in. Animating the *content* of a static clip is the form Safari and Chrome
  agree on; do not animate a clip path, a mask or `clip-path: inset()` instead.
- **It leaves nothing behind.** When it ends, its animations are cancelled and the chart is
  exactly what a plain render draws; the pen, glow and ring are invisible leftovers until the
  next render drops them. Reduced motion never arms it. The harnesses call `finishReveal()`
  before they count animations, time layout or take screenshots. To review the motion itself,
  clear the one-shot cleanup first (`for(const k in REVEAL)clearTimeout(REVEAL[k].end)`), or it
  cancels the animations under you mid-walk, then pause the `reveal-*` animations and step
  `currentTime` (see "A cycle longer than about a minute" above).
- **Cheap on the first frame.** The line is sampled by walking the cubics `spline()` wrote,
  not with `getPointAtLength`, which walks the whole path per call and cost 25ms. What grows
  or pops takes its transform origin from its own geometry in user space, not a fill-box
  percentage.

`tools/interactions.mjs` runs thirteen scenarios: narrow and wide chart edges, keyboard
navigation, location switching, snow/ice labels, a warning that makes the call No go with
the event's name and takes the window and bite lines until it expires, source instructions,
a farm afternoon with thunder in the run and nothing warned (No go, no piddle or bite line),
the entrance across a cache-to-live paint that drops the nowcast strip with the week at the
fold (nothing on screen left undrawn) and with no cache (the tide the live paint pushes below
the fold waits for the scroll, then draws), retry, and cached/online recovery. The two
entrance checks run with motion on; everything else runs under reduced motion. Run it with the same font and browser settings as
`tools/shots.mjs`. Request ordering and alert expiry also run in `node --test test.mjs`.

## Known issues

- `api.open-meteo.com` and `marine-api.open-meteo.com` are unreachable from some
  networks. DNS resolves, TCP never connects, on both 443 and 80. With both hosts
  down the forecast fetch fails and the page shows the last cached reading (same
  day, up to 6 hours old) and the call worked out from it, cached seas and all,
  behind the age stamp and the dimmed live dot, which reads as working but stale.
  Past 6 hours or into a new day there is no cache, and the page shows the
  unavailable state with no call. When the marine host alone fails, the forecast
  still lands and the boat call is Iffy with seas unavailable, unless the wind
  alone makes it No go. That is the honest answer, not a bug. `api.weather.gov`
  answers fine on the same network. The fix under discussion is an NWS gridpoint
  fallback source: temperature, rain chance, wind, gusts and cloud all come
  through it, UV, the 15-minute nowcast and wave height do not, so under it the
  boat call would be Iffy with seas unavailable in the same way.
