# Shared project guidance

Read this before touching anything. It exists so a fresh session does not
rediscover the same things the hard way.

## What this is

A single-file, build-free PWA. `index.html` is the whole application,
`sw.js` caches the shell, `manifest.json` makes it installable.

Production is <https://joshsmith-lab.github.io/mossbridge-wx/>, served from
`main`, and it is shared with family. The `LOCS` table holds
`mb` (Moss Bridge Ct, Porters Neck NC, coastal, gets the water + tides + tropics)
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
  same number twice. The hourly note is the golden-hour span or nothing. It names the next band;
  a finger inside any gold band, tomorrow morning's too, reads a quiet gold `golden hour` on the pill.
- **The page reads top down, and the first screen is the answer.** What the family opens it
  for is now, today and the weekend, so that is the first screen on a phone: the sky (the
  reading, the headline, the chips, the scene), the next 24 hours, then this week. The week
  used to sit at the foot of the page, which put the weekend a scroll away. Under it comes the
  wave, the water and its tide at the coast and the moon at the farm, in the same place; the
  tropics when a system is out; the cards (a sentence card when there is something to say, then
  Sun and Tonight side by side); the year; and one credit. The charts draw in in that same order
  (see The charts' entrance), and test.mjs checks both.
- **One shape for every section, and both places run alike.** Josh asked for the page to be
  "symmetrical and predictable" through the scroll (September 27 2026), after two lines of text
  crept in between the water's title and its chart. So every chart section is a title with one
  short note on the right, then the picture, then its labels (the hours, the days, the tides, the
  months), and nothing sits between a title and its chart. Sentences are cards, together with Sun
  and Tonight. The coast and the farm have the same sections in the same order, the tide at one
  and the moon at the other. A new reading goes in a note, on a chart or in a card, never as a
  line of text over a chart. The week's title reads `This week`.
- **Josh's words.** Plain, short, direct. Windy, never blustery, breezy or wind-whipped, and
  test.mjs checks the whole file for those three. No semicolons and no em dashes in the
  app's sentences (an en dash in a range like 4–7p is fine), and no "not X, it's Y". The
  family's own words stay, because they are the character: piddle, soupy (earned: real
  humidity on real heat), "Feed early and keep a path open", "Cold one.
  Bundle up for the morning rounds.", "Stay off the hill until it turns over", golden hour,
  "Keep the middle of the day short", "Plan on slow going", "Reading the sky…". Noon and midnight
  are words in a sentence (`Thunder possible around noon.`, `Sunscreen until noon.`), never
  `12 p.m.`; the charts keep `12p` and `12a`. A midnight belongs to the day it ends: at 1 a.m. the
  00:00 at the far end of the run is `around midnight.`, never `midnight tomorrow`, which reads as
  the end of tomorrow, a day late. The sliders' spoken sentences keep the same rule (`noon, 95
  degrees`, `High tide Monday at 2 am`).
- **Never promise what the forecast cannot keep.** The headline is built from
  the hourly run, not from 7-day weather codes, because those flip between model
  runs and made the app name a storm date that moved every few hours. The headline's
  look-ahead is capped at three days and always prints the odds. It names what is coming from
  the wet hours' own codes, freezing rain before snow before rain (`Snow likely around 4 p.m.`,
  `Freezing rain could start any time.`, `Maybe a few flurries.`), because it once called the
  snow the Tonight card named "Rain likely". After dark the small hours before morning are
  tonight's (`Showers possible around 1 a.m.`) and only daylight is "tomorrow", so one night is
  not given two names. Thunder the run carries on poor odds is still thunder (`Thunder possible
  around noon.`, and `Windy by 11 a.m., then thunder possible around 2 p.m.` when the wind comes
  an hour or more first, with "tomorrow" said once), never `Should stay dry.`, which once sat over a
  card naming the thunder. The headline speaks from the hour now is in, so a cache opened at 11:40
  does not say `Thunder nearby.` about a storm that passed at nine. The headline
  hands the cards under it a list of what it named and when (`told`: Rain, Freezing rain, Snow,
  Windy, Thunder), so they say what to do and not the same thing again. Windy is said from the first hour the gusts reach 28, not the windiest,
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
- **Today means today.** A sentence about today does not silently talk about tomorrow. The water's
  and the farm's sentences speak for the hours `coveredHours(h,dy,now)` gives: the daylight still
  to come today, from the hour now is in, each hour inside sunrise minus 30 minutes to sunset plus
  30, so in December nobody is told about 5p on the water, and from about five the hours are
  tomorrow's. Tomorrow is always said and today goes unsaid. It is read against the wall clock,
  because a cache opened hours after it was written still starts at its own first hour.
- **Nothing is scored or picked.** Until September 27 2026 the outside card was one word, Go,
  Iffy or No go, beside a "best" three hours. Josh sent it back: a word was too little on a boat
  day and made no sense at the farm, and the best time was a score of rain, gusts, heat and cold
  that nobody could see the reason for ("based on what?"). So `bestOutsideWindow`, the word, its
  dot and "best time to piddle" are gone, and what is left is a short sentence on a card of its
  own above Sun and Tonight (`#sayCard`, a `.lead` in `go`, `caution` or `no`, the colours the
  Sun and Tonight leads use), with nothing under it. A clock is
  said only for the hour a real thing happens at: thunder coming in, the wind coming up or laying
  down, freezing rain or snow on the way. Rain still to come gets no clock on the cards, because
  the headline names its first wet stretch and the hour. What the headline has already named is
  not said again: thunder and wind at that very hour, rain, freezing rain and snow at that hour or
  earlier inside the hours the card speaks for, so tonight's thunder or 2 a.m. snow is not
  tomorrow's. When it goes unsaid, what to do carries the day (`Piddle before the thunder
  tomorrow.`, `Feed early tomorrow and keep a path open.`), so a card about tomorrow never reads
  as tonight's.
  Josh saw the options drawn into the real page and picked these (the farm is his option A).
- **The water, all year.** On the coast the card and the tide chart are one section, `Water ·
  Wrightsville Beach`, because every reading in it comes from there. The note beside the title
  is the water temperature and the seas (`77° · seas ~2 ft`, from `waterNote`), and without them
  the tide's turn (`rising · high 8:28p`); the chart already shows rising or falling and the next
  high, so those words are only the fallback. The skiff rides the table's curve, where Josh wants
  it (September 28 2026, after a day of it floating at the gauge), and the level is said beside it:
  when the station's gauge runs off the table, `+1.5 ft` or `−1 ft` rides beside the boat. Josh saw
  three ways drawn (this tag alone, a short waterline at the gauge's height with a dotted riser to
  the boat, and the gauge's own last hours as a second line) and chose the tag, the least ink that
  still says it, so the scale is the table's own and nothing is drawn at the gauge's height. The tag
  is placed, not stamped: beside the bow at the waterline, behind the stern, then over the boat
  (under it when the water is under the table), then the nearest spot to the boat the tide line
  does not cross, off the boat, because stamped beside the bow it sat on the rising flank at a low
  two feet over and its paper halo cut the water at now. The now line runs into the boat, and stops
  over the tag when the tag sits on it. A low's tick goes under the tag and the boat. A high label
  steps over the boat and its tag.
  The sentence (`Running 1.5 ft above the tide table.`) is said to screen readers with the chart.
  The boat's sentence, while the boat is going out, is a card, `The boat`. Nothing is
  graded or coloured off season: the seas are the hour now is in, the water temperature is now,
  and the wind is the chip's. The seas are Open-Meteo's
  marine model, hour by hour for two days, asked for every day of the year. It ran low against
  buoy 41110 off Masonboro Inlet and its makers say it is not for navigation, so it is said to
  the whole foot with "about" ("under 1 ft" below half a foot). The water temperature is NOAA's
  own at station 8658163, said only while under an hour old, with no model to fall back on. The
  level reads the station's six-minute gauge against the table's six-minute marks over the
  gauge's last half hour (`levelFeet`, and `levelGap` for its sentence), from half a foot, to the
  half foot. On September 27 2026 the water ran two feet over under a coastal flood advisory while
  the chart drew a low, which is why it exists. It is a measurement, never a forecast, and it is
  hidden when the gauge is half an hour old, thin, or six feet off.
- **The boat season is paused.** The boat went out March 15 to October 31 on Josh's club trips.
  The club is paused from September 27 2026, so `LOCS.mb.boatSeason` is `null` and stays that
  way until Josh says it is back; do not guess a date. The boat's sentence (the `The boat` card) is still written and
  tested, and `tools/shots.mjs` serves the page with the season switched on for the scenarios
  marked `boat: true`. With the season on, the sentence speaks for the covered hours: `Easy out
  there.` (go), `Choppy. Stick to the ICW.` and `Rough outside. Stick to the ICW.` (gusts 22 or
  seas 3 ft, caution), `Too windy for the boat.` and `Too rough for the boat.` (gusts 30 or seas
  5 ft, no). The seas are graded on the foot that is printed. A day that changes says so, with
  the hour: `Choppy until about 2 p.m., then easy.` once two better hours follow, and `Easy until
  about 3 p.m., then choppy.` (with `until about 5 p.m.` when it lays down again). A warning,
  freezing rain or snow is `Stay off the water.` Thunder in the hour under way is `Thunder nearby.
  Stay off the water.`, and thunder later `Thunder possible around 4 p.m. Be in early.` in the
  headline's odds words (`Be in before the thunder.` when the headline has named that hour), red
  when there are not two decent hours before it with both readings known, and `Too windy for the
  boat. Thunder possible around 4 p.m.` when a gale or rough seas come first. A storm overhead is the
  headline's, so the section adds no sentence, and after dark a warning or a storm is tonight's,
  so the line under it is the water now and not tomorrow's daylight numbers. Rain likely (60%) and a day that never feels 50 are `Easy out there, but wet at
  times.` and `, but cold.`. An unknown is never green: `Seas unavailable.`, `Gusts
  unavailable.`, `Rain odds unavailable`, and a reading strong enough still decides on its own.
  A green sentence needs the whole day in the run: a cache opened after dark knows tomorrow's
  morning and not its afternoon, and says nothing rather than `Easy out there tomorrow.` A day
  that changes is amber. No reading is coloured on the page: the sentence is the call, and in
  season the note beside the title carries the covered hours' top seas beside the water
  temperature, in the note's own faint ink. `waterCard` still grades each reading (`line`, each
  with its step's class), because that is where the note and the tests read them from. The
  season is judged on the day the sentence
  speaks for. `waterCard`, `boatSay`, `levelGap` and `waterTemp` are pure and
  test.mjs runs them. `render()` only paints.
- **The farm speaks only when it matters.** The farm's sentence is a card titled `Piddling`,
  Josh's call and the family's word for pottering at the outside jobs, and it makes no call and is
  never green. On an ordinary day there is no card, only the moon and its fishing times (see The
  moon over the farm). When there is something to plan around it says so in
  the family's words, amber or red: a warning is `Chores can wait.` (`Feed early and keep a path
  open.` for a winter one, `Stay off the hill until it turns over.` with ice), thunder in the
  hour under way `Thunder nearby.`, freezing rain `Freezing rain possible around 5 p.m. Stay off
  the hill until it turns over.` (the action alone once it is falling or the headline has named
  it, because the headline names only its first wet stretch and a shower at two once hid the
  freezing rain at five), a gale in the first hour `Too windy until about 3 p.m. Chores can
  wait.` (with any thunder behind it said too, and no clock), thunder later `Thunder possible
  around 4 p.m. Piddle before then.` only when there are two or more hours before it, every one
  with a known gust under 30 and no rain likely (`Piddle before the thunder.` when the headline has
  named that hour). A gale before it is `Too windy from about 2 p.m. Thunder possible around 4 p.m.
  Chores can wait.`, rain before it `Thunder possible around 4 p.m. Slip out between the
  showers.`, and thunder within the hour or behind a gust the run does not carry is the thunder
  alone in red with no fishing times (`Chores can wait.` when the headline has named it). A gale still to come is `Too windy from about 5 p.m. Get the
  chores done early.` (the action alone when the headline has named that hour), snow `Snow
  possible around 5 p.m. Feed early and keep a path open.`, rain `Slip out between the showers.`
  or `Piddle early. Rain likely later.`, and cold morning rounds (the sunrise hour and the two
  after it feeling 36° or under, this morning's until ten and tomorrow's from sunset) `Cold one.
  Bundle up for the morning rounds.`, which drops the bundling when the headline has already
  said it. Anything
  that says stay in takes the fishing times off the moon chart, and so does freezing rain falling
  now, even after dark when the card speaks for tomorrow (`farmCard`'s `fish` is that gate).
  Otherwise each window is dropped on its own hours (`fishWindows`): thunder, freezing rain or a
  30 mph gust in it, a gust the run does not carry, or running past the end of the run.
  `farmCard` and `fishWindows` are pure and test.mjs runs them. The parked trip has no card.
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
- **Golden hour is said once.** Josh loves it and asked whether it was weird that it popped twice
  (September 28 2026). It was: the Next 24 hours note and a gold line on the Tonight card named the
  same span, and on a cold morning they named two different mornings with nearly the same times. It
  lives in the hourly note now, because that note is the legend for the chart's gold bands and it is
  on the first screen: `golden hour 6:27–7:15p`, `golden hour until 7:15p` inside one, and after dark
  the next band (`golden hour 6:48–7:36a`). The card is `Tonight`, the night's sentence and its moon.
- **The foot of the page is one credit.** `Weather data by Open-Meteo.com`, linked, in faint
  mono, because Open-Meteo's data is CC BY 4.0 and asks for it. The paragraph of sources, the
  per-place footnotes (`LOCS.*.foot`) and the refresh instructions went in September 2026:
  nobody reads them on a phone, the sources are in the README, and the stamp is already the
  retry. The one thing they said that the page needed, that the fishing times are the almanac's,
  now rides on the moon chart's title, `Almanac fishing times` (see The moon over the farm). Do not
  grow the footer back.
- **Every line reads the same way.** Josh asked for the slider to do something helpful on every
  line (September 28 2026). Put a finger on any chart and slide it sideways: a ring rides the line,
  a hairline marks the stop under the labels (their halos break it, so it never strikes through a
  number), and one pill above the finger says what the picture cannot, or puts a number on what the
  finger covers. A vertical swipe scrolls and shows nothing. A tap reads where it lands, a still
  press reads after 140ms, and a lifted reading stays 2.2 seconds. Still means a finger that has
  not moved 10px (`XP_TAP`, about the browser's own tap slop and iOS's 10pt; at 6px a firm thumb
  whose pad rolled 7px read nothing while the week opened its day for the same press, and 6px,
  `XP_SLOP`, still decides a slide), and has not crept 2px since the wait began (each creep starts the 140ms again), so
  a slow start to a scroll never pops a reading, and never finishes the entrance of a chart still
  waiting to draw in under it. A finger that lands while the page is gliding from a flick is
  stopping the page, not tapping the chart, however long it rests there: it never holds, and it can
  still slide to read. A press ends wherever the finger comes up (`pointerup` and `pointercancel` on
  the document): until a slide captures it a press has only the browser's hold on the node pressed,
  a repaint replaces that node, and a lift a few pixels off the chart once left the reading up for
  good. A phone leaves `:hover` stuck on what was tapped, so only a real mouse over
  the chart holds a reading through a repaint, and a tapped reading keeps the rest of its 2.2 seconds
  through one (the live data landing a moment after the cache on every open), re-placed on the new
  data, and is gone at 2.2 seconds whatever lands in between. The pill never covers what it reads:
  over the top of a chart (the week's warmest day, July on the coast, a hot hour under a two-line
  pill) it rises clear of the ring, and at the water's now clear of the skiff, which has no ring
  (`over`), by transform, and `tools/shots.mjs` checks every stop. The hourly's hour labels are
  inside its explorer, the way the year's months are the year's, so a tap on `3p` reads 3p. The keys are the same everywhere:
  the arrows step, Home and End go to the ends, PageUp and PageDown jump to the points the chart
  names, Escape puts it away, and a screen reader hears the same sentence as the slider's value
  (one hidden range input per chart, never a live region). The week's days were already buttons, so
  a tap still opens a day, a slide opens the day you let go on (`weekPick`), and the arrows move and
  open. A missing value is a dash, never a number and never `dry`, and an hour whose own sky is
  rain, drizzle or snow is never `dry` either. The hours say thunder at any odds (and the now hour
  says the thunder, rain or snow reported now, `liveHour`, so it never reads `dry` under `Raining
  now.`), gusts from `WINDY_GUST` (28, the headline's windy line, one constant, judged on the same
  raw gust the headline judges), and golden hour at a stop whose own time is inside a gold band,
  now judged at now (`goldStops`): the hour before and the hour after a band stand outside its gold
  and say nothing, and a band still to come that holds no whole hour goes to the one hour nearest
  its middle. A live paint drawn after the top of the hour (a rotation between fetches) asks for the
  new hour's run, once an hour, so NOW and the now pill land back on the live reading. A missing
  hourly temperature is not a zero: the line runs through it between its known neighbours, stops at
  the first and last known hour (with no neighbour past them, a line held flat drew a temperature the
  run does not carry), and only known hours are marked. The Tonight card reads the same run and
  leaves a missing hour out of the night (it once said `Low 0° tonight.`), and the week does the same
  with a missing day (`knownRun`), which once dove its line off the chart and printed `0°`. The water says the water that is there at now (the table plus the gauge's gap, which
  the tag beside the boat reconciles with the curve it rides; the skiff is the mark there, so no
  ring) and `by the table` everywhere else while the gauge runs off it. The moon says when a fishing time ends, to the minute it prints, or when the moon rises or
  sets, and never names a window it dropped. A day is named only where a clock time could mean two moments. The Sun bar has
  no explorer, because it is a scale and not a day, and its two readings are already printed on it.
  A chart still drawing in finishes first, a repaint
  under a finger keeps the moment (even one that landed a moment before and has not slid yet), a
  slider's spoken value goes back to the start with its value, a chart not drawn speaks nothing, and
  the explorer adds no animation. On a cache opened late the axis's NOW is the hour now is in, and
  the hour beside it gives way. `xpSetup` and `xpPublish` are
  the one machine, and `readHour`, `readDay`, `readTide`, `readMoon` and `readMonth` are pure and
  test.mjs runs them.
- Golden hour is sun elevation +6° to -4°, the convention the photo apps use.
  Blue hour is -4° to -6°. The displayed sunrise and sunset times come from the
  forecast API; sun and moon positions and the golden-hour boundaries are
  computed locally from `sunPos`.

## The icon

The home-screen icon is the header's own sun going down: a big inked sun half-set on the
horizon, fanned by the header's cream rays (long and short, tapered, the same drawing the scene
puts round its sun at every clear hour), in the plum dusk of the Mark (#4A3F6B at the top through
#A45C74 to apricot at the horizon), over the header's dusk water with gold reflection bars and
two pairs of little wavelets, the upper pair ending in the kit's curl. It is drawn in the
Storybook manner, ink heavier on the shadow side, a warm lit rim, a shadow crescent, the scene's
paper grain, and it is symmetric: every form is mirrored, and only the light (from the upper
left) is not. The point is that seeing the icon and opening the app feel like the same picture:
the rays and the ink are the ones the header draws. The dusk is the Mark's deeper plum, which Josh
asked for over the header's own.

How it got here, all in September 2026: Josh looked at four illustrated directions, kept the
original flat mark and had it refined (PR #57), then chose the sunset emblem ("the Mark"), then
asked for versions of it that carry into the header. Of those he picked the one with the
header's rays, with the Mark's deeper purple and its wavelets put back. Android is out of scope
and always will be: no maskable variants, no adaptive-icon work.

- `icon.svg` is the master, and it is built, not drawn by hand: `node tools/icon/build.mjs`
  writes it from `C2_SHIP` in `tools/icon/gen.mjs`, an options object (sky stops, sun, rays,
  reflection rows, wavelets, grain) painted with the Storybook kit read out of index.html. Change
  a key there and rebuild; `null` switches a part off. The grain is one baked image kept inside
  icon.svg, and a rebuild reuses it.
- Every mask is drawn out in full rather than made of `<use>`: macOS CoreSVG (Preview, sips,
  Xcode assets) draws a `<use>` mask as empty and loses the lit rim and the crescent.
- `node tools/icon.mjs` exports `icon-180.png` and `icon-512.png`: Chrome renders the master once
  at 1024 and each size is an area average of it. Rendering straight at 180 leaves a pixel of
  khaki between the sun's ink and its lit rim. Never hand-edit the PNGs. A new export is a new
  shell: bump `CACHE` in `sw.js`.
- The grain makes the PNGs heavier than a flat icon (about 32 KB and 158 KB). The service worker
  caches both once, with the shell.
- An iPhone keeps the icon it was given when Porch was added to the Home Screen. A new icon
  reaches a phone only when the app is removed and added again from Safari.

## Storybook Ink: how the scene is drawn

In September 2026 Josh chose the scene's art direction: the storybook look of Prince of
Persia (2008). Hand-inked outlines that run heavier on the shadow side, flat colour per part,
a hard form-shadow crescent and a warm lit edge, paper grain, scalloped clouds. Fun, but crafted:
never clip-art, and never a deer that reads as a bean. The clouds had a tail that swept up into a
curl at their right end until September 29 2026, when Josh said he loves the clouds and not the
curly tail, so they end in their own scallops (the oak's limb tips and the wavelets keep theirs). The approved mockup put the heron,
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

## Holidays

In September 2026 Josh asked for the scenes to be decorated for the holidays, with the
decorations coming down once each holiday passes. Halloween is the first.

- **A calendar, not a switch.** `HOLIDAYS` is a table of windows in month-days on the
  location's own calendar, read with `inSeason` the way the boat season is, and
  `holidayOn` is pure and tested. It is handed `locToday()`, the place's own date string, and
  never a date read off the shifted wall clock, which ran an hour slow in the small hours of
  the night the clocks go back (in 2026, Halloween night into November 1) until that was fixed
  (see Time and place). Halloween runs October 1 to 31:
  the decorations go up on the first and are gone the morning of November 1. A new holiday is a row in the table
  and a drawing in each scene. Nothing else needs to know.
- **Decorations are scenery.** The pumpkins, the corn shock and the straw bale are props like
  the dock and the barn, drawn from parts with the kit (`propPumpkin`, `propCornShock`,
  `propBale`) and lit by the same sky, so they go blue at night, warm at golden hour and grey
  in the rain. They are what the family would set out: on the coast a pumpkin at each end of
  the dock, at the farm a corn shock at the barn's corner with a bale at its foot and a small
  white pumpkin on it, and a big pumpkin either side of the door. `node tools/rig.mjs pumpkin`
  (or `lantern`, `lantern-lit`, `lumina`, `cornshock`, `bale`) shows each one close up and at
  phone size.
- **They keep a pumpkin's own calendar.** Plain until the 24th, then the big ones are carved,
  because a carved pumpkin in coastal humidity is soft inside a week. The carved face is its
  own role, `carve`, and not `face`: the heron already has a face, and it keeps its outline.
- **A jack-o'-lantern has to read as one at eight pixels.** Phone size wins over the close-up.
  The face is two eyes and a grin and no nose, so lit or dark it is three marks. The eyes come
  to a point, because a flat-topped half moon reads as sleepy, and the grin is deep enough to
  carry the light. No tooth sits in the middle, which is the stock clip-art face. The rind's
  cut wall (`eyeRing`) is a thin strip inside its hole and glows with the face (`rindLit`) once
  the candle is lit. The carving has its own draws off the seed, so the three lit ones (seed 3
  on the dock, 4 and 6 at the door) are three different carvings. A pumpkin under 8 wide is a
  mini: squat, with a round crown and a slim stalk that is mostly ink, because at five pixels a
  pale stalk is a nub and a crown that rises to the stem is a bulb of garlic. test.mjs checks
  the three marks, the pointed eyes, the lit area, the rind inside its hole, the three carvings
  and the minis.
- **The head in the loft window is a family joke, and it stays one.** For years the real barn
  has had a head in its window, a cast Josh's dad made of his own head for a college art class,
  put there to keep off robbers. For Halloween the scene's loft window has it as Michael Myers:
  the bone-white mask with black eye holes, the shaggy brown hair and the navy coveralls, head
  tipped the way he tips it (`propLoftHead`). Five pixels of glass is too small for a face, so
  for October the loft window opens half as wide again (`LOFT_WIDE`, which Josh okayed). The rest
  of the year the barn is drawn exactly as it was. The mask is about half the window's width, the
  hair stops above the jaw so he reads as a face on a pair of shoulders and never as a hood, and
  both eye holes are big enough to survive at phone size. He is drawn at ten times the window's
  units, so the kit's rounding cannot step his edges, then scaled down and clipped to the glass.
  At night he is drawn over the loft lamp's glow, never under it, and the loft's light is a shade
  deeper amber than the barn's other lamps, with the mask still whiter than it, so it reads as a
  mask and not as skin. He never moves. `node tools/rig.mjs loft-head` shows him close up.
- **The corn shock is tied high**, and its crown is broken stalk tops and dry leaves standing
  up and out, so at phone size it is a sheaf and never a figure in a dress. Only the leaves
  that break the silhouette take ink. The bale sits level on the ground, with its long side to
  us.
- **The candle is lit when the barn lamps are** (the sun below -0.83°), and not in the rain or
  a storm. Its flicker is the only thing Halloween adds that moves, and it moves with the air:
  steady under 3 mph of gust, guttering deeper and quicker up to 27 (`candleK`), and no
  animation at all in a calm or under PRM. Everything the candle lights is in one group, so it
  all flickers together. That is one animation per lit pumpkin: one on the coast, two at the
  farm.
- **The candle is a light, not a sticker.** It is measured from where a candle stands, low in
  the pumpkin behind the grin. The shell glows round the face, the face is white-gold at the
  candle and amber at its tips, and the glow falls off the way light does, wider in fog. It lays
  still shapes of its light on what stands right beside it (`lights`): the ground (the planks,
  the doorstep) takes a pool, and a thing that stands up (`face`) takes a falloff over its
  silhouette, or only the faces named in `roles`, with a warm edge toward the flame (`edge`) and
  none where a nearer prop shades it (`shade`). On the dock its light on the water is broken
  water hung under the lantern: seeded glints at uneven depths, cut where the end piling stands
  in front of them, thinning out before the wavelets nearer the bank, and in the flame's orange
  rather than its gold, because dim gold over blue water goes green. Each row of glints makes the
  same draws, so a change in the wind widens them and never moves them.
- **They are placed off the dock and the barn, never off a fraction of the frame, and they give
  way to the animals.** The dock's middle piling is the cormorant's: drying its wings it reaches
  20 units left of the dock's centre and 9 right, so the pumpkins stand at the ends. At the barn
  they run from the shock's corner to the door, in front of the fence, so the hens' yard and the
  pond's edge are untouched. The two big ones stand under the lit windows, so neither hides one
  (their stalks just cross the sills), because at night the windows are the barn's lamps, and
  they are not one pumpkin copied twice: the left one is bigger and a step nearer, the right one smaller and back. The
  bale throws a band of shade on the shock so the two read apart, a contact shadow by day and
  deeper only when the lantern beside them is lit. The barn's decorations are drawn with the
  barn, right after the fence, so the cloud shadows, the pond's effects and the near rain pass
  over them. The yard's grass leaves out whole any tuft that would cross them, measured off the
  shock's own foot, and still makes every draw, so no other grass moves. The barn's props are
  built only while they are out. `tools/scene.mjs` fails a scene whose
  decorations are not exactly the ones the date calls for, whose candles are lit when they
  should not be, or where a decoration runs off the frame or into an animal.

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

`tools/shots.mjs` renders twenty-eight scenarios (day, night, after midnight, storm, dusk,
both family locations, a fine farm afternoon, a washout, a shoulder-season moderate-UV day with
the water running two feet over the tide table, and two shaped weeks: a cool snap into a warm run
on a Thursday, gusting 30 at five with the boat season switched on, and a stormy Sunday week with
100% odds and a 101° high, which is also the eight-column week), then sixteen for the water, the
farm and the weekend: a Saturday at the coast with the boat season switched on, where the weekend
is today and tomorrow and the water is `Easy out there.`; a mid-November Saturday, with the seas
and the water and no sentence; a cold January morning on the coast with the station's thermometer
down and the sun card stepped aside; a boat day whose marine run carries no seas, which is `Seas
unavailable.` and never green; the water two feet over the table half an hour before a high,
where the skiff rides the curve with `+2 ft` beside it and the high's time steps over both, and a
winter northwester blowing it out a foot and a half under the table at the low, where the tag stays
off the bed; the water two feet over at a low and a foot under at a high, where the tag once sat on
the tide line; the water half a foot under an hour before a low, where the boat sits close to the
bed and the tag goes beside it; a wet weekend of 40% and 100% with three-digit highs, and a farm
weekend of rain then snow, whose notes stay beside their title at 320; the water two feet over at a high and
an hour before one, where the tag keeps below the high's time and the pill at now stays under the title;
half a foot over and two and a half under on the falling tide, where at 320 the tag finds a spot
off both flanks; and a cold October morning at the farm, `Cold one. Bundle up for
the morning rounds.` on the `Piddling` card over the moon. A scenario marked `boat: true` is served with
`boatSeason:null` switched back on, and fails if there is nothing to switch. It writes screenshots
to `tools/shots/` and prints the generated copy (the headline, the chips as they are seen, the
water's note, the level the chart speaks and the tag on the skiff, the moon's phase and the
fishing times it speaks, the sentence card, the sun sentence, tonight, the week's note with the
banded weekend in brackets, the year's title and note, and `xp`, each chart's pill where it starts
and the water an hour on), so wording changes are reviewable as text. A scenario can carry an
`expect`: the week's columns and banded days, the sentence card's title, sentence and colour, the
water's note, the level and its tag, the moon and whether it has fishing times, the year, the sun
card, the sun bar's spoken label, how many times the seas were asked for, and its pills (`xp`). The
loading-shell check at the end also holds the sun scale hidden and every slider off while there is no
bar or reading, and the farm's moon and its year's title (and its hover text's airport) in place before any forecast lands. Every scenario
also fails when a word on the tide, the moon or the year runs off its chart or into another word,
when the skiff's level tag sits on the bed, within 2px of the tide line or on the boat, or when
the water's
pill at now covers the skiff, measured at 390 and 900 and once more at 320, the width where they
meet, where it also fails any section title whose note drops under it. It exits non-zero when one does not show what it
is there for.

`tools/scene.mjs` is for anything that moves. Twenty-nine scenes force the light
and weather that are hard to wait for: calm noon, a hard blow, golden hour, a warm
clear night, a storm, a fog morning, drizzle against a downpour, freezing rain on
the coast, a night of rain over the marsh, and the ridge by day, by evening with
the buck out, in warm rain, on a snow day, on a cold January night and in a night
downpour. Ten more are Halloween: the coast on an October afternoon, on Halloween
night, on a cold morning in the carved week with the cormorant on its piling, on a rainy
night in it and at half past midnight on November 1 2026, the night the clocks go back,
and the farm on an October afternoon, on an October night before the carving, on
Halloween night, on a rainy night in the carved week and on the morning of November 1.
On both November ones everything has to be gone. Each one with decorations out writes a
close-up of them at 320 and at phone width. The Denver scenes (and the skyline check)
went out with the trip; they are in git history before the commit that parked `den`, if the next trip wants a model.
The ridge night downpour is there on purpose: dark theme, code 82, two rain layers
and a frog, which is where the animation count goes looking for trouble. It found
some, which is the point of having it. The marsh night rain is there for the same
reason from the other direction: it is the only frame that puts the raccoon and
the fiddler crab out at the same time, so it is where two grounded animals can
collide and where either of them can end up floating. Per scene it writes the sky
and the scene on their own, counts the animations *still running* grouped by keyframe, reads
`LayoutCount` off CDP while the scene idles, and proves the page holds perfectly
still under `prefers-reduced-motion` by comparing two screenshots taken 1.4s
apart. It exits non-zero on a page error, on layout thrash, on anything that
survives reduced motion, or on a scene at a family place whose wall clock is shifted at all
off the Eastern phone it runs in (the half past midnight scene on November 1 is the one that
used to be).

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

Three things worth knowing:

- For the two family locations with the phone at home the shift is exactly zero, so their
  behaviour is unchanged. Away from home it quietly starts being right instead of showing
  the phone's clock against home data.
- The zero is exact only because nothing is read back as phone time. `tzOffset` takes the
  place's clock fields from `Intl.DateTimeFormat(...).formatToParts` and assembles them with
  `Date.UTC`, and the phone's own offset comes from `getTimezoneOffset`, taken again at the
  shifted instant because two zones change on different hours. The first version parsed two
  `toLocaleString` strings back as phone time, and for the four hours before each clock
  change the UTC string had passed 2 a.m. and the place's had not, so a phone at home ran an
  hour off at home: slow from 10 p.m. Halloween night 2026, fast from 10 p.m. on March 13
  2027. test.mjs sweeps both nights every ten minutes with the phone's clock really set to
  Eastern and to Mountain.
- `tools/fixtures.mjs` writes each fixture on the location's own clock too. Without that the
  Denver scenes were fed Eastern sunrise and sunset, which is how a mid-August Denver
  morning came out reading 8:12am.

If you add a location, give it a `tz` and a `tzLabel`. Nothing else needs to know.

## On file size

`index.html` is about 480 KB of source (September 2026, with NOAA's daily normals baked in), and an early plan set
160 KB as a ceiling. That number was about the source file and it is not the
number that matters. GitHub Pages serves the file gzipped, so what a phone
actually downloads is **about 160 KB**, once, and the service worker caches it
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
  the windows disappear under anything that says stay in (a warning, a storm overhead, ice,
  a gale, thunder within the hour, freezing rain falling), and one by one on their own hours
  otherwise, so they never read as an
  invitation to stand in a thunderstorm with a rod. The footer used to carry that
  framing. Now the moon chart's title carries it, `Almanac fishing times` (Josh chose it over
  "fish bite · by the moon" so the theory is plainly the almanac's), with the full sentence in its
  title and for screen readers.

## The moon over the farm

The farm's wave, in the place the coast has its tide (Josh, September 27 2026: the farm "feels off,
like it's missing something"). At the coast the moon moves the water; at the farm the almanac says it
moves the fish, and its fishing times are the moon's own hours. `#moonSection`, `Almanac fishing
times`, draws the moon's height over the same day and a half as the tide chart, on one honest linear
scale with the horizon where zero falls: solid and washed while the moon is up, dashed while it is
down. The windows that are clear on their own hours (`fishWindows`) are quiet water bands, a major
darker than a minor, each marked by when it starts (`now` when under way), because the band is the
span. The moon rides the curve at now in its own phase, the way the skiff rides the tide, and the
phase is the note beside the title (`moonName`: new moon, waxing crescent, first quarter, waxing
gibbous, full moon and back). Anything that says stay in takes the windows with it. The chart speaks
its windows (`The almanac's fishing times: 6:58 pm to 7:58 pm, ...`). It is drawn in like the tide.

## The year

At the foot, above the credit: NOAA's 1991-2020 climate normals at the airport nearest each place,
Wilmington (USW00013748) for Porters Neck and Beckley (USW00003872) for Shady Spring. The titles are
`The year · Wilmington` and `The year · Shady Spring` (`NORMALS.*.name`). Josh asked for "Change
Beckley to Shady Spring" (September 28 2026), was offered "Porters Neck" at the coast for symmetry,
and kept Wilmington, which is home as much as Porters Neck is. The airport is said with the source,
in the chart's spoken label and the title's hover text (`NORMALS.*.place`). Josh asked for monthly
averages like Carrot's, "but better, and in our design language" (September 27 2026), and picked
lines over bars. They change once a decade, so they live in `NORMALS` and nothing is fetched.

- **Drawn the way the week is.** The normal highs as a line in the temperature's colours, the lows
  fainter, the range washed between, the warmest month ringed with its number and the coldest low
  named. The year wraps, December running on into January at both ends, so late December is not a
  month held flat. The months are the week's quiet mono axis, this month in marker red.
- **One scale at both places**, 20° to 95° and wider only for a week that runs past it, so Beckley's
  81° July is drawn lower than Wilmington's 90°. The scale does not start at zero, because 0°F means
  nothing here; the rain and snow bars do.
- **This week is the Sun card's pin** at today, with its own high over it and low under it, and a
  key month's number gives way where they meet. The note is `6° warmer this week`, `6° cooler this
  week` or `a normal week` (under 3°): the forecast's own days, each against NOAA's daily normal for
  that day, on the day's middle temperature the way the Weather Service says above or below normal,
  with the size rounded apart from its sign (`yearCompare`).
- **Rain and snow** each have a strip on their own ground line and their own scale, so 16 inches of
  snow never reads as the same amount as 5 inches of rain. Only the tallest month is named, noun
  first: `rain 8.7 in`, `snow 16 in`. Snow shows only where it falls (the farm).

## Interaction and reading refinements

- Every chart's pill is measured against the visible part of its chart (for the hours, the scroll
  area), not the full chart. Keep its intrinsic width independent of its current position
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
  pleasant outdoor reading: the farm says the family's action in red and takes the fishing times,
  and with the boat season on the water says `Stay off the water.` Include
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
  which five to seven days out is a claim without its odds. Two wet days of one kind say the noun
  once (`Sat 84° 40% · Sun 82° 100% rain`), and under 340 the note is half a point smaller, so a
  weekend of two kinds (`Sat 44° 60% rain · Sun 34° 100% snow`) also stays on its title's line at
  320. An old seven-day cache on a Sunday
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
to come today pops and rings once. The farm's moon is drawn like the tide (its disc drops onto the
curve at now), and the year like the week (the warmest month rings, the rain and snow bars rise,
the week's pin drops at today). The hourly takes about 2.3s on a phone. Charts on screen together
draw down the page: the week follows the hourly by 0.4s, and the tide or the moon, the sun bar and
the year each follow whichever drawing above them is still running (`REVEAL`'s keys are in page
order, hourly, week, tide, moon, sun, year, and so is `RV_OF`, the observer's map). All of it is in
`REVEAL` in index.html.

- **It plays to someone.** It waits until the chart is at least 30% on screen, so on a
  phone the tide plays when you scroll to it. It waits for the live forecast, or 0.9s when
  there is only the cache, so the pen does not draw one line and then swap it for another.
  The observer's word can be a render old, so a chart is measured once more before it plays.
  One that measures off screen is looked at again a frame later, because the alerts, the
  nowcast strip and the sentence card are painted after the charts and move them again; one that
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

`tools/interactions.mjs` runs thirty-five scenarios: every pill kept inside its chart at both edges
at 320, 390 and 900, keyboard navigation, location switching, snow/ice labels, a warning at the farm that is `Chores can
wait.` in red and takes the fishing times until it expires, source instructions, a farm day with
thunder in the run from noon and nothing warned (the headline `Thunder possible around noon.`,
the card `Piddle before the thunder.` in amber, and no fishing time inside the thunder), a phone that opens at the coast and taps to the farm's
cache (the farm's moon and its year's title on the cached paint and the live one),
the entrance across a cache-to-live paint that drops the nowcast strip with the week at the
fold (nothing on screen left undrawn) and with no cache (the tide the live paint pushes below
the fold waits for the scroll, then draws), retry, and cached/online recovery. Then the explorer
with a real finger (CDP touch in a phone context, because a synthetic dispatchEvent skips the
browser's gesture handling, which is how the hourly chart's freeze went unseen): a sideways slide on
every chart at 390 that keeps the finger, follows it and rings the published point, a vertical drag
on every chart that scrolls and shows nothing, a tap, a still press, one reading at a time; the
keys, Tab order and spoken values, with the sliders off in the loading shell; the Sunday week at
320 by touch and by mouse (a slide opens the day you let go on, Today closes, hover opens nothing);
the water two feet over the table; the farm's snowy January and the clamped ends of the year; a
finger held through a repaint; a tapped reading kept through a repaint for the rest of its linger;
a thumb creeping into a scroll on the real clock, and one that stops a glide and rests 200ms,
both reading nothing; a tap on the hourly's hour labels; a press on an hour label or a month that a
repaint replaces, lifted just under the chart, which lets go, and a press that settles 7px or a tap
that drifts 8px, which reads, at the coast at 390 and the farm at 320; a missing night hour, a run
whose last hours carry no temperature, and a missing daily high, none of them drawn or said as 0°; a cache opened three hours late; and, with
motion on, a slide during the entrance, the animation count across a slide, and a creeping scroll
from a chart still waiting to draw in that leaves its entrance to play. The entrance checks run with motion
on; everything else runs under reduced motion. Run it with the same font and browser settings as
`tools/shots.mjs`. Request ordering and alert expiry also run in `node --test test.mjs`.

## Known issues

- `api.open-meteo.com` and `marine-api.open-meteo.com` are unreachable from some
  networks. DNS resolves, TCP never connects, on both 443 and 80. With both hosts
  down the forecast fetch fails and the page shows the last cached reading (same
  day, up to 6 hours old) and the cards worked out from it, cached seas and all,
  behind the age stamp and the dimmed live dot, which reads as working but stale.
  The water temperature and the level are not carried that far: they hide once
  the station's reading is an hour and half an hour old. Past 6 hours or into a new
  day there is no cache, and the page shows the unavailable state: the sections in their
  places with their titles and no pictures, and no sentence card. When
  the marine host alone fails, the forecast still lands and the seas are left off the
  note (with the boat season on, `Seas unavailable.`, unless the wind alone decides it).
  That is the honest answer, not a bug. `api.weather.gov` and NOAA's CO-OPS answer
  fine on the same network. The fix under discussion is an NWS gridpoint fallback
  source: temperature, rain chance, wind, gusts and cloud all come through it, UV,
  the 15-minute nowcast and wave height do not.
