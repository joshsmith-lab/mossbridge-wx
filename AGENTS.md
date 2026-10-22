# Shared project guidance

Read this before touching anything. It exists so a fresh session does not
rediscover the same things the hard way.

## What this is

A single-file, build-free PWA. `index.html` is the whole application,
`sw.js` caches the shell, `manifest.json` makes it installable.

Production is <https://joshsmith-lab.github.io/mossbridge-wx/>, served from
`main`, and it is shared with family. The `LOCS` table holds
`mb` (Moss Bridge Ct, Porters Neck NC, coastal, gets the water + tides + the beach zone's tropical warnings;
since October 21 2026 its scene is the family's own house across the pond, see Porters Neck below),
`sp` (Bob Plumley Rd, Shady Spring WV, inland) and `bft` (Coosaw Club Dr, Lady's Island, Beaufort SC,
the third place since October 15 2026, Jen's family, coastal, with its own "lowcountry" scene; see
Beaufort below), the permanent family places, in that order in `LOC_ORDER`.
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
  thing twice. In October 2026 Josh asked for a more useful summary. The headline may name
  the sky over the remaining day or tomorrow when the hourly run supports the whole period,
  rather than repeat the current condition beside the number. On a quiet afternoon it can be
  one sentence: `Nice and sunny this afternoon.` Feels-like gets its line only when it is 3° or
  more off the air, the rule the hourly readout already used, because inside that it is the
  same number twice. The hourly note is the golden-hour span or nothing. It names the next band;
  a finger inside any gold band, tomorrow morning's too, reads a quiet gold `golden hour` on the pill.
- **The page reads top down, and the first screen is the answer.** What the family opens it
  for is now, today and the weekend, so that is the first screen on a phone: the sky (the
  reading, the headline, the chips, the scene), the next 24 hours, then this week. In a major
  storm the storm card comes first, between the sky and the hours, because then it is the answer.
  The week used to sit at the foot of the page, which put the weekend a scroll away. Under it comes the
  wave, the water and its tide at the coast and the moon at the farm, in the same place; a named
  storm's one quiet line, and the storm card's model when `?storm=debug` is on the address (see The
  storm card); the cards (a sentence card when there is something to say, then
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
- **Josh's words.** Plain, short, direct. Sunny, cloudy, windy, nice when the forecast earns it. No mild in
  the generated descriptions, and never blustery, breezy or wind-whipped. test.mjs keeps
  those choices in place. No semicolons and no em dashes in the
  app's sentences (an en dash in a range like 4–7p is fine), and no "not X, it's Y". The
  family's own words stay, because they are the character: piddle, soupy (earned: real
  humidity on real heat), "Feed early and keep a path open", "Cold one.
  Bundle up for the morning rounds.", "Stay off the hill until it turns over", golden hour,
  "Keep the middle of the day short", "Plan on slow going", "Reading the sky…". Noon and midnight
  are words in a sentence (`Thunder possible around noon.`, `Strongest sun until noon.`), never
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
  tonight's (`Showers possible around 1 a.m.`) and only daylight is "tomorrow" (the night runs to tomorrow's
  sunrise, as the Tonight card's does, so an October `6 a.m.` is tonight's), so one night is
  not given two names. Thunder the run carries on poor odds is still thunder (`Thunder possible
  around noon.`, and `Windy by 11 a.m., then thunder possible around 2 p.m.` when the wind comes
  an hour or more first, with "tomorrow" said once), never `Should stay dry.`, which once sat over a
  card naming the thunder. The headline speaks from the hour now is in, so a cache opened at 11:40
  does not say `Thunder nearby.` about a storm that passed at nine. The headline
  hands the cards under it a list of what it named and when (`told`: Rain, Freezing rain, Snow,
  Windy, Thunder), so they say what to do and not the same thing again. Under a storm card the
  headline is the storm's (`Hurricane Florence is closest Friday morning.`, see The storm card), and
  what the card says goes down as `told` with no hour, said for every hour. Windy is said from the first hour the gusts reach 28, not the windiest,
  so a gust the chip is already showing is `windy now`. The week reaches further
  because it is a chart of the run's own numbers, and the weekend note beside it stays
  numbers: a high, and the odds wherever there is rain to talk about.
- **The summary moves with the day.** In October 2026 Josh asked for ordinary words,
  smarter timing and no extra length. Before noon the summary can use today's known high;
  afternoons use the temperatures still ahead so a spent high cannot make a cool afternoon
  warm. A quiet afternoon can be `Nice and sunny this afternoon.` Nice requires every remaining daylight
  hour to have known temperature and feels-like from 50 to under 85, known gusts under 28,
  known rain odds under 25%, no wet weather codes, and a clear or partly cloudy sky.
  Josh asked for more information in these same short main words on October 7, 2026:
  `Dry today.` is not a useful description. Quiet daytime headlines name the sky:
  `Cloudy, then sunny.`, `Mostly cloudy today.`, `Clouds and sun today.`, or
  `Nice with some sun today.` A sustained sunny/cloudy change needs at least two forecast
  hours on each side; one odd hour does not become a clearing or clouding trend. Mixed skies
  use mostly only when at least 70% of the known daylight hours support it. Nice keeps its
  sky word. Combine heat, humidity and sky without stacked ands: `Warm, soupy and sunny today.`
  Fog can give way to `Some sun later.` when the run supports it.
  Humid and soupy need the current air to be at least 75°F as well as the existing humidity
  and heat thresholds; a damp cool morning cannot borrow the afternoon high to earn them.
  Missing hours still cannot certify a whole period, and hazard timing keeps priority.
  The warmth being described must be 68 to under 82: the daily high before noon, the warmest
  remaining afternoon hour after noon. Current discomfort cannot be hidden by it. From 5 p.m. the
  quiet headline looks toward tomorrow: `Sunny tomorrow and 7° cooler.` A difference of at
  least 5° between the two known daily highs earns a comparison. Smaller changes get no filler.
  Tomorrow's sky needs the complete sunrise-to-sunset hourly run; a shortened cache can still
  say `Tomorrow's high is 72°.` from the known daily forecast, but cannot promise its sky.
  Missing sunrise or sunset cannot invent a daylight window. Hazards always take this space
  first, and tomorrow is said for tomorrow. The wall clock governs the sentence even when a
  cached reading was written hours earlier. Rain lets up only after two consecutive known
  dry hours; missing odds never make a break. Thunder at the first wet hour keeps its name
  instead of becoming rain, and rain falling now cannot hide thunder still to come.
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
  point is spoken only (`dirLong`, sr-only) and `dirTxt` is left to the storm card's compass points. Under
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
  the whole foot with "about" ("under 1 ft" below half a foot). The water temperature is a
  thermometer in the water, never a model (`waterTemp`): NOAA's own at station 8658163 while it
  is under an hour old, and when it has nothing, the Masonboro Inlet buoy's (41110, UNCW's CORMP,
  five miles off the beach) while it is under an hour and a half. The station's went quiet on
  August 12 2026 and NOAA no longer lists a water thermometer among its sensors. Josh asked for
  it back on October 10 2026, "next to "seas" - can be same size, etc. just a data point I always
  want", so the buoy's is said in its place, the same size, `76° · seas ~3 ft`, and the station's
  comes first again by itself if NOAA puts it back. The buoy is read from SECOORA's ERDDAP, which
  a phone may read where NOAA's buoy files may not (`buoyRow`: Celsius at a UTC instant, made the
  station's degrees at the place's wall clock, the latest reading its quality checks have not
  called suspect or failed, its degrees kept to two places so they are rounded once, because a
  tenth first made 24.7°C, 76.46°F, read 77). It reads on the hour and the half hour and each
  reading reaches the server about half an hour later (14:00 UTC landed at 14:30 on October 10
  2026), so its newest is always 30 to 60 minutes old and a one-hour rule would blink it off at the
  end of every half hour (`BUOY_FRESH`). Its age is taken off its true instant, so the night the
  clocks go back does not make a fresh reading an hour old. The request
  asks for the buoy's last day, because the server answers an empty window with a 404 that every
  phone would log on every refresh, and the service worker never answers it from the cache. The
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
  the family's words, amber or red: a warning (never a Freeze Warning or a Frost Advisory, which are CAP
  Severe the way every one is and are about the garden, `NOT_OUTDOOR`; under a storm card the storm's
  lead warning) is `Chores can wait.` (`Feed early and keep a path
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
  30 mph gust in it, a gust or weather code the run does not carry, a gap in its hourly coverage,
  or running past the end of the run. Every overlapping hour still ahead must be known;
  duplicate and partially overlapping rows must all pass, even when another row covers them.
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
  crosses into a higher band keeps its ring, its dot nudged clear of the pin, so a sentence
  about strong sun never sits over a bar that shows nothing past LOW. The peak is searched
  from the hour now is in, so a cache opened late rings nothing that has passed, and the
  loading and error shell hide the scale with the bar. In October 2026 Josh asked for the
  coast's sunscreen reminders to go. Both places now use the same neutral sentence:
  `Strongest sun until 4 p.m.` or `Strongest sun 9 a.m. to 4 p.m.`, read only from today's
  hourly UV. The Sun card gives no clothing or sunscreen advice at either family place, and no assumed 10-to-5
  schedule when the hourly source is missing. The sentence's colour comes from the peak
  still ahead, never a spent lunchtime peak. When no remaining hour reaches 3, both sentence
  functions return null, `#sunCard` is hidden and Tonight goes wide. A peak is never borrowed
  from tomorrow. The hourly run's first hour carries the live UV, so the sentence and the pin
  read the same number. The UV chip shows from 3 and only while the card does (`sunAdvice&&`),
  because a cache opened after the strong sun still holds a 3 from an hour that has passed.
  On October 21 2026 Josh said "the uv language feels crowded (to the left). I also want the actual
  numerical high represented somehow." The scale words had stood at their bands' starts (0, 3 and 6 on the
  0-12 bar), which put LOW, MODERATE and HIGH in the left half while HIGH's band runs to 11. Each now stands
  under the middle of its band (1.5, 4.5 and 8.5), and EXTREME, whose band is too narrow to centre in, stays
  flush right. The ring prints the day's high as a number (`6.1`) in the pin's own figures and the softer
  ink, with its hour small after it (`11a`), the number over the ring. It is placed, not stamped: right of
  the pin's reading, then without its hour, then with the reading stepped to the left of its pin, so at 10.6
  now and 11.4 to come, where the peak used to go unlabelled at 320 and 390, both numbers stand.
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
  run does not carry), and only known hours are marked. Keep the provider's full remaining
  hourly forecast in the existing cache. The Next 24 hours chart and its existing companion
  readings still use the first 24 slots; Tonight alone reads the longer run through the next
  sunrise. Truncating the stored forecast at 24 slots discarded tomorrow's sunrise hour on an
  early-morning refresh and falsely printed both readings as unavailable (fixed October 7, 2026).
  Check this through the real refresh path, including a morning cache reopened later, rather
  than giving the sentence helper more hours than the app actually retained.
  The Tonight card reads the night's own hours in
  one connected sentence (`Rain likely tonight, with a low of 62°.`), and after midnight says
  `before morning`. A low needs every remaining night hour through sunrise: a missing temperature
  or a run ending early means `Low unavailable`, never zero or a minimum borrowed from half a
  night. Weather is read separately, so a missing temperature cannot erase thunder, snow or ice.
  Thunder is said at any odds; freezing rain and snow keep their names, and each gets its odds
  word from its own hours. A day's rain odds never stand in for tonight's. Missing night odds
  are unavailable, not dry. Under a storm card the night's rain, snow and freezing rain are the
  card's, nothing is a warm night and nothing is green (`Down to 71° tonight.`, see The storm card).
  `tonightBrief` is pure and tested. The week leaves a missing day
  undrawn (`knownRun`), which once dove its line off the chart and printed `0°`. The water says the water that is there at now (the table plus the gauge's gap, which
  the tag beside the boat reconciles with the curve it rides; the skiff is the mark there, so no
  ring) and `by the table` everywhere else while the gauge runs off it. The moon says when a fishing time ends, to the minute it prints, or when the moon rises or
  sets, names moonrise and moonset on their own stops, and never names a window it dropped. A day is named only where a clock time could mean two moments. The Sun bar has
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
- **So is the sky's blur.** The soft clouds behind the type were a live nine-pixel
  `feGaussianBlur` on each drifting layer, and that was the iPhone stutter: in WebKit at 3x
  (a WKWebView on the Mac, October 9 2026) every idle frame took 44 to 97ms, 10 to 23 frames a
  second, at both places, by day and by night. `bakeClouds` now works the same puffs and the
  filter's own region out once into a canvas that each drifting layer carries, blurred as wide
  (three passes of a box, the approximation the SVG spec gives for a blur this wide), again
  whenever the sky changes size, and the drift is a plain HTML layer sliding sideways. It bakes
  once a render, at the size that is shown: `renderSkyFx` sets `CLOUD_DUE` and re-observes the sky,
  so the observer reports after that frame's layout and before its paint (a direct bake there baked
  the loading shell's short sky and threw it away, 40ms on the frame the picture lands). The
  canvases are placed in the sky's own percentages, so when the alert strip or the nowcast only
  makes the header taller the baked picture stretches with it, and the re-bake waits until no pen is
  drawing in (`CLOUD_LATER`). The same
  frames ran at 59 to 60, and the baked sky matches the filter's to 3 levels in 255. Chrome never
  showed it, because Chrome composites SVG animations and WebKit repaints them (`tools/webkit.mjs`).
- **The picture still does not make claims.** Clouds are drawn in the scene only when there
  are clouds (10 to 85 per cent, dry, no fog) and drift with the wind. The barn lamps come on
  after sunset. The oyster rake is part of the creek and is drawn in every weather, whether or
  not the oystercatcher is on it; it is not a statement about the tide.
- **To change an animal, look at it.** `node tools/rig.mjs deer ".deer-head=rotate(100deg)"`
  renders any rig straight out of index.html, close up, in any pose and at phone size.

## Holidays

In September 2026 Josh asked for the scenes to be decorated for the holidays, with the
decorations coming down once each holiday passes. Halloween is the first.

Since October 21 2026 Porters Neck's scene is the house across the pond. The coast's notes below (the dock's
pumpkins, Ghostface in the oak, the cat on the dock, the eyes in the spartina, the marsh lights, the kid on the
dock) describe the parked marsh; the house's own October is under Porters Neck.

On October 3 2026 he asked for more of it: "I want bats, fluttering around - more movement,
both scenes. I want the moon to be a creepy blood moon. I want a witch to fly through the night
sky... can you do these things? Yes, it's a weather app - it's also fun for my family....", then
"or harvest moon - I dunno, but you get my drift. I want MORE halloween." So the bats, the witch
and Halloween's moon are the holiday's two deliberate exceptions to the house rules: things
that move because movement is fun, against "nothing moves because movement is nice", and a red
moon, against "the picture makes no claims", when a red moon would claim an eclipse. The
exceptions are fenced as tightly as the pumpkins are: October only, on the place's own calendar,
at both scenes, gone the morning of November 1, and the weather still shapes every one of them.
Each is a transform or nothing, and each holds perfectly still under reduced motion.

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
  (or `lantern`, `lantern-lit`, `lumina`, `cornshock`, `bale`, `loft-head`, `ghostface`, `bat`, `witch`, `spider`, `trick-or-treater`, `cat`, `sheet-ghost`, `scarecrow`) shows
  each one close up and at phone size.
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
- **The face behind the live oak is Ghostface, and he only peeks.** Josh asked for it on October 1
  2026: "need a Scream Ghost Face peeking from behind the live oak" at Porters Neck. He is in the
  oak's fork (`propGhostface`, placed at `GF_AT`, in the oak's own units), in the V the middle limb
  and the upper right one make above it, so the limbs and the trunk hide his shoulders and the rest
  of him. At rest the middle limb runs beside his hood and the upper right limb cuts the corner of
  his jaw, with both eyes and the mouth clear. His head is cocked about 16° the way he cocks it: a
  face partly hidden by an edge is what says peeking, and a whole one is a portrait. What has to survive on a phone is the
  face from the Scream painting: the long white mask, wide and domed at the brow and long through a
  narrow jaw, the two black eyes that droop outward into a tent over the mouth, and the long open
  mouth, framed by the black hood. The eyes and the mouth are the `eye` role, so they are painted
  last, in black, with no outline. He is three units, the robe, the hood a shade lighter so it rounds
  off against the shoulders, and the mask with its own crescent and lit edge. He is drawn at ten units
  to the pixel and scaled down, as the head in the loft is. True to the oak a face would be under two
  pixels and nothing would read. True to the heron and the raccoon a mask would be about nine wide and
  twelve tall, which the fork cannot hold. So `z=1.22` is the storybook's licence: the mask is about
  six pixels wide and nine tall, about 0.7 of a person's scale beside the animals, about four times
  true to the tree, and about 1.7 times the width of the Myers mask in the loft. There is no knife and
  no gloved hand. A pale blade is a second bright shape against the mask, and a glove was tried on the
  upper right limb and at phone size read as a dark knot on the bark. He stands behind the oak and
  outside its sway (`${ghostface}${oak}`), and he never moves. The oak sways about a pixel either
  way over him in a blow, and the fork is narrower than his face plus that throw, so at the far ends
  of the sway a limb crosses the edge of an eye or the mouth: about a tenth of one at 12 mph gusting
  20, up to about a third in a gale. He sits low in the V because the throw grows with height up the
  tree. `tools/scene.mjs` samples each eye at both ends of the sway, in the scene's wind and at the
  oak's full 1.4° in a gale, and fails an October marsh scene where the oak hides 40% of either.
  He is at the oak's distance and lit by its sky (`decorPal(INK.ghostface, oakD)`, `lightAt`):
  clean white by day, cream at golden hour, grey in the rain and fog, and
  blue-grey at night, when the mask is still the palest thing in the crown and the hood shows against
  the sky. In October the one moss wisp that would hang across his face is left out whole, and still
  makes its draws, so no other wisp moves. That is why the October marsh scenes run 15 moss sways and
  not 16. `node tools/rig.mjs ghostface` shows him close up and at phone size.
- **Bats come out over both scenes in October, from sunset to dawn.** They keep a bat's hours: a
  couple at sunset (the sun under -0.83°), the whole colony a few degrees on, thinning before dawn
  and back in by civil dawn (-6° on the way up), so there are none by day and none at golden hour.
  A storm, rain from `rainK` .65 up, snow, ice and a night at 34° or under keep them in. Wind,
  overcast, light rain, fog and cold under 50° and 42° each take some away (`batN`): seven on a
  calm clear night, four on a raw Halloween night at the farm, one or two in a gale. The wind
  moves them too. Each one hunts a jinking loop round its own patch of sky (`batHuntA`, `B`, `C`),
  banked into its turns, carried downwind across it (`--dr`, up to 26px) and beating back, and
  leaning with the wind (`--ln`). The wings (`rigBat`, a bat seen from below: two short ears, the
  leading edge to the wrist and its thumb, three scallops between the finger tips, the finger bones
  a shade off the membrane, a scalloped tail membrane) each turn at the real shoulder through four
  uneven strokes a beat (`batFlap`). That is three animations a bat. Every draw is seeded
  (`mulberry(4110+i*97)`) and made before any gate, so a bat that gives way never moves the others,
  and the loops take their phase off the wall clock. Each bat's home is one of seven fixed patches
  of sky (`HOME`, dealt out so two or three bats still spread across it), never a share of the
  colony, because the cached paint and the live one a second later can call for a different
  count, and a share moved every bat 20 to 50px when it did. They are pulled toward the scene's own ink,
  never the night's blue, so a bat is always darker than the sky it crosses, and the further ones
  take a little of the air. They keep to open sky (`batColony`): over the far ridge at the farm,
  over the far treeline and the oak, the pines and the heron on the coast (`skyTops`), inside the
  frame, and off the sun, the moon (whatever size it is drawn, `moonR`) and the two times on the
  arc. The turkey vulture goes to roost while they are out. Under reduced motion each one holds
  still at its home spot. `tools/scene.mjs` walks every bat through its whole loop with its wings
  at every stage of the stroke and fails one that leaves the frame, crosses a disc or a time, meets
  an animal or a decoration, or goes behind the scenery, and a scene whose colony (`bats`) is not
  the one the hour and the weather call for. `node tools/rig.mjs bat` shows one close up and at
  phone size against an October dusk and an October night.
- **A witch flies over both scenes on October nights.** She waits for the dark (the sun 6° under,
  where dusk ends), and stays down in a storm, under thunder overhead, in anything heavier than
  light rain (`rainK` .65 and up), freezing rain, heavy snow and fog. She rides the wind: she
  flies downwind, at 30px a second in a calm and up to about 66 in a gale, leaning further over
  the handle the harder it gusts, and she bobs and her cape flutters on the gusts. The gust is
  taken in five-mile steps, so the live paint landing a moment after the cache does not move her.
  When the moon is up and a straight line can cross it in open sky, her line runs through it with
  her seat 3px under its middle, so the moon frames her and the broom and the cat run out past
  it: a gentle climb the way she flies, steeper out of a low moon. Both ends of that line stay
  inside her band: a moon under it is left alone, because a climb through it once started in the
  farm's barnyard and ran out through the owl. The line keeps clear of the
  sunrise and sunset times and above anything standing up into her sky (on the coast the oak, the
  pines and the heron, the same `skyTops` the bats keep over), and when no line can do all of that
  she leaves the moon alone and climbs across the open sky. That is honest rather than clever: a
  moon low beside the sunrise time is not crossed. A moon she leaves alone she passes well clear
  of, her boots 8px over its top or her hat 2px under its foot, never along its rim. She is drawn with the kit (`propWitch`), side
  on, about 34px long (`WS` .2): the pointed hat with its crooked tip, the handle and the fan of
  twigs, the cape's three tatters with the plum lining along their undersides, and her black cat
  on the twigs with its ears up, its yellow eyes and its tail in a hook. That silhouette is what
  carries on a phone. The rest is for the close-up: the hooked nose and chin, the grin, her eye,
  the hat band and belt, the cord round the twigs. The night takes her colours toward black,
  never toward the sky's blue, which lifted her into the sky she has to stand out of, and she is
  lit from where the moon really is (`lightAt`), so crossing it her lit edge is the moon's side.
  She crosses once in each cycle, in its first 22%, and waits the rest just off the frame's edge,
  so a cycle is about a minute in a calm and shorter in a blow. Her clock is the one in the scene
  that is not the wall clock, on purpose: a crossing a minute taken off the wall clock would find
  her off the frame more often than not when someone opens the app. Her first crossing starts
  2.4s after the app is opened or comes back to the front (`WITCH_RUN`, retimed on
  `visibilitychange` without a repaint), a re-render picks her up where she was, and while she is
  crossing her direction and her cycle are held, so a wind that flips between refreshes never
  turns her round on screen. She is three animations, all transforms (`witchCross`, `witchBob`,
  `witchCape`). She flies behind the far treeline on the coast, and in front of the folds and
  behind the barn and the trees at the farm, and in front of the bats, which she flies among.
  Under reduced motion she holds still beside the moon, her nearest reach just off its disc so its
  real phase still shows, or in open sky without one, and wherever she holds her box keeps 3px off
  the sunrise and sunset times and the disc and over what stands up into her sky. She is worked out
  (`witchPlan`) before the bats are placed, so the still bats keep off her too (`batKeep`). `tools/scene.mjs` walks her crossing on
  her own clock at 320, 390 and 430 in every scene she is out in (`witch: true`) and fails one
  where she is out when she should not be or missing when she should be there, starts or ends
  inside the frame, has her hat cut by the frame's top, touches an animal or a decoration, passes
  behind a sunrise or sunset time, has more than 15% of her hidden by a tree or the treeline, or
  misses the moon her line was routed across (`data-across`), where her clock and the animation
  disagree, passes along the rim of a moon she does not cross, and where under reduced motion she
  holds still over the disc, on a time, a bat, an animal or a decoration, or behind the scenery. `node tools/rig.mjs
  witch` shows her close up, at phone size, and on a moonlit night with the scene's darkening.
- **More Halloween, dealer's choice.** After the bats, the moon and the witch, Josh asked on October
  3 2026: "I want MORE halloween." and "+any Halloween dealers choice touches that folks will love."
  The five below and the trick-or-treater on Halloween night (further down) were picked for him,
  and the cobweb on the glass (further down too) is his own idea. Each of the five is a decoration (`data-decor`), lit by the sky it stands
  under, built only while it is out, and placed off the dock, the barn, the pond or a tree, clear of
  every animal, every other decoration, the bats' sky and the witch's path. `tools/scene.mjs` walks
  each one through its own motion (the flick, the blink, the drift, the swing) and fails a scene
  where any of where it goes leaves the frame, meets an animal or comes within a pixel of another
  decoration (`decorCheck`, `MORE`), at 320, 390, 430 and 760.
- **A black cat sits out in October.** On the coast on the dock's planks, between the middle piling
  and the lit end, facing the land with its tail down over the edge; at the farm on the top rail
  just right of the barn, set inside a span the rail runs along (`propBlackCat`, `catAt`). It sits
  with its head turned to us: amber eyes with a slit by day, and from sunset, the barn lamps' hour,
  the green eyeshine and a soft glow round it (`eyeNight`, never toned by the sky, because it is the
  sky's own light coming back). Now and then its tail flicks (`catTail`, a 23-second cycle phased
  off the wall clock, two quick flicks and a settle at the tail's own root). It goes in when it
  rains, and on a cold morning it gives the dock to the cormorant, who has the middle piling. On the
  dock the lantern beside it warms its side (`lights`, at a third of the strength, so it is still a
  black cat). It is drawn at ten units to the unit, about seven pixels by twelve with its tail.
  `node tools/rig.mjs cat` shows it close up, at phone size and with its eyeshine.
- **Eyes in the dark.** On an October night (the sun 6° under, so not at dusk, when the first bats
  have the last of the light) and not in the rain, a pair of eyes opens in the coast's spartina and
  another at the edge of the farm's woods, one gold pair and one green at each place (`darkEyes`).
  Each fades in, looks, blinks once and fades out on its own clock off the wall clock (`darkEyes`,
  23 to 34 seconds), so they are never both open on the same beat. They are light, so the sky does
  not tone them. On the coast the gold pair is at the far left of the bank and the green one in the
  grass short of the dock; at the farm the gold pair is on the far bank behind the pond, left of the
  scarecrow, and the green one up the wooded fold between the cat and the right hardwood, over the
  fox and short of the owl.
- **A scarecrow stands across the pond at the farm.** In the field on the far bank, a little right
  of the pond's middle (`propScarecrow`): bib overalls with a patch over a red flannel shirt, arms out
  along the crossbar with straw at the cuffs and the ankles, a burlap sack of a head with a stitched
  grin, a floppy straw hat. A crow sits on its arm by day, because a scarecrow with a crow on it is
  the joke, and it is gone at night and in the rain. The scarecrow never moves. The farm only: the
  coast has no field to stand it in. `node tools/rig.mjs scarecrow` shows it with its crow.
- **A cheesecloth ghost hangs in the big hardwood at the farm.** From under the big left tree's
  left-hand leaves beside the trunk, inside the tree's own sway group, so it goes where the tree
  goes (`propCheeseclothGhost`, `ghostIn`): a round head under the gauze, a pinch at the neck, a hem
  torn into long uneven tatters with a thread or two trailing off them, two eye holes and an O of a
  mouth. It swings from its knot as far as the gusts say (`ghostSwing`), taken in five-mile steps
  so the live paint landing after the cache does not move it, and in a calm it hangs still: under 5
  mph of gust it has no `ghost-swing` at all, because the class alone runs the CSS defaults. Not at
  the coast: the oak there already has Ghostface. `node tools/rig.mjs sheet-ghost` shows it close up.
- **Will-o'-the-wisps on the marsh.** Three small pale green-white lights low over the bank and the
  water, between the raccoon and the dock and never more than a short reach apart (`wispsAt`), only
  on a dry still October night: the sun 6° under, no rain, no storm, the wind under 9 and the gusts
  under 15. Each drifts a few pixels and dims on its own slow clock (`wisp`, 13 to 20 seconds,
  seeded, phased off the wall clock), and the two over the water lay a faint light on it. The last
  one ends short of the oyster rake, measured off the rake's own drawing (9px for the flame, its
  light on the water and its drift), because on a phone it once stood on the shells, and the rake is
  painted after it. `tools/scene.mjs` walks each light's drift against the rake (`data-prop="rake"`).
  The coast only: a marsh light belongs to a marsh.
- **A cobweb is strung across the corner of the app itself in October.** Josh, October 3 2026:
  "maybe cobwebs a corner of the app that breaks the fourth wall". It is on the glass, not in the
  scene: over the sky in the header's top right corner and in front of the rain, as if a spider had
  set up on the phone. That is the corner with room. The place switch, the big number and its meta
  fill the left, the live stamp sits in the top right, and under the stamp, right of the reading, is
  open sky at every width from 320 to 900. Its radials come in off the screen's edge, meeting just
  past it, two mooring threads run up the gutter beside the live stamp into the corner (and beside
  the alert strip when there is one), and the web hangs under the stamp. It is placed, not stamped:
  `paintCobweb` measures the type in the header (the line boxes the stars keep off, `typeBoxes`,
  plus the chips, the rain strip and the alert strip) and `webPlan` draws it as large as it can be,
  up to `Rmax` (27% of the sky's width, 72 to 128px), with no thread within 5px of any of it,
  smaller and the same shape when it has to be, and not at all with no room. A mooring thread that
  would come near the stamp is left off. It is painted last in `render()`, again when the alert strip
  opens and when the fonts land, and never in the loading or error shell. It is absolutely placed
  (`.cobweb`, `pointer-events:none`, `aria-hidden`), so nothing moves under it and every tap goes
  through it. The silk is the sky's own two inks: on a bright sky a pale thread (`--off-sky`) with the
  sky's dark ink along its shadow side, which is the inked line; on a dark one, at night and at a dusk
  or dawn dark enough for the pale ink, the thread is that ink with a soft wide glow under it. Dew
  beads it faintly while the sun is up (the light theme), and never at night. It is hand strung, its
  rungs uneven and each drawn in and drooping by its own amount, two of them broken with their ends
  hanging, and every draw is seeded (`WEB.seed`), so it is the same web every time. The spider is a
  black widow (`propSpider`, drawn with the kit at ten units to the pixel and shown at eleven,
  `WEB.sp`), the cobweb weaver of both places, hanging head down on her dragline belly to us: glossy
  black, the red hourglass, each leg two strokes so the knee is a joint (a smooth leg read as a claw),
  a warm edge by day and a wide cool one at night, because a black spider went out against the night
  sky without it. She hangs from the middle of one of the frame's lowest spans, sways on her dragline
  (`webSwing`, 4° either way), and every 29 seconds lets herself down a few pixels and climbs back
  (`webDrop`), with the dragline reeled out the same distance on the same clock (`webReel`), so she
  never leaves the end of it. That is the holiday's exception the bats and the witch are, motion for
  fun, and it is three animations, transforms only, phased off the wall clock, and still under
  reduced motion. Her whole swing and her drop keep off the type the way the web does, and her drop
  is the charm, so a long headline under her moves her along the frame or shortens her line before
  it takes her drop, and her room is planned to the bottom of her bounce (`WEB.over`, the 12% her drop
  overshoots before it settles). She is on the glass, so the wind does not move her. `tools/scene.mjs` walks every
  thread and puts her at both ends of her swing, hanging and let down, at 320, 390, 430 and 760, each
  animation walked from its own active time past its wall-clock delay (set straight to a fraction of
  its duration, her pose hung on the time of day and the drop was often never checked), and fails
  a scene where any of it comes within 3px of a word, a number, a chip or the strip, where she is off
  the end of her line, where the walk never lets her down, where a thread takes a tap or the place switch or the stamp stops answering,
  or where the web is up outside October or missing in it. Each October scene writes a close-up of
  it at 320 and at phone width. `node tools/rig.mjs spider` shows her close up and at phone size by
  day and by night.
- **The corn shock is tied high**, and its crown is broken stalk tops and dry leaves standing
  up and out, so at phone size it is a sheaf and never a figure in a dress. Only the leaves
  that break the silhouette take ink. The bale sits level on the ground, with its long side to
  us.
- **The candle is lit when the barn lamps are** (the sun below -0.83°), and not in the rain or
  a storm. Its flicker is the only thing Halloween adds that moves on the ground (the bats and the witch are in the sky), and it moves with the air:
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
- **On Halloween night a trick-or-treater comes.** October 31 only, from sunset (the sun under
  -0.83°, when the barn lamps and the candles are lit, and the place's clock past noon, because the
  small hours before dawn on the 31st are the 30th's night), until everything comes down at midnight: a
  little kid under a bed sheet with two eye holes cut in it, holding out an orange plastic pumpkin
  pail (`propTrickOrTreater`). The night is the `trickOrTreat` day on Halloween's row in `HOLIDAYS`,
  read off the place's own date like the rest of the holiday, and `trickOrTreating` is pure and
  tested. A drizzle does not keep a kid in, and nor does fog. Rain and anything heavier does, and so
  do snow, ice and a storm, and then the door and the dock are left to the pumpkins. What has to
  survive on a phone is a pale bell with a round head, two black eye holes, two dark sneakers under
  the hem and an orange ball held out at its side. The sneakers are what say a kid in a sheet and
  not a ghost, so the hem stops above them. The rest is for the close-up: the head tipped toward the
  pail, the folds and the uneven hem, the hand out from under the cloth with the handle across its
  fingers, and the pail's ribs, its face and two candies at the rim. It is drawn at ten units to the
  pixel, as the faces in the oak and the loft are, about eleven and a half pixels tall and eleven
  wide with the pail: kid scale with the storybook's licence, about twice a jack-o'-lantern and
  under the barn door. It is a decoration (`data-decor="trick-or-treater"`), lit by the sky like
  every one, and it never moves. At the farm it stands at the door between the two big pumpkins,
  about a pixel and a half clear of each, and both lanterns name it in their `lights`, so the sheet
  takes their warmth from either side and the doorstep's pool goes under its feet. It is drawn
  before them for that. On the coast it stands at the dock's landward end, the shallow one, between
  the end piling and the middle one and beside the little pumpkin. The lit lantern is at the other
  end, too far off for its light to reach, so there the kid is lit by the sky alone. The cormorant
  has the middle piling on a cold evening until dark, so the kid waits for it. `tools/scene.mjs`
  fails a scene whose kid is out when it should not be or missing when it should be there (it is in
  the scene's `decor`), or runs into an animal or another decoration, and it runs the kid out on
  Halloween night at both places and in a drizzle, in for the night in the rain at the farm, and kept
  off the dock by the cormorant at a raw dusk. `node tools/rig.mjs trick-or-treater` shows the kid
  close up and at phone size.
- **The moon is Halloween's too, and it keeps its place and its phase.** Josh asked for "a creepy
  blood moon ... or harvest moon" on October 3 2026, so both are drawn and one constant,
  `HALLOWEEN_MOON` (`"blood"` or `"harvest"`, `null` for the ordinary moon all year), picks.
  It is the exception the picture makes no claims for: a red moon would claim an eclipse, so it
  is October's alone, read off the place's own calendar like the decorations, and everything
  true about the moon stays true. It rides where `moonPos` puts it, the terminator is its real
  phase, and only its colour, its glow and the harvest moon's size change. `halloweenMoon()` is
  pure and test.mjs runs it. Both are drawn the Storybook way: a flat face, a hard shadow
  crescent on the limb away from the sun and a warm edge on the limb toward it, inside the
  phase, and the ink heavier on the shadow side. The blood moon is the rust red of a moon in
  the earth's shadow, a dark maroon where it is unlit, inside a dark red haze. The harvest moon
  is deep orange in a gold glow, a fifth again the ordinary disc high up and half again low over
  the skyline, measured from the ridge's crest (about 22° up) at the farm, because that is the
  moon illusion. After dark it is the whole colour, from just after sunset to the end of dusk. By
  day it is a pale tint of it, the face only, because a red moon in a blue sky is just odd and a
  shaded one reads as dirty. The glow follows the phase, so a crescent does not throw a full
  moon's light. The ordinary moon is not veiled after dark, but a red or orange one shining
  through a sky gone over is a claim, so above 60% cloud its glow goes first and then the disc
  dims. Its light on the water and the lit edges of the scene warm toward its colour, a little
  (`moonLight`). The Tonight card's moon and the farm's moon chart stay ordinary, because they
  are readings. It adds no animation. It is `HALLOWEEN_MOON="blood"`, Josh's pick on October 3 2026 when he saw both drawn ("blood moon. Looking great!"),
  and the harvest moon is kept drawn and tested beside it, a one-word change away. In the scene it
  is a decoration (`data-decor`, `blood-moon` or `harvest-moon`), and its disc (`data-disc`, with
  `moonR`) is what the bats keep off and the witch crosses.

## Porters Neck: the house across the pond

On October 21 2026 Josh asked whether to redo his own scene, now that Beaufort had shown what a place drawn
for one family could be. He passed on Wrightsville Beach's pier and surf shop, which are miles from the house,
and asked for the scene to be "whimsical and representative - not literal", then sent a photo of the house
from across the pond at dusk ("this is my house."), and four more for vibes: the patio looking west at
sunset, the pond looking south with its fountain, the patio looking east with the hot tub and the pines, and
the compass on the porch. Every rule below is something he said or picked over that afternoon, and he said
"ship it!" on the sixth round. The marsh, the live oak, its egrets, the dock and its cast are parked (below).

**What it is.** `pnPondScene`, the family's house seen from across the pond, the house the picture, in Storybook Ink:
the white board-and-batten house with its big silver standing-seam roof, straight and symmetrical over the
house ("it's symmetrical to the house.. perhaps the photo was at an angle"), the two front gables with
shakes in their peaks, the screened porch between them under its own low hip and its flue, and on the porch
wall behind the white screen door the navy compass dial ("need the dial on the porch as well"). Tall
double-hung windows, the left pair in one casing, the right three apart (a straight-on photo shows a fourth on
the right; Josh: "keep it for now. undecided"). The fire table and its Adirondack
chairs on the patio's west end, the hot tub on its east end centred on the bank of four east
windows, a sabal with a windmill palm between it and a second sabal at the west and the same group at the east, the black fence running only between
its two white pillars ("the white stanchions should mark the limit of the fence"), a gate and low steps
straight down from the back door, fountain grass along the inside of the fence up to the gate, the lawn,
the sand, and the pond with its aerating fountain on the door's line ("directly center on the house/door").
The frame is mostly house with a little room each side: the neighbours are close, so none are drawn ("drop
reference to other houses around it because the fact is they are very close"). It is laid out in a 320 by
194 frame, a phone's, and that is the frame at every width (`sceneH`, and the early script's copy, with
`W` locked to 320 for the pond). A wider screen scales that picture up to fill the width and crops the
sky when the scaled frame would eat the first screen (`pondFit`, keeping at least the roof). It does not
add ground at the sides. The farm and Beaufort still widen with `appW()/1.22`. The main roof carries a
white ridge cap the full length of the ridge, the same board as the slope rakes it meets.

**It faces north, and the sky knows it.** From the house the pond is south, the fire pit west and the
treeline east (Josh's directions), so this view looks north: west on the left, east on the right. `LOCS.mb`
carries `faces:"north"`, and for such a place the sun's arc is mirrored (sunrise and its time on the right,
sunset on the left), the moon's place and shading follow it, and the wind's bearing is mirrored once
upstream for the scene and the sky, so the palms, the grass, the spray, the rain, the clouds, the bats and
the witch all go the way the real wind blows. The house draws no arc. The illustrated sun keeps that
sine and `sunPos`, except at the crown, where it drops until the whole disc and its rays sit under the top of the frame (`pnSunFit`). A short window crops that sky, and when the open sky above the roof cannot hold the sun, it draws smaller and tucks behind the ridge. Golden hour warms the light, and a low sun lays a long shadow and a glint on the
windows it faces. The sunrise and sunset times sit up in open sky, in the corner columns, clear of
the palms, the roof, the house and the pond, with the thin halo they already wear and no box behind them.
Sunrise stays on the right and sunset on the left all day, because the house faces north. A thin
chevron sits beside each time, on the side toward the house, up for sunrise and down for sunset.
Its stroke matches the digits and it wears their halo. Josh picked this on October 22 2026.
A short window crops the top of that sky, and the times drop to just under the crop, still in the corner.
The sine takes 90° to that crown, which set an afternoon moon into the roof, so a moon
`pnMoonInRoof` would hide takes the shallower rise (.35) and stays in the sky. A moon already clear of
the roof keeps the sine. Josh would rather move the sun's path than shrink the house. The low sun's warmth comes
from its own side ("morning vibe glow more prominently from the right side in the morning, then evening
vibes to the left"): a warm horizon, a warm wash over the house and the land and the pond from that side,
building from about 14° up and gone by about 7° below, muted by cloud, fog, rain and storms. Midday is
neutral.

**The lights keep the family's hours.** The bistro strands run from one point over the back door to a
sabal on each side, a V seen from above ("the bistro lights go from door to each palm - forming a V"),
crossing the windows as they swag forward. They come on at the start of evening golden hour, the sun at +6° on the way down, the same moment the golden hour label uses, and go off at 10:00 pm on the place's clock
(`PN_STRANDS_OUT`). Morning golden hour leaves them dark. They hang still from the sabals, each end tucked into its palm's
boots so the palms' sway never shows a loose end. The fire table
(`propPnFireTable`) burns only while the strands are on, between 45° and 68°, dry, in no storm or fog,
with gusts under 20 and no thunder (`fireOn`). Lit, it is a small fire: several tongues over the trough, flickering on the moving sheet, with a warm pool on the paving and across the chairs. The hot tub is in use from October 20 through April 15 (`PN_TUB`, `pnTubSeason`): the cover stands open, and short soft wisps of steam rise day and night, fading out around the top of the windows. The underwater lights follow the strands, on at evening golden hour and off at 10:00: one wash across the water, lagoon teal then moon blue, with a soft halo on the tub. The colour stays on the water. It is a slow opacity crossfade on the moving sheet, and reduced motion leaves the steam and one quiet colour. The windows and the porch light the house from sunset until 10:30, then stay off overnight (`pnHouseLights`). The pumpkin lights keep that 10:30, on their own, and do not follow the strands. Josh picked this drawing and it is the house everyone sees. The main roof is one trapezoid: its lower edge is the outer bottom corners of the two gables, the ridge is 0.87 of that span and the rise is 0.30 of it, the photo's ratios, and each gable peak is 0.45 of that rise. The siding, the shakes and the metal roof are white, with the seams and a little shade for depth, and at night that white goes blue-gray with the sky. The only house lights are the strands out to the palms, off at 10:00. In October the orange pumpkin lights
along the fence hang in swags, high at each post and low in the middle, five or six bulbs to a bay. They are on by day and from dusk until 10:30, then the wire stays up and the bulbs go dark until the sun is up. They are on the holiday
calendar like every decoration, and gone the morning of November 1.

**Weather.** Every reading still drives the picture: the palms, the grass and the fountain's spray lean and
drift with the gusts, the reflection is glass in a calm, breaks into strips in a breeze and into glints in a
blow, rain falls in front of the house as well as behind it (the house is a tall silhouette, so it has the
near drops the ridge has, from one helper, `nearRainLayer`), rings the pond and breaks the reflection, a storm
dims everything under the app's lightning, and fog softens the house and widens the halos.

**Who is out.** Small whitetail does (`whitetail-doe`) on the lawn in front of the fence at dawn and dusk, at
real size, with a dorsal stripe and a longer neck that nods, and the great blue heron (`great-blue-heron`) standing side-on in
the shallows at the pond's east edge in every weather but a thunderstorm, its head nodding. Gulls cross at midday when it is
dry, with a longer wing and a small chest mark, and in October the bats hunt over the roof from sunset to dawn, the same wing with a pale chest mark. Nobody sits at the fire: the
picture makes no claim about who is home. These are the detailed drawings. There is no animals query.

The dogs are not in the picture: not on the patio, not by the fire, and not in the screen door, at any hour. The drawing and the schedule are gone.

Carolina pond sliders (`pnTurtlesPlan`) are small. In the water only a little head breaks the surface, with at most a very faint low-opacity rippled hint of the shell below it. On the bank, on a warm clear day, one small slider basks, in proportion and clearly smaller than the heron. On a warm clear day, the sun at least 6° up and the air at least 60°, two heads break the surface and one basks on the east sand. A milder day, 48° and up, keeps one head. Rain keeps one head and no basking. A dry night keeps one dim head. A storm, snow, a cold day or a wet night keeps them down. A head dips and comes back on its own clock.

**October.** The blood moon, the bats, the witch and the cobweb are shared with the other places; the sky
over the house is small, so the bats and the witch fly in front of the roof. The house's own, each a
`data-decor` the harness counts: the pumpkin lights (`pumpkin-lights`), the black weeping willow just
left of the fire table (`light-tree`, in the round bush's place: drooping black locks, purple and orange
lights that stay lit by day and all night, past the strands at 10:00 and the windows at 10:30, fills only), one orange and one white pumpkin on each pillar ("put
one orange and one white pumpkin on both fence stantions - then carve them on time"), both carved and lit
from the carving day by the candle rules (`pumpkin`, `white-pumpkin`, then `jack-o-lantern`), two lanterns
at the gate, Ghostface a dim layer clipped inside the glass of the rightmost east window, which is drawn with the same sash as the other three (the same frame, the same meeting rail, the same glass and the same light at every hour), clear of those bars, with no extra window parts and no vertical bar (he lived in the marsh's oak, October only, and he stays after the lamps go out at 10:30), and on Halloween
night the trick-or-treater at the gate, on its own rules. With nobody's cormorant on a dock, the kid is out
from sunset (the marsh's raw-dusk case kept the kid off the dock; the house's, case 48, has it at the gate).

**Left out, and why.** The golf cart (`pnCart` is kept, placed nowhere): at this crop both edges are palms and
there is no honest place to park it. The neighbours' houses and the pines, which made the house read as
standing alone in open land. The grill, the patio table and the flags, clutter at phone size. The
surfboards stay, three of them in a wood rack on the patio against the blank west wall between the windows and the porch, tails on the paving.

**The parked marsh.** Porters Neck's scene from September 2026 to October 21 2026 (the spartina, the live
oak with its moss and egrets, the dock, the heron, the raccoon, the fiddler crab, the oystercatcher, the
cormorant and the coast's October decorations) is still in index.html, reached by no place, as Denver's
Front Range is: `LOCS.mb.view` set to anything but `"pond"` brings it back, with `faces:"north"` taken off
(the mirrored sun's path, moon, times and wind are keyed on it, and they belong to the house's view), the
early script's `view` taken off `PLACES.mb`, and the marsh's `sceneLabel` ("Sun and moon over the marsh
horizon") put back in both. Its notes above (Holidays, Motion rules) describe it. Its harness cases and
tools/egrets.mjs went with it; they are in git history before this change.

**Sheets, for the iPhone.** The house is the heaviest picture in the app, and the first build ran at 9 to 11
frames a second in `tools/webkit.mjs`'s WKWebView, because WebKit repainted the whole sheet, the house and its
inked reflection with it, every frame a palm or a blade of grass moved; with every animation paused it ran at
60. So nothing that moves is in a still sheet. Back to front: `#sceneSvg` the sun's path, the sun, the moon and
the low sun's glow in the sky; `#sceneSky` the clouds and the gulls (when a gull would cross the sun, the moon
or the glow, those ride over it here, so the stacking stays exact); `#sceneNear` the house, the patio, the
chairs, the tub, the tree, the surfboard rack and the strands; `#sceneLift` the palms and the two bands of fountain grass as boxes
the compositor sways (liftKit, shared with Beaufort); `#sceneFront` the fence, the pillars, the pumpkin lights
and the kid; `#sceneFx` the fire's flame, a pumpkin while its candle flickers, the bats, the
witch and the near rain with its own mask; `#sceneWater` the low sun's wash, the does, the land fog and the pond; `#sceneRefl` the reflection, its
fade a CSS mask the compositor applies (an SVG mask there was 81ms of every repaint); `#sceneRipple` the
moving strips, the rain rings, the sand line and the fountain in front of it; `#sceneTop` the low sun on the water, the heron,
the fog veil and the sunrise and sunset times. The house's sheets keep a colour of their own, so the sky's .8s
ink fade no longer repaints them on every frame of it; the two sheets that draw in the sky's ink, `#sceneSvg`
(the sun's path) and `#sceneTop` (the times), still inherit it and fade with the sky's words. A first paint of the house writes the sky at once and the land and water over the
next two frames while they are hidden, then shows them whole (`SCENE_DRAW` cancels a part-written paint); a
paint over a picture already up, the house's or another place's, is written in one frame, because staged over
the farm's picture on a cached switch the farm went and a bare sky stood for three frames. Measured October 21 2026 at 390 and 3x: the coast's
night, rain, afternoon, a blow gusting 42 (`coast-blow`) and Halloween night (`coast-halloween`) all idle at 60
and open at 58.6 to 58.9 with no frame over about 58ms, the GPU process at 2 to 9 seconds per 10 where it was
18. Again on October 22 2026, with the near rain falling on `#sceneFx` in front of the house: every house case
idles at 60, the rain case at 60.1 with the GPU at 5.7 seconds per 10. `tools/scene.mjs` fails a house scene
where any still sheet runs an animation.

**Seeing it.** `TZ=America/New_York node tools/pond.mjs` shoots the house at noon, sunrise, the morning and
evening golden hours, dusk, the night with the moon, 10:30 pm with the strands off since 10:00, rain, a storm, fog, a
blow from each side, an October night and Halloween night, at 390, with close crops of the yard;
`PORCH_PN_WIDTHS=390,320,760` also shoots the four main moments (noon, dusk, the night with the moon and the
October night) at each further width.
`PORCH_PN_PRM=1` shoots it under reduced motion and `PORCH_PN_FREEZE=1` stops every animation at the same
point, so two builds can be compared pixel for pixel. `tools/scene.mjs`'s Porters Neck cases are the house's.

## Beaufort

Josh added a third place on October 15 2026, and shipped it the same night: Beaufort, South Carolina,
for Jen's family (Kate's sister) on Coosaw Club Dr in Coosaw Point, on Lady's Island across the river
from downtown. He worked the scene out with Jen ("live oaks... larger, grander Spanish moss, more
prevalent. Palmetto... moon type look... the white birds... the water, the swing bridge... an alligator
probably in the body of water that's out sometimes... eagles... a crab that comes out when it's
raining... a boiled peanut somewhere... a non-corny aviation nod... the Bengals"), saw it drawn, sent
it back once, and then said "make it live... give it the halloween treatment too".

**Where the readings come from.** `LOCS.bft` is the middle of the street (32.4938,-80.6151). The tide is
NOAA's Beaufort station on the Beaufort River (8667999), by the swing bridge: a harmonic station with
predictions only (high and low, and every six minutes), no gauge and no thermometer, so the level beside
the skiff never shows here, which is honest. Its range is about 7.4 ft, twice Wrightsville's. The water
temperature is CORMP's wave buoy 41067 off Fripp Inlet on SECOORA's ERDDAP (it posts within about eight
minutes of each hourly reading, inside `BUOY_FRESH`), and the seas are Open-Meteo's marine model at the
same spot (32.28,-80.40). The water section's title is the place's own (`LOCS.*.water`, "Water · Beaufort
River"). Beaufort County became one NWS zone with its beaches (SCZ148, Charleston's April 2026 renumbering),
so the point's own alerts carry the tropical watches and warnings and there is no `beach` zone; the beach's
rip current, high surf and beach hazards products come with it, and `quietAlerts` keeps them off a strip
on Lady's Island. The year is NOAA's 1991-2020 normals at Marine Corps Air Station Beaufort (USW00093831),
`NORMALS.bft`, built from NCEI's data and checked against its CSVs. `boatSeason` is null.

**The scene, and what Josh decided.** `lowcountryScene` draws it (renderScene hands it the whole light).
Seen from the waterway east of the bridge: the far line is Lady's Island's low wood on the left and, past
the bridge's town end, Beaufort's waterfront oaks with St. Helena's green copper spire and the Baptist
Church of Beaufort's white needle standing out of them (`bftSkyline`, `propBftSteeple`). Josh asked for the
steeples in place of a tree line that "steals [the bridge's] silhouette", so the far line runs low behind
the swing span and the truss keeps open sky. The Woods Memorial swing bridge (`propBftBridge`) is the real
one: a Pratt through truss swing span with a polygonal top chord, the tender's house at its peak, the
approaches on bents, its street lights, the tender's window and the span's red lights on after sunset
(`bftBridgeGlow`). The grand live oak (`propBftOak`, `bftOakDraw`) has no curls at its branch ends and far
more Spanish moss than Porters Neck's, in three depths (the far curtains behind the back leaves, the front
curtains off the limbs, the veil over the crown), both of which Josh asked for ("it's critical"). Three
palmettos (`rigBftPalmetto`), the SC state tree, stand on the right bank. A long Lowcountry dock runs out
to a covered dock house (`propBftDock`) with a float that rides the tide down its gangway and the family's
center console alongside (`rigBftBoat`). On the dock house flies the South Carolina flag (`rigBftFlag`), Jen's
"palmetto, moon type look", and on the float's guide piling stands an aviation windsock (`rigBftWindsock`),
the non-corny aviation nod: it fills the way an FAA sock does, straight out at 15 knots, and agrees with the
flag. A crab-pot buoy painted in tiger stripes (`propBftBuoy`) is the Bengals nod. The boiled peanut sign
was drawn and Josh dropped it. The Marine F/A-18A Hornet is the family's airframe ("F18A (USMC)"), and
crosses high on a clear day now and then.

**The tide is drawn.** The water's level is the dock's (`bftDockWater`): mud flats come out from both banks
as the tide falls, with their oyster rakes and a wet edge, and go under on the flood, the float rides seven
units under the deck at high water and seventeen at dead low, and the channel under it is the last thing
wet. `tideLevel` reads the level off the station's own high and low predictions (`SCENE_TIDE`).

**The grass stands on its bank.** Josh, on the morning of October 16 2026 with the tide near low: "the mud
flat sim is excellent! let's look at that grass though, because at low tide like now, looks like it's
floating." It was. The spartina stood on the banks' top lines with the river drawn straight behind its feet
at every tide, while the flats and the float said the water was down, and the tall grass at each bank's
corner had water under its feet on the flood. Smooth cordgrass grows on the marsh platform from
about mean tide up to the high-water line, so the bank it is rooted in now comes up out of the river as the
tide falls (`bftGrassMud`): four units of it at dead low, and none from `BFT_GRASS_WET` (.94) up, so a spring
high is the picture it always was, the river up around the stems. Along each bank's river side there is wet
mud from the waterline down to the grass's feet, its top swelling and dipping a little along the bank (seeded)
and kept under the dock's stringers so the walkway stands over the marsh, and its waterline glints in broken
lengths. The land's top line is only the lip inside that mud now, so its ink is laid over in the mud's colour
and only a faint line of it is left. A darker wet band lies at the feet and fades into the grass, with a little
wrack. At each corner the mud carries on under the tall grass and drops into the flat's own outline, in the
flat's own colour, so the corner grass stands on the mud the flat is. Each bank's outline is written once
(`BANKS`), and the land, its flat and the mud are all drawn from those points. It is the flats' own mud and
ink on the still picture, and it adds no animation. The grass keeps every one of its draws and stays on
`#sceneFx`. `tools/beaufort/scene.mjs` measures every tuft's foot the frame shows against the ground drawn
under it (the shapes tagged `data-ground`), at the case's own tide and painted again at 0, .15, .5, .8 and 1,
at every width: a foot is on the land or the mud, in the river only from the wet line, never over air, and
below the wet line the ground stands over it, 2.5 units at dead low, 1.5 at mean tide and down to none at the
wet line with no step, so it is never seen against the river. The page as it was fails 9 of the 34 feet in
the frame at 390 on Josh's morning and 15 at dead low.

**The animals are their real sizes** against the oak, the boat and the dock (about two-thirds of a foot to
a unit on the near banks), which Josh asked for, and none stands on another (`tools/beaufort/scene.mjs`
fails an overlap). The white birds are in the oak, as Josh asked: great egrets and white ibis on the limbs
(`bftOakOn` perches), more at night and at high water, fewer at low water when they would be out feeding,
every one in a storm, the day's own draw so a refresh does not move them. The gator is out on warm days
(68° and up, no thunder, nothing heavier than a light rain): a log in the channel, hauled out on the left
flat at low water, eyes and snout after dark. The bald eagle soars on a fair midday and sits the tallest
palmetto early and late. A fiddler comes out on the flat in the rain. Options drawn and not taken (a
dolphin, a Marsh Tacky, a shrimp trawler) are in git history on feature/beaufort-scene.

**Layers and boxes, for the iPhone.** WebKit repaints an SVG as one sheet, and all of it under anything that
moves. This picture's oak, moss, bridge and palmettos are too heavy to repaint every frame (the first
build ran at 33 frames a second in `tools/webkit.mjs`'s WKWebView, where the marsh runs at 60), so
Beaufort alone paints into stacked layers in `.scene`: `#sceneSvg` the still picture to the oak's back
leaves; `#sceneSky` what moves in the sky (clouds, the soaring eagle, the bats, the witch, the Hornet),
behind the trees; `#sceneMoss` the front moss alone, the only moss that sways; `#sceneNear` the still oak
wood and crown, the veil, the birds in the oak, the dock and what stands on the near water; `#sceneLift`,
the boxes (below); and `#sceneFx` everything else that moves (the flag and the sock, the Halloween dock, the
eyes, the crab, the grass, the cloud shadows, the perched eagle, the fireflies). The four overlay sheets
are `.scene-layer`, each its own layer (`will-change:transform`). Nothing on a higher layer is behind
anything on a lower one. Every other scene clears the overlays and paints in one sheet as before. The
palmettos' fronds flutter on their own only from 20 mph of gust, and the jack-o'-lantern under the dock
house roof gutters only from 10, both because they are sheltered and because each saved the frames.
Measured on October 15 2026 (`tools/webkit.mjs`'s WKWebView, 390 at 3x): noon, rain and a hard blow 60,
an October night with the bats, the witch, the lantern, the balloon and the skeleton 56 with no frame
over 34ms (the coast's and the farm's nights hold 60).

**What turns whole is a box.** Josh, October 21 2026, after the Mac-only checks showed Beaufort behind the
other two places: "go ahead and smooth out Beaufort." The moving sheet was still most of Beaufort's
graphics work. With only the flag fluttering, WebKit repainted all of its 1,200 to 1,300 nodes every frame,
and the cost was what the sheet held: the palmetto crowns (about 380 nodes) and the boat (250) were most of
it. So the parts that turn whole are boxes of their own in `#sceneLift`, each a div turned by CSS, which
WebKit hands to the compositor and repaints nothing:
- each palm, back to front: its back fronds, a still copy of its trunk's top in front of them (cut off at
  `deckY-16`, as `fxPalmTop` cut it), and its front fronds, with the head and the skirt each turning in a box
  of its own on their joint inside the crown's (their flutter from 20 mph). Palm by palm, so the nearer
  palm's back fronds still go over the farther one's front;
- the boat, rocking (`bftRockLift`, its quarter unit of lift a share of the box's own height), with the
  skeleton riding in it and his wave still an SVG joint inside;
- under them a band over the river (`waterBox`) for the water's ripples, rings and mist, which were under
  the crowns and the boat, as small a sheet as they need.

The crowns keep the beats they had as groups: `beatsOf` draws them the way `beats` did. A box is placed as
fractions of the frame (`liftAt`) and turns about its joint (`transform-origin` in shares of the box). Its
drawing is the frame's own (`liftSvg`, viewBox `0 0 W H`), seen through the box, and placed in the frame's
width and height (`cqw`, `cqh`; `.scene-lift` is a size container). Placed as a share of the small box, the
browser's rounding of the box was multiplied by the frame's size over the box's, the drawing landed up to a
third of a pixel off the picture under it, and a pixel compare showed a hairline round every crown. The
drawing runs on past the frame inside its box, and the frame is cut once, at `.scene-lift`, which does not
turn: cut by its own sheet, the third palmetto, combed past the right edge in an easterly, lost a sliver
there that turned with its sway. Measured
in `tools/webkit.mjs`'s WKWebView, alternating with main: the GPU process's idle work fell from 18 to 21
seconds per 10 to 8 to 12 (a hard blow, `bft-blow`, 16 to 6), and every Beaufort case holds 60 frames a
second idle where main held 49 to 58 (the sun behind the oak 49 to 56, `bft-october-night` 53 to 58). The
picture is the same. Shot by a WKWebView at 3x with every animation held at the same moments, main and the
boxes differ by a few levels on a few pixels at most, as main differs from itself, at 320, 390 and 430, by
day, at sunset on the palmettos, on an October night and in a blow. The one cost is the first frame: making
the boxes puts the picture on screen about 30ms later on the Mac. `tools/beaufort/scene.mjs` fails a sheet that still
holds a crown or the boat, a crown or boat box without its one turn (none under reduced motion), and a
box's drawing more than a twentieth of a pixel off the frame.

**The sun behind the oak.** Josh, at about 8:35 on October 16 2026, with the sun low over Lady's Island and
a yellow sliver of it showing through the crown: "when the sun is behind the oak tree, like it is now, that
tree should really glow like it would in real life." Seen against the sun a tree is its own shaded side, so
the oak goes darker and cooler against the brightest sky in the picture and the light lives only at its edges
and in what is thin. The drawing does not change, only its colour plan, and every piece of light is a flat
band cut from a silhouette the way the kit cuts its lit edge, never a blur (`bftOakLight`): a cream rim on
each edge of the leaves that faces the sun, the silhouette moved straight away from it ring by ring and a
twelfth of the way round at a time (`bftRimMask`), 4.2px nearest the sun and wider as more of the disc shows,
none 86 units out, laid over the ink within 45 so the line is lost in the light; a hairline lining on every
outer edge near the sun whichever way it faces; inside the rim a narrow olive-gold band where one layer of
leaves lets the light through; a warm hairline on the limbs; and the back leaves near the sun lighter and
warmer than the front, because the back of the crown is the side the sun is on. The moss is the heart of it:
each beard near the sun outlined in champagne silver down both edges and over its loose ends, its silhouette's
own edges outside (`bftMossHalo`, `bftMossLevel`: full within 26 units, a middle light to 54, a faint edge to
90), only where it hangs clear of the leaves behind it, the thin wisps nearest lit whole, the dense cores
darker, and the one or two veil curtains nearest a sun that shows lit whole like lamps in the dark crown
(`bftOakLamps`). The white birds in the crown go lavender grey in its shade, and those near the sun wear a
broad warm rim. Where the disc shows it is white, its glare a flat stepped ellipse over each gap it shows
through (`bftGlareGaps`, the disc tested against the leaves exactly as the scallops draw them, the wood and
every beard's tails: this morning 8% of it), its few uneven rays behind the crown as long as the share that
shows; clear of the leaves it is the scene's own yellow sun again, and the glare is left off whenever a scene
cloud can drift across the disc. Round it the sky is a cream aureole, the far shore toward it goes pale, the
low sun's bloom moves behind the crown, and the sun's track on the water goes behind the trunk. Beams through
the crown's gaps are two to four flat wedges, only over the crown's shade, the wood and the bank. And the
oak's shadow comes toward us down the bank, each part laid on the ground as far toward us as it stands high,
so the trunk and the limbs are a crisp umbra and the crown a paler dappled shade with sun flecks, mostly off
the frame at sunrise, and a third as strong on the water. The gates (`bftBacklight`, pure and tested) are
each 0 to 1 and multiplied: the sun up (none below -0.83°, under half on the horizon, full from 2°), its light
direct (full under 25% cloud, half at 55, none from 85, none in rain, snow, a storm or fog), its disc behind
the oak on the screen, measured from the drawn leaves, wood and moss at this frame's width (full while the
disc touches them, none once it is a disc and a half clear), low enough to stand behind a crown (none from
36°), and over the far line where it is drawn: the scene's sun comes up out of the river about a quarter hour
after the real sunrise and goes down into it as long before sunset, and while it is still in the river its
light is real and the oak is lit at half, and nothing of the disc shows under the line (`ground`). Beams need
80% humidity (a whisper at 88, more with mist on the river), the sun under 22° and less than a quarter cloud;
the shadow needs the sun a degree up; dew from 92% greens the moss and dims it. A moon behind the oak is far
too faint for any of it, so it is left off. It comes each clear morning from sunrise, gently, at half
strength or more from about a quarter hour after it, until the sun climbs clear of the crown; on the 15th of
each month at 390 (320 is the same frame, 430 within three minutes, 760 up to sixteen minutes later) until
Jan 9:45, Feb 9:37, Mar 10:16, Apr 9:44, May 9:20, Jun 9:15, Jul 9:24, Aug 9:39, Sep 9:54, Oct 10:03, Nov 9:17,
Dec 9:34, fading over the last fifteen to twenty-five minutes. The palmettos, which the evening sun sets
behind, are lit by the same gates from their own crowns and trunks, from about two and a half hours before
sunset until it (October 15, 4:17 to 6:50, at half from 6:32, when the drawn sun goes into the river): their
fronds lit through warm yellow green, their trunks dark, the kit's lit edge turned to the sun and widened,
all in their own colours in their crowns' boxes, with no mask added. The moss's light is drawn
into the front moss's own sway groups on `#sceneMoss`, so it rides the sway and adds no animation. That sheet
repaints every frame, so there its light is fills alone, with no hairline round it (its bands run a little
further in instead, `BFT_MOSS_GLOW_FRONT`), and its faintest edges and lit hairs are left to the still moss: a
stroke round every band was what cost, about four frames a second in WebKit, and the fills alone cost nothing
measurable. Everything else is still, on `#sceneSvg` (the aureole, the white disc and its rays, the far haze,
the back leaves' light, the shadow) and `#sceneNear` (the wood's and the leaves' light between the wood, the
leaves and the veil, the beams and the glare over them). No filter, no new animation, every draw seeded, and
with the sun anywhere else the oak is drawn exactly as before. Measured October 16 2026 at 390 in Chrome: the
scene builds in 23ms with the sun behind the oak and 16 without, a paint about 25ms longer, the same 47
animations; in `tools/webkit.mjs`'s WKWebView (its `bft-sun-behind-oak` and `bft-sun-clear` cases), alternating
with main on a Mac loaded by other work, the sun behind the oak ran 40 to 56 frames a second against main's 42
to 52, within the noise. `tools/beaufort/scene.mjs`'s cases under `/* the sun
behind the oak */` fail if the oak or the palmettos are lit from behind when they should not be, or not when
they should.

**Halloween at Beaufort** is on the same calendar as the other two places (`holidayOn`, `locToday()`), and
all of it comes down the morning of November 1: the blood moon and the cobweb are shared, the bats keep
over the oak, the palmettos, the bridge and the steeples, the witch crosses the moon, a pumpkin stands at
the dock house's river end (carved and lit from the 24th) with a little one at its landward post, the
black cat sits on the walkway, eyes open in the spartina, the trick-or-treater comes out on the walkway on
Halloween night, a red balloon is tied to the third rail post past the dock house (the nod to "It", `rigBftBalloon`,
`BFT_BALLOON_AT`, clear of the palmetto's trunk behind it), leaning on its string as far as the wind says,
swinging on the gusts and down in a storm or from 35 mph of gust, since a party balloon is torn off in a
gale; and a plastic yard skeleton stands at the boat's helm waiting to go fishing (`rigBftBones`), riding
the boat's rock, waving now and then and glowing a little after dark. The trick-or-treater stands further
up the walkway, out from under the balloon's string.

**The fishing water (October 16 2026).** Jen's family told Josh what they open a weather app for: "they're
always looking at the tide for fishing and they're always looking at the wind", the family boater is "always checking the
wind and the waves" for his deep sea trips, and they "would be interested in... fish run". Three versions of
Beaufort's water chart were drawn into copies of the page (branches mock/bft-water-A, -B and -C): A put the
flood tide and the fish on the chart with a row of the wind and a gusts line under it, B drew the wind as a lane
on a fixed scale, and C, "the fishing day", the grass line, the wind at the tide's turns and the offshore
advisories. Josh saw them on an approval page, wrote "go with your pick." and then "ship when ready. nice
job!" (October 16 2026). The pick was C with A's gusts line put back, because C alone read ←22 on a day gusting
34. All of it is Beaufort's alone: `LOCS.bft`'s `grass`, `bigFlood`, `floodSeason`, `marineZone` and `runs`, and
`renderTides`' last argument (`day`), which is null at the coast, so Porters Neck's water is drawn exactly as it
was. Nothing in it is a score, a grade or red.

- **The grass line** is NOAA's own mean higher high water at 8667999, 7.98 ft over MLLW, rounded to 8
  (`grass`): a thin solid green line with a tuft of spartina and `8 ft`, on the chart's own datum scale, which
  always reaches it, so a neap day's highs are seen to fall short. The short marsh grass stands about there, and
  every guide's flood height, put onto this station's table, lands at about 7.9 to 8.2: John Holbrook's and LoCo
  Fly's 7.5 at the Savannah River entrance, the Charleston rule of 6 ft at the harbor, Bay Street Outfitters'
  7.8 to 9 and Owen Plair's 7.5 to 8.5 on a Fort Pulaski-like table. At 8 the 2026 table gives Plair's "10-15"
  floods a month. It is a fact about the table, never a claim about one flat: every flat floods at its own
  height. Its words are placed like the depth scale's: over the line with room round it, under it, a size
  smaller, `8 ft` alone, then the tuft alone. The depth scale keeps out of a flood's band where it can (at 760
  it stood inside the wash as one column), but lightly, because a word on the wash still reads and one on the
  tide line does not.
- **A flood tide** is a high at or over the line. The hours the table stands over it (`floodSpans`: about 1.6
  hours on an 8.3 ft high and 3.4 on a 9.2, NOAA's six-minute predictions) are a pale green band from just under
  the high's time to the bed, the water over the line goes green, and the high's time prints in the grass's
  green. In the guides' season, mid-March to the end of November (`floodSeason`, the tailing season of Bay
  Street, Plair and Indigo Charters: under about 65° water the fiddlers go down and the reds stop tailing), the
  words `flood tide` go once over the first flood high with room, judged on that high's own date. Out of it the
  line, the band and the green stay, because the water is still in the grass, and only the words go. The slider
  says `flood tide`, `big flood tide` from 8.8 ft (`bigFlood`, LoCo Fly's "really big tide (8.5-9')" at Fort
  Pulaski put on this table), and out of season `in the grass`, each on the stop's own level and its own date
  (`floodSay`), so the edge of a 9 ft flood is a flood tide. It is the table: the station is predictions only,
  so nothing on the chart says how much a northeaster has piled in (see the gauge, below).
- **The stage words** are the slider's, the way the guides talk (`tideStage`): `high water` or `low water`
  within half an hour of a turn, `last of the incoming` and `first of the outgoing` within two hours of one, and
  `incoming` or `outgoing` between. Never `slack`: at the swing bridge NOAA predicts the flood running on about
  two hours past the table's high. The moving water itself is not drawn. The slope of the curve is the current
  (NOAA's current predictions in the Coosaw by Sams Point turn within 5 to 12 minutes of this table), and the
  streaks and chevrons the drawings tried said the slope twice.
- **The wind row** sits under the lows on the tide's own clock: at now, the chip's own reading, and at each high
  and low still ahead (`windTimes`), the house's vane pointing into the wind and its mph, one number a column,
  about six hours apart, a turn too close to the column before it giving way. Now's column says `mph` once
  where there is room. Calm has no arrow and a missing hour is a dash. The direction is Open-Meteo's hourly
  `wind_direction_10m`, the one field added to the forecast request (asked at every place, read only here), at
  the house's own point, never a sea cell's, a buoy's or the airfield's. A cache written before it was asked for
  has no direction: its marks are the speed with no arrow but now's (the chip's reading always had one) until
  the live forecast lands. The row's height is held from the first frame (`windRowH`, and its copy in the
  preload), and a cached place switch holds the chart at the new place's empty height.
- **Room under the chart.** Josh, October 21 2026: the water section "feels crowded, especially when there's an
  offshore warning. could be spacing." Each row under the chart stands clear of the one over it: the wind row
  `ROW_AIR` (5px) under the lows' times, the gusts line and the advisory's bar 3px more, the advisory's words
  further off their bar, and the in-season row 18px under all of it. And because the grass line already says
  8 ft, the depth scale at Beaufort names only the 4 ft line (and 0 ft when a spring low runs under the datum),
  leaving 2 and 6 as unlabelled gridlines (`quiet`). The coast's scale names every gridline, as it did.
- **The gusts line** is under the row, only where the gusts matter to a small boat (`gustSpans`): the hours
  whose gust reaches the boat's caution line (`BOAT.iffyGust`, 22, where the boat's sentence turns to "Choppy"
  and the water card grades its gusts) and runs 6 or more over the wind (the chip's own rule for saying
  a gust at all), judged on the whole mph the chip prints. No new threshold, and on an ordinary day nothing.
  Each stretch is `gusts to 34` over its hours with a faint hairline either side of the words for the rest of
  the stretch, the words in the soft ink. It is placed, not stamped: the strongest stretch goes down first, and
  each next one at the nearest spot to its own middle that keeps the middle of its words over its own hours and
  stands three characters clear of the words already down, because `gusts to 25 gusts to 31` a space apart
  read as one run on, and each hairline ends as far short of the next stretch's words, so two stretches never
  read as one chain. One with no room is left to the slider and the chart's spoken label, which say every
  stretch with its hours (`gusts to 25 miles an hour from Saturday at 5 am until 9 am`). Its line is there only
  on a gusty day (`gustRowH`), with air under it, so an advisory's bar under it reads as the advisory's and never
  as the gusts' underline. The slider says each hour's gusts the chip's way (`20, gusts 29 mph`).
- **The offshore advisories** are the forecaster's own call for the ocean off the sounds: the active alerts
  for marine zone AMZ362 (coastal waters from Edisto Beach SC to Savannah GA out 20 nm, Charleston's), a Small
  Craft Advisory, a Gale, Storm or Hurricane Force Wind Watch or Warning, a Hazardous Seas Watch or Warning or a
  Special Marine Warning (`MARINE_EVENT`). This is the family boater's gate for going outside. The house, the river and the
  inner sound are in no marine zone, so the words are named as offshore's, `offshore small craft advisory · gale
  watch`, under a bar over each one's own hours (`zoneBars`: from its VTEC begin, else its onset, else now, to
  its `ends`, else its VTEC end, cut to the chart, a watch paler, square where it runs on past the chart's
  edge). One with no end given runs on, because a product's expiry is only when the next forecast is due:
  Charleston's Gale Watch of October 16 2026 expired at 5 am Saturday and ran from 2 pm Saturday to Tuesday. It
  never goes on the house's strip.
- **Its own lane.** The zone is asked first and beside the forecast (`zoneLane`), and the forecast never waits
  on it. An answer in by the paint joins it. One still out leaves the last reading's bars up, by their own
  hours, until it answers, the storm lane's way with the beach. A late answer goes into the reading and its
  cache and paints the page again only when it changes what the chart shows (`zoneRun`), and the chart's paint
  holds the view the storm card's way (`tideHold`, `viewHold`): scrolled so the chart's top is off the screen,
  nothing on screen under the chart moves; with its top on the screen the chart holds and only what is under the
  bar moves. A request that fails or times out (six seconds) is no answer and no bar, and takes the last
  reading's down, because an advisory nobody could confirm is not said. When the forecast fails the cached
  reading takes the zone's answer too (Open-Meteo unreachable while api.weather.gov answers is the known way).
- **In season** is a quiet row under the chart: `IN SEASON` and the month's fish drawn small in the
  Storybook way (`RUN_FISH`, each about 32px nose to tail, carrying the one mark that tells it), with their
  names. SCDNR publishes no monthly calendar, so `RUNS` is read from its own pages (the species pages, the MRRI
  natural history reports on red drum, seatrout, flounder and sheepshead, the SeaScience pages, its 2025
  snapshots and Technical Report 89 on cobia), each window's comment naming where it comes from, and the local
  guides only where SCDNR gives no months (tarpon into September, the surf's bull reds into November). SCDNR's
  month-by-month check of October 16 2026 set them: reds every month (year-round), named bull reds from August to
  November when the adults come into the sounds and inlets to spawn, trout from October into May (the fall
  fishery, winter trout in the upper rivers, spring on the flats), flounder April to November, sheepshead in May
  and from October into December (on the offshore reefs to spawn from January), black drum February to July,
  cobia mid-April into June with `closed` under them in May (all of South Carolina south of Jeremy Inlet, the
  Southern Cobia Management Zone, SC Code 50-5-1713), tarpon July to September and sharks June to September.
  Only fish: the fall white shrimp and SCDNR's shrimp baiting season under them were in it until Josh took
  them out on October 21 2026 ("drop the shrimp too.... just stuff they would fish for"). It says in season,
  never biting or running now: a calendar, not a report, and it reads no temperature into it (the buoy's is in
  the note beside the title). No bag limits, which change and would go stale on the page (red drum's changed on
  July 1 2026). Its height is held from the first frame, a second line too for May's `closed` (`runsTall`, and
  the preload's `runsTall`, which test.mjs holds to the app's).
- **Left out, and why.** The almanac's fishing times: at Beaufort high water follows the moon by a nearly fixed
  interval, so every moon transit fell on the falling tide and every moonrise or moonset on the rising one (115
  of 115 and 116 of 116, September and October 2026), and they would be the tide by another name. They stay a
  farm feature. The airfield's wind (MCAS Beaufort's METAR, for the family pilot): it is the airfield's reading, not the
  river's, and the section has one shape. The next step, offered to Josh and not
  built: the USGS gauge on the Beaufort River at Beaufort (02176603, about 0.4 mi from the NOAA site, gage height
  plus 4.43 ft is MLLW, open to a browser, about 30 minutes late). It ran a mean 0.59 ft over the table from
  August 17 to October 16 2026 and 1.5 ft over on October 10, so it would let the level tag beside the skiff
  work here and catch the floods the table under-reports.
- **What checks it.** `TZ=America/New_York node tools/beaufort/scene.mjs` has ten water cases on NOAA's real
  2026 table (`tools/beaufort/fixtures/tides-8667999-2026.json`): an August noon, a hard April blow with a Small
  Craft Advisory, a raw January morning, an October afternoon, the October 27 king tide, a May evening with the
  cobia closed, an October night, today on the real Open-Meteo run with the Small Craft Advisory and Gale Watch
  of October 16 (`open-meteo-bft-2026-10-16.json`, the advisories re-typed in the alerts API's shape, not the
  archived products), that run's Saturday night with a Gale Warning that gives no end, and an August sea breeze
  gusting to 25. At every width it writes the water section (`scene-<case>-<width>-water.png`) and fails a word
  or a line off the chart or on another, a gusts' hairline or an advisory's bar within 2px of a word or 3px of
  each other, a gusts' hairline within 10px of another stretch's words, a bar nearer the gusts' words than its
  own, an in-season row that wraps or outgrows its held
  height in any month, and a case whose gusts, advisory or spoken label are not its own (`LANES`).
  `tools/interactions.mjs` reads every stop of the king tide at 320, 390 and 900 and by a finger; opens the April
  blow with the zone 5.2 seconds late and the page's own scroll anchoring off, scrolled under the chart and onto
  it; and opens it on a cache that had the advisory and no wind direction with the zone failing. test.mjs runs
  every reader above, holds the rules and the calendar's shape, and runs the page's own refresh with the zone in
  time, slow, unchanged, failing at once and failing late, and carried on a cold open.

**Seeing it.** `node tools/beaufort/look.mjs <key>` shows any Beaufort drawing close up and at phone size
(the keys are in `BFT`, the registry each drawing registers in, the in-season fish among them as `run-reds`
and the rest), and `TZ=America/New_York node tools/beaufort/scene.mjs [cases]` renders the real page at
Beaufort in every weather, tide and October case and the ten water cases, and fails a page error, an animal
overlap, a tuft of grass with nothing under its foot (see the grass above), more than 120 animations, or
anything in the water section the fishing water's checks above catch. Among its cases are the grass at every
tide: Josh's morning (`this-morning`, October 16 2026 at 8:35, the tide at .15), dead low, mid tide, the
flood at .8 and a spring high.

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
TZ=America/New_York node tools/webkit.mjs         # WebKit's frame rate, the engine on every iPhone
node tools/rig.mjs heron                          # one animal, close up and at phone size
node tools/storm-corpus.mjs                       # the storm card's winter backtest, fetched again from IEM
node tools/storm-corpus.mjs wssi                  # and WPC's archived Winter Storm Severity Index for it
```

`tools/shots.mjs` renders twenty-eight scenarios (day, night, after midnight, storm, dusk,
both family locations, a fine farm afternoon, a washout, a shoulder-season moderate-UV day with
the water running two feet over the tide table, and two shaped weeks: a cool snap into a warm run
on a Thursday, gusting 30 at five with the boat season switched on, and a stormy Sunday week with
100% odds and a 101° high, which is also the eight-column week), then twenty for the water, the
farm and the weekend: a Saturday at the coast with the boat season switched on, where the weekend
is today and tomorrow and the water is `Easy out there.`; a mid-November Saturday, with the seas
and the water and no sentence; a cold January morning on the coast with the station's thermometer
and the buoy's both down and the sun card stepped aside; the station gone quiet and the buoy's
`76°` said in its place, and the buoy's reading too old to say, with no water temperature at all; a boat day whose marine run carries no seas, which is `Seas
unavailable.` and never green; the water two feet over the table half an hour before a high,
where the skiff rides the curve with `+2 ft` beside it and the high's time steps over both, and a
winter northwester blowing it out a foot and a half under the table at the low, where the tag stays
off the bed; the water two feet over at a low and a foot under at a high, where the tag once sat on
the tide line; the water half a foot under an hour before a low, where the boat sits close to the
bed and the tag goes beside it; a wet weekend of 40% and 100% with three-digit highs, and a farm
weekend of rain then snow, whose notes stay beside their title at 320; the water two feet over at a high and
an hour before one, where the tag keeps below the high's time and the pill at now stays under the title;
half a foot over and two and a half under on the falling tide, where at 320 the tag finds a spot
off both flanks; a cold October morning at the farm, `Cold one. Bundle up for
the morning rounds.` on the `Piddling` card over the moon; a gale through the day and night at the
farm, where every fishing time goes for the wind, the pond is choppy and the note says `new moon ·
too windy`; and a calm farm morning whose four fishing times each have their fish resting in a flat
pond under the phase alone. Then the eight storm cases from `tools/storm-fixtures.mjs` and three made
from Florence's (see The storm card): Florence at the coast, Debby on the beach, the 12 to 18 inch
blizzard at the farm (titled by its headline), RLX's January 2025 warning at the farm (titled by its own
sentence, its lane from noon), Isaias at the farm (the named line), and RLX's January 2026 warning at the
farm (the strip's, the index at Moderate), the coast on October 10 2026 and Erin far out (nothing), each with expects
for the tier, the card's title, note, warnings, what to do and stamps, the named line, the headline,
the strip and Tonight, failing a TCV impacts word on the card or anything cheerful under it. A scenario marked `boat: true` is served with
`boatSeason:null` switched back on, and fails if there is nothing to switch. It writes screenshots
to `tools/shots/` and prints the generated copy (the headline, the chips as they are seen, the
water's note, the level the chart speaks and the tag on the skiff, the moon's phase and the
fishing times it speaks, the sentence card, the sun sentence, tonight, the week's note with the
banded weekend in brackets, the year's title and note, and `xp`, each chart's pill where it starts
and the water an hour on), so wording changes are reviewable as text. A scenario can carry an
`expect`: the week's columns and banded days, the sentence card's title, sentence and colour, the
water's note, the level and its tag, the moon and whether it has fishing times, the moon's note
and spoken label, how rough its pond is drawn (`chop`, 0 to 2), the year, the sun
card, the sun bar's spoken label, how many times the seas were asked for, and its pills (`xp`). The
loading-shell check at the end also holds the sun scale hidden and every slider off while there is no
bar or reading, and the farm's moon and its year's title (and its hover text's airport) in place before any forecast lands. Every scenario
also fails when the moon speaks a fishing time it has no fish for, or draws a fish for one it does
not speak, when a word on the tide, the moon or the year runs off its chart or into another word,
when the skiff's level tag sits on the bed, within 2px of the tide line or on the boat, or when
the water's
pill at now covers the skiff, measured at 390 and 900 and once more at 320, the width where they
meet, where it also fails any section title whose note drops under it. Every scenario also fails
when any line or its fill does not start and end `CHART_IN` inside the content edge within a
pixel, measured on the screen with the chart's clip applied, or a day's sky or name or a month sits
off its point, at 320, 375, 390, 393, 430 and 900 (`even`). The intermediate widths wait for the
staged paint to land at the new width (`await PAINT`) before they measure, or what they measure
is the old width's charts stretched to fit. It exits non-zero when one does not show what it
is there for.

Since October 21 2026 the coast's twenty-seven cases in `tools/scene.mjs` are the house across the pond (see
Porters Neck), and `tools/egrets.mjs` went with the marsh; the marsh-only checks described below are in git
history. `TZ=America/New_York node tools/pond.mjs` shoots the house in every moment.

`tools/scene.mjs` is for anything that moves. Forty-four scenes force the light
and weather that are hard to wait for. Thirteen are the house across the pond: calm noon, a blow
from the west and one from the east, the evening and the morning golden hours, a warm clear night
after the strands are off, a storm, a fog morning, drizzle against a downpour, freezing rain, a
night of rain and thunder nearby. Seven are the ridge: by day, at golden hour, by evening with the
buck out, on a snow day, on a cold January night, in warm rain and in a night downpour. Twenty-four
are Halloween and the morning after it. Fourteen at the house: an October afternoon, golden
evening, fog morning and midday downpour (the busiest daytime frame), dusk with the strands and the
fire just lit and the first bats out, the carving day under the moon a night short of full with the
witch crossing it, the carved week after dark with a westerly and on a cold morning, the moon too
high over the roof for her to cross an hour after midnight (she leaves it alone and passes well
clear of it, never along its rim), Halloween night with the kid at the gate, in a drizzle that
night with the kid still out, in the rain that night with the kid in and the bats and the witch
down, at a raw dusk that evening with the kid already out and the witch not up yet, and half past
midnight on November 1 2026, the night the clocks go back. Ten at the farm: an October afternoon,
at dusk, on an October night before the carving, on Halloween night with the kid at the door, in
the rain that night with the kid in, on a rainy night in the carved week, under the same moon, on
two early October evenings with a westerly and the moon under the witch's band (walked at 900 too),
where a climb through it once started in the barnyard and ran through the owl and past the loft,
and on the morning of November 1. The marsh's cases (the oystercatcher and the crab in the October
downpour, the kid and the cormorant on the dock, the coast's low full moon with a westerly, and the
moon at the height of its sunrise time that she once flew along the rim of) went with it and are
in git history. On both
November ones everything has to be gone, the moon's colour, the bats and the witch too: every
scene fails whose moon is not Halloween's in October or not the ordinary one any other night,
and the moon scenes fail if it is not up. Every October scene has the cobweb up and every other
one has it down (see the cobweb under Holidays). Each one with decorations out writes a
close-up of them, and of the cobweb, at 320 and at phone width, and walks what Josh asked for more
of (the cat, the eyes, the marsh lights, the scarecrow, the ghost and the trick-or-treater) through
its own motion at 320, 390, phone width and 760 (`decorCheck`). The Denver scenes (and the skyline check)
went out with the trip; they are in git history before the commit that parked `den`, if the next trip wants a model.
The ridge night downpour is there on purpose: dark theme, code 82, two rain layers
and a frog, which is where the animation count goes looking for trouble. It found
some, which is the point of having it. The marsh's night rain was there for the same
reason from the other direction: it was the only frame that put the raccoon and
the fiddler crab out at the same time, so it was where two grounded animals could
collide and where either of them could end up floating (parked with the marsh). Per scene it writes the sky
and the scene on their own, counts the animations *still running* grouped by keyframe, reads
`LayoutCount` off CDP while the scene idles, and proves the page holds perfectly
still under `prefers-reduced-motion` by comparing two screenshots taken 1.4s
apart. It exits non-zero on a page error, on layout thrash, on anything that
survives reduced motion, or on a scene at a family place whose wall clock is shifted at all
off the Eastern phone it runs in (the half past midnight scene on November 1 is the one that
used to be).

Two numbers worth knowing before you change motion: every scene idles at **0-3
layouts per 6 seconds** (most at 0 or 1), and the busiest scene runs **108 animations** still
running (115 in all; October 22 2026: the ridge's night downpour). At the house the busiest are its
downpours, the October midday one at 101 and the August one at 98, because the near rain in front of
the house is seventeen to nineteen drops, then the storm at 92. If either number jumps, you have added
something that is not a `transform` or an `opacity`. Halloween's nights are the other busy ones,
legitimately: three animations a bat, three for the witch and three for the spider in the cobweb, and
at the farm one for the cat's tail and one for each pair of eyes in the dark (the farm's ghost adds one
when the gusts reach 5). So the house under the October moon with seven bats and the witch runs 86,
Halloween night there 83, and the farm's October nights 84 to 90 (the harness fails anything over 120).
The parked marsh's figures (117 under a full moon with a westerly, 114 in its October midday downpour)
went with its cases and are in git history.

`tools/webkit.mjs` is the one harness that is not Chrome. Chrome runs SVG animations on its
compositor, so it never paid for the sky's live blur, and every browser on an iPhone is WebKit,
which repaints a moving SVG part on every frame. It drives a WKWebView on the Mac
(`tools/webkit.swift`, built with swiftc into tools/shots/ on first use) at 390 CSS pixels and
3x, off the screen, so it runs with the screen locked, and counts frames in the page: the coast
and the farm on October nights, a rainy coast day and an ordinary afternoon, and Beaufort's October
afternoon (`beaufort-afternoon`: its layers and boxes, Halloween's props and the water's grass line, wind lane and
in-season row on NOAA's real table), its October night (`bft-october-night`) and a hard blow (`bft-blow`), idle for 10 seconds
and opening for 6. On October 9 2026, with the clouds baked, every case held 59 to 60 frames a
second idle and 58 to 60 opening, where the live blur had held them to 10 to 23. Its GPU process
still spends one to two of the Mac's cores at idle repainting the scene's moving parts, and no one
group of them is most of it: that is the next thing to look at. At Beaufort it was the moving sheet itself,
repainted whole for every part in it, and the crowns and the boat are boxes now (see What turns whole is a
box, under Beaufort); the same move would serve the coast's and the farm's moving parts. `--strict` fails a case under 50
frames a second. The zoom that makes 3x assumes a Retina Mac, and the report prints the width
and pixel ratio the page saw.

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

`index.html` is about 1.2 MB of source (October 16 2026, with NOAA's daily normals, the Halloween cast, the storm card's readers, Beaufort's whole cast, its oak lit from behind and its fishing water baked in), and an early plan set
160 KB as a ceiling. That number was about the source file and it is not the
number that matters. GitHub Pages serves the file gzipped, so what a phone
actually downloads is **about 440 KB** (it was about 275 KB before Beaufort, and about 420 KB before its fishing water), once, and the service worker caches it
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
  rain: long and quick is a raindrop, long and slow is a scratch. The near drops are timed
  off the sky layer's 880px / `fallSec` on screen, landing 10% quicker because they are
  nearer. Since the frame came closer in for the phone (`W=appW()/1.22`), a scene unit is
  `appW()/W` screen pixels, about 1.22 from 390 up and 1 only at 320, so the step and the fall
  are worked on screen and turned back into units (`k`). Worked in units, as they were until
  October 2026, the near rain fell 1.35 times the sky layer's speed on every phone but the
  narrowest. This is worth measuring rather than
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
- **White egrets in the live oak were approved October 7, 2026** (the parked marsh's oak since October 21). Up to two small great
  egrets (`rigEgret`, `INK.egret`) rest on the coast's limbs, clear of the heron's lane
  and Ghostface's center fork. Their foot anchors, in the oak's own units, are
  `[-28,-23.5,.32,1]` and `[55,-18.2,.30,-1]` (x, y, scale, direction); the left one
  moved right after it read as if it were perched on the heron. Both sit inside the oak's
  existing `treeAt` and `inkAt` transforms, so toes and branches move together. The birds
  are absent during the morning forage, rest from noon to 4 p.m., return as the sun drops
  toward evening, and stay tucked in the oak overnight (`oakEgretCount`, using local hour
  and solar altitude). One bird may make a short wing-settling flutter at its real shoulder
  during the day, once in a 90-second loop, with a long quiet rest; the second bird and both
  birds after dark tuck their necks. The wing motion is a transform inside the tree's own
  sway and stays still under `PRM`. `oakEgretCount` uses the local date as numeric YYYYMMDD,
  xor `0xE6E7`, with the existing `mulberry`: below .45 is none, below .8 is one, otherwise
  two. Refreshing cannot reshuffle them. Presence needs known sky code 0–3, temperature at
  least 40°, wind no more than 12 mph and gusts no more than 18 mph. Missing readings, wet
  weather, fog, or thunder nearby keep the limbs empty. These are occasional scene residents,
  never a claim that birds have been observed. `tools/egrets.mjs`, which checked their times, branch
  contact, wing motion and clearance from the heron at phone size, went with the marsh and is in git
  history; the walk of the heron's gestures against the egret's wing stretch in `tools/scene.mjs` still
  exists but no case reaches it while the marsh is parked.
- **The marsh's water band is the whole lower frame, so "in the scene" is not the
  same as "on the ground."** The ridge has a pond you can test a position against;
  the marsh does not, and the pond check in `tools/scene.mjs` exempts it for exactly
  that reason. That exemption is how the raccoon came to be drawn sixteen units out
  in the channel with its belly on the water and nothing under its feet. A heron
  standing there reads as wading; a four-footed animal standing there reads as
  floating. Waders and the fiddler crab work the flat. Anything else keeps its body
  above the bank line and wets no more than its feet, and the harness fails a
  marsh scene where more than 45% of a land animal sits below the waterline. Josh
  later asked for the raccoon fully on land: it now has a low, solid bank rise and
  ground shadow, and even its reaching paw stays above the water. The harness walks
  its whole gesture and checks its feet, not just the old 45% allowance. No water
  ring belongs under this animal.
- **If an animal moves in water, the water answers that contact.** The heron's two
  footfalls make small rings on its existing 150-second clock; the bill's existing
  splash meets the bill at the strike. There is no independent idle ring standing
  in for either. The crab's four near legs turn at their roots in alternating pairs
  during its short scuttles; the four farther legs support it. All eight stay drawn,
  and its faint ripple follows those same 58-second bursts. Eight moving joints
  pushed the downpour past the 120-animation limit; that limit stays. The frog's
  small pond-edge ring shares its 13-second calling motion. These clocks take their
  phase from wall time, so a repaint does not restart a gesture or detach its water.
  `tools/scene.mjs` walks the contacts and the rests, checks the actual positions,
  and preserves the quiet gaps. The oystercatcher already stands on its oyster rake
  and the cormorant on its piling; neither needs a swimming effect.
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
  below 45F, fiddler crabs below 48F and in a downpour (65, 82: down the burrow with
  the door shut, which also keeps the busiest frame under the animation ceiling), and the cormorant and the cardinal exist
  because something still has to be out there when they do.
- The farm's "fish bite" windows are solunar tables: almanac folklore built on
  real moon transits from the app's own astronomy. That framing is deliberate.
  Do not upgrade them into a forecast, and do not replace them with an API; the
  honesty is that the moon times are real and the theory is the almanac's. The
  pond's fish and its rise rings during a window read the same approved times as the chart's resting
  fish, and
  the windows disappear under anything that says stay in (a warning, a storm overhead, ice,
  a gale, thunder within the hour, freezing rain falling), and one by one on their own hours
  otherwise, so they never read as an
  invitation to stand in a thunderstorm with a rod. The footer used to carry that
  framing. Now the moon chart's title carries it, `Almanac fishing times` (Josh chose it over
  "fish bite · by the moon" so the theory is plainly the almanac's), with the full sentence in its
  title and for screen readers.

## The storm card

Josh asked on October 10 2026 for "a hurricane or major weather card that only comes up when
necessary. high threshold to appear, but replaced the dinky one I see sometimes in wilmington". The
dinky one was the Tropics · Atlantic rows: any Atlantic system at any distance, and `Advisory Number
(\w+)` with one space never read a full advisory (NHC pads the number, `Number  16`), so a storm
showed only in the hours after an intermediate. He was shown three designs drawn on the same model
and picked the storm timeline, the chart language's own. He chose to keep the bar high: a day like
October 10 2026 at Wilmington, a Flood Watch credited to "tropical moisture" and a Coastal Flood
Advisory with Isaias 329 miles off, shows nothing about the storm.

- **The data.** Alerts keep their VTEC, NWSheadline, onset, AWIPS id and damage tags (`alertRow`), and
  an alert whose every VTEC line is CAN, EXP or UPG is dropped at the fetch (`alertLive`), because the
  feed keeps an upgraded watch beside its warning for a day. The coast also reads its beach zone,
  `LOCS.mb.beach` (NCZ108, Coastal New Hanover), for TR, HU and SS products only: Debby's and PTC
  Eight's tropical storm warnings were on the beach and not at the house, and the beach's surf, rip
  current and flooding products stay off Moss Bridge Ct's strip. Both places read the advisories
  (`fetchStorms`: the TCP for the name, the ATCF id and the mph, the TCM for the knots and the forecast
  points), a special advisory as well as a full one or an intermediate (`... Special Advisory Number`,
  `SPECIAL FORECAST/ADVISORY`): NHC writes one for a storm strengthening near landfall, and dropped, the
  card fell back on the advisory before it. Away from the coast the lane also asks the Weather Prediction
  Center's Winter Storm Severity Index at the point (`wssiUrl`: mapservices.weather.noaa.gov's wpc_wssi
  MapServer, its three days in one identify request, layers 1 to 3, Overall_Impact_Day_1, _2 and _3, the
  fields by name), only once the point's own alerts are in and a Winter Storm Warning stands among them,
  because every other day it answers with no results. It is F3's bar (see The winter warnings), kept with
  the forecast the way the beach's answer is (`wssiIn`, the reading's `wssi`), and a failed or empty answer
  is no reading. With no point list (its request failed) there is no answer at all (`undefined`), and the
  last reading is kept: a failed request threw away a cached Major. A reading keeps when it was asked for
  (`at`, the model's `seen.wssi`) and the Winter Storm Warnings it was asked for, each event with its hours
  (`for`, `wsFor`: `KRLX.WS.W.2 2025-01-05T17:00:00.000Z 2025-01-07T11:00:00.000Z`), because it is only ever
  the judge of that list's warnings (see The latch).
- **Its own lane, and the first frame.** The advisories and the beach zone (`stormLane`) start with the
  forecast and run beside it, so the forecast never waits on them. When the lane is in by the time the
  forecast lands it joins that paint and its cache, and the card is painted with the header, before the
  hours under it are drawn: painted in the last stage it pushed them down after their pen had started. A
  first open (the loading shell, nothing else on screen) waits for it up to `STORM_WAIT`, 3 seconds,
  because a card that lands after the hours pushes them, but only when the card could come up
  (`stormWaits`): every rule needs an alert at the place, so the farm waits only when the point has a
  live one, and the coast looks at the beach zone's answer first (`lane.beach`) and waits for the
  advisories only when the point or the beach has one. A slow api.weather.gov used to hold the first
  paint of a quiet hurricane-season morning for 3 seconds that could change nothing. The beach's answer
  is kept on its own the moment it is in (`beachIn`) and is every paint's, the first one too: a first open
  with the advisories 3.7 seconds slow painted without the beach's warning it already had, then pushed
  the hours down. And a cached beach whose tropical warning has reached its expiry is stale, not over
  (the expiry is only the next advisory's time, and the warning is nearly always renewed by then): the
  refresh at that expiry waits for the beach's own answer, up to `STORM_WAIT`, because painted on the
  cache the card came down and the headline went back to "Raining now." at every advisory, and both came
  back when the advisories landed. "The cache" there is the last reading this place had: `readCache` when
  it can vouch for it, and when it cannot (past its six hours, or a new day) the page's own reading, `LAST`,
  which says whose it is (`LAST.loc`). Debby's beach warning ran out at 7 pm, 7h20m after the 11:40
  refresh, so the strip's timer always found the cache aged out, skipped the wait, and painted without the
  page's storms or its beach. Each list also keeps when it was fetched (the reading's `seen`; a cache written
  before it was kept has only its own age), and a tropical watch or warning past its expiry, in a list
  fetched while it still stood, still stands until a newer answer for that list decides, up to six hours past
  its own expiry (`stormRead`'s `seen`, `STORM_STALE`): a cold open or a place switch on a two-hour-old cache
  painted Debby's renewed warning as ended, said "Raining now. Keep the rain gear close." under a tropical
  storm, and the card then landed on the hours' running pen 371px down. So does a beach that has not answered
  by the live paint, one slower than `STORM_WAIT` and one that fails. The window was measured from the fetch
  until October 11 2026, so at Debby's 7 pm expiry, 7h20m after the 11:40 fetch, a beach 4.5 seconds slow
  or failing still took the card down. One later still
  (`stormRun`) goes into the reading and its cache, which keeps its age, and paints the page again only
  when it changes what the page says. It comes in with the view held (`keepView`), the way a browser
  anchors its scroll (WebKit does not), on what the card pushes: the first thing at or after
  `#stormSection` whose top is on the screen or under it, the card itself only while its own top is on
  the screen, and with nothing's top on the screen the one the screen starts in. Scrolled at all,
  nothing on screen under the card moves, even with part of the sky still showing above it (anchored on
  the header, a reader with its foot 150px down the screen watched the hours jump by the card), and even
  from inside the card: anchored on its own top, off the screen, a card that grew when the advisories
  landed ("Hurricane Warning" becoming "Hurricane Florence" with its note and its closest point) moved the
  hours under the reader 22px at 320. The card does not come alone, so the hold runs across what comes with it:
  from before the header's words (the headline turns to the storm's, 24px taller at 390) through the
  card (`viewHold`), and across the strip, which the storm statement leaves. At the top the sky stays
  put and only what is under the card moves. The storm is cached with the forecast, so the next open
  shows the card on its cached paint. `tools/interactions.mjs` opens Debby cold with the beach zone in
  time, late and scrolled to the week, late and scrolled partway (the header's foot 150px down the
  screen), and late at the top, then reopens it offline; opens it with the beach fast and the
  advisories 3.7 seconds slow (the card is in the first frame); leaves it open across the beach warning's
  expiry and renewal with the advisories slower than the forecast, watching every frame (the card never
  comes down); does the same at Debby's own timings, 7h21m on with the cache aged out, the beach fast and
  1.5 and 4.5 seconds slow and failing, and the advisories 2.5 (the card, its title and the headline never
  change); opens it cold
  on a two-hour-old cache whose beach warning passed its expiry an hour before, with the cache's own fetch
  times and without them (the card is in the cached frame, and the hours never move once their pen has
  started); and opens Florence with the advisories late, scrolled so the card's top is 100px above
  the screen, at 320 and 390 (the hours hold while the card grows).
- **The model** is `stormRead(L, alerts, beach, storms, now)`, pure and tested. Two tiers and nothing on
  an ordinary day. Storm: at the coast a hurricane warning or watch, tropical storm warning, storm surge
  warning or watch (house or beach) or extreme wind warning (C1), a flash flood or tornado emergency
  (C2), a winter storm, blizzard, ice storm or high wind warning (C3), a flash flood, tornado or coastal
  flood warning with a linked storm (C4); at the farm an emergency (F1), a blizzard, ice storm or high
  wind warning (F2), a winter storm warning with WPC's Winter Storm Severity Index at Major or Extreme at
  the point on a day the warning is in effect (F3, see The winter warnings), a flash flood, flood, high wind,
  tornado or severe thunderstorm
  warning with a linked storm (F4). Once a warning has raised the card it holds it while that same warning
  stands (see The latch). Named:
  a tropical storm watch alone (N1), a storm named in an alert at the place (N2, word-bounded beside a
  storm word or "remnants"), or one whose center or TCM point comes within 300 miles of the coast or 250
  of the farm while any alert is up (N3). Linked means an advisory in the last 12 hours, tied to the
  place by VTEC event number (1000 plus the storm number), by name, or by N3's distance. Distance alone,
  CAP severity and a lone warning never raise it. The category is the TCM's knots (64, 83, 96, 113,
  137), never the rounded mph, but only while the TCM is the public advisory's own (57 for 57 or 57A)
  and its knots say the public advisory's mph (converted, so 96 knots and 110 mph agree): an
  intermediate 57A at 115 mph is a Category 3 that TCM 57's 90 knots called a 2, under a stamp naming
  57A. Otherwise it is the TCP's own mph on NHC's mph steps (74, 96, 111, 130, 157). A TR, HU or SS
  product has no end (its expiry is only the next advisory), and nothing prints one for them. Hazards
  come from the TCV segment in the house's own alert, then the beach's, then the house's WHAT and WHEN
  lines, worst first. The TCV keeps its PLAN, PREPARE and ACT, and its potential and realized impacts
  apart (`tcvRead`): Florence's house zone said REALIZED IMPACTS: Being Assessed for its surge a day
  before landfall, and a design that printed it read as a surge nobody knew. The impacts words
  (Unfolding, Devastating to Catastrophic, Limited) only rank the hazards and are never printed. A
  hazard the house has keeps the beach's number beside it when the beach's is worse (`peakSize`):
  Florence's surge was 2 to 4 feet at the house and 6 to 9 on the beach, and the family is on the water.
  The HLS is read for its headline, STORM INFORMATION, current watches and final flag, and leaves the
  strip while there is a tier (`stormStrip`).
- **The card** is `#stormSection`, the first thing under the sky, above the hours, in the page's one
  shape. The title is the storm as the advisory names it (`Hurricane Florence`; a post-tropical cyclone
  or its remnants are `Remnants of Isaias`, because "post-tropical" means nothing to the family), and
  the note is its strength and where it is now (`Category 2 · 145 mi ESE`), saying less on a 320 phone
  rather than drop under the title. A storm with no name leads with its biggest number, title-sized in
  the display face (`stormHero`). A winter warning's is the warning's own sentence that carries the
  amounts, quoted verbatim from that alert's description (`stormQuote`): the sentence of its WHAT line that
  says "accumulation", else that line's first sentence, else its NWSheadline, in sentence case through
  `stCalm`, its relative words dated the way the instruction's are (`relDay`: "this evening" read the next
  morning is the evening it meant) (`Total snow accumulations between 4 and 10 inches and ice accumulations
  between one tenth and one half of an inch.`). It is never cut and never rebuilt into numbers: as large as
  it fits on two lines, on three if it must, and never smaller than 18px (17 on a phone under 360), each
  hyphenated range held with its unit (`stormTitleFit`, measured). A sentence that will not fit three lines
  at that size gives way to a shorter sentence the warning itself gives, its WHAT line's first when that is
  60 characters or fewer (`stormQuoteShort`: `Heavy mixed precipitation.`), else to the warning's name (`Winter
  storm`), and the whole sentence is then said under the chart in the card's own type (`#stormFull`), once:
  RLX's 153-character sentence of February 2021 ran to five lines at 16px on a 320 phone and pushed the hours
  off the first screen. January 2025's 113 characters are three lines at 18px at 390, and at 320 the title is
  `Heavy mixed precipitation expected.` with the sentence under the chart. The fit runs again when the fonts
  land (the fonts.ready hook and `loadingdone`, the way `moonNoteFit` does), because fitted in the fallback
  face Bricolage reflowed it to a line more. RLX's products before 2019 have no WHAT line, so the 2016
  warning's title is its headline (`Winter storm warning remains in effect until 1 AM EST Sunday`), which
  says what the headline under the sky says; every product the Weather Service writes now has one. With no
  sentence at all the title is the warning in plain words (`Winter storm`). A rain amount is said when it is
  short enough to read at a glance; otherwise the title is the warning in plain words. It has no note, because the headline says until when and the chart
  shows it. The picture is the next two days
  (longer to show a window close, never past three) on the hourly chart's axis, from NOW, with its night
  bands and their moons: one lane per hazard the Weather Service has put hours on, worst first, each
  labelled with its name and its peak in the fewest of the product's own words (`WIND gusts to 105 mph`,
  `RAIN more than two feet`, `SURGE 2–4 ft above ground`), a range with both ends and its words (`1 to 2
  ft`, `up to 2 ft`; it was the top alone), and the beach's worse number beside it in the
  quieter ink (`· at the beach 6–9 ft`). A number only the beach has is said as the beach's the same way
  (`SURGE at the beach 1–3 ft above ground`, and on its pill `storm surge at the beach`): every one of
  Debby's was the beach zone's and read as the house's. The title, the headline and the named line say
  it too (`4–8 inches of rain at the beach`, `Tropical Storm Warning at the beach.`, `gusts to 45 at the
  beach`). Where a row is short every lane says less the same way (`2–4 ft · beach 6–9 ft`, `beach 1–3
  ft`), so one card never says it two ways. A TCV window is drawn as its words (`stormPhrase`: Friday
  afternoon is noon to six, early this evening six to nine), read against the product's own issue time.
  Its ends are clean: an edge given as a part of a day is that stretch in a paler band, ended square, an
  edge given to the minute (a watch's end) is the bar's end, and only a window with no end yet fades,
  off the right edge: the first drawing faded every edge, and it read as a blur. The hurricane-force
  window swells and darkens the wind's lane and says so under itself (`hurricane force`), and the
  surge's lane carries the tide table's high tides as dots, named under the first (`high tides`): no
  mark needs the slider to explain it. A winter warning is one lane, named by what its WHAT words say it
  is for (`winterKinds`: `SNOW`, `ICE`, `SNOW AND ICE`, an ice storm's `ICE AND SNOW`, a blizzard's `SNOW
  AND WIND`; before 2019 its hazard bullets and keys), never how much, on the warning's own hours. A hazard
  with no hours in its statement takes the hours of the product it was read from. One from a TCV takes a
  flood or flash flood watch's (Florence's rain is the Flash Flood Watch's hours) or none, never a warning's
  or an advisory's: a routine Flash Flood Warning to 5:30 made Florence's two feet of rain end that evening,
  a 3-hour Flood Advisory ended them at 2:30 and an areal Flood Warning at 5:30, a river's Flood Warning,
  whose end is the crest and not the rain, ran the bar a week off the chart, and a 35-minute Tornado
  Warning drew a red sliver at NOW on a row that still read "a few possible". With no watch the rain is the
  quiet row. A lane from a product's hours starts at the product's start, its VTEC begin or else its onset,
  never when it was sent: RLX's January 2026 warning, issued the evening before its 7 am start, drew its ice
  from NOW, nine hours early, and Florence's Flash Flood Watch issued ahead of its 8 pm start read on the
  NOW pill. A warning issued ahead of its start is said with its start on the chart's spoken label (`from`,
  `fromSaid`: `Snow and ice: Winter Storm Warning from noon until Tuesday at 6 am`, Florence's watch `from 8
  pm`), because the label read it as on now, and at NOW, when nothing is under way yet, the pill and the
  slider say it the way the headline does (`now · Winter Storm Warning from 12p`, `Now, Winter Storm Warning
  from noon`): until October 11 2026 NOW read `Now, no hours from the Weather Service`, which sounds like
  nothing was given. Any other hour no window covers is still a dash. A short-fuse warning is the strip's, unless the hazard is
  that warning's own (an emergency); one with no hours anywhere is said on a quieter last row with no bar,
  because a bar would be hours nobody gave. The
  storm's closest forecast point is the marked moment: the hurricane symbol (filled for a hurricane,
  open for a tropical storm) with its distance, and a dashed line through the lanes that steps round
  their words. Under the labels, the card's own words: the warnings it stands on (`stormWarns`:
  `Hurricane Warning · Storm Surge Warning`, `Tropical Storm Warning at the beach`), because the strip
  can lead with only one and Florence's Hurricane Warning sat in its "+2 more"; then what to do
  (`stormSay`); then each source with its own time (`stormStamps`: `Weather Service 10:55 am · advisory
  57 10:44 am`), never one stamp that put the Flood Watch's 11:35 beside an advisory written fifty
  minutes before it. Each line that joins its parts with a dot (the warnings, the sources, the named
  storm's line) keeps every part whole with its dot in front of it (`stormDots`), so a 320 phone breaks
  between the parts and never ends a line on a lone dot: the sources read "Weather Service 10:55 am ·" /
  "advisory 57 10:44 am" at 320 and 330. It has the explorer every chart has (`readStorm`): each stop says what is on, with
  the day named once it is not today, and the stretch where an edge is only a part of a day, never an
  invented hour. It adds no motion and has no entrance.
- **What to do** is the TCV's own ACT line for the worst hazard (Florence: "Now is the time to shelter
  from life-threatening wind."), else the instruction of the first warning that has one, never a watch's
  (under Florence it was the Flash Flood Watch's paragraph on what a watch means) and never a short-fuse
  warning's, which the strip carries. A link, "Additional information can be found ..." and a sentence
  on what a warning means are left out (`SAY_JUNK`, sentence by sentence through `sayKeep`), on the card
  and in the strip's "What to do" alike, which goes when nothing is left: the farm's Wind Advisory on
  October 10 2026 gave only RLX's link line. It is quoted as written, an old product in capitals set in
  sentence case (`stCalm`), and a messy one (capitals, or a list run together with "...") is cut to its
  first instruction: RLX's January 2016 warning opened "CONDITIONS ARE EXPECT EARLY THIRD OR OCCURRING",
  its own typo, which on the card read as the app's. So the blizzard's is `Only travel in an emergency.`
- **Said once.** Under the card nothing else says the storm again, and nothing cheerful sits under it.
  The headline is the storm's, from the model alone (`stormStory`): the storm and when it is closest
  (`Hurricane Florence is closest Friday morning.`, the storm's name in the headline's warm ink), or a
  storm with no name's warning in plain words and when it ends (`Winter storm until 1 a.m. Sunday.`), and
  when it starts if that is still to come, its VTEC begin or onset (`Winter storm from noon until 6 a.m.
  Tuesday.`: issued at 5:24 for noon, it read as on now at 5:40 under a bar that started at noon), a start on
  another day named and a midnight the day it ends (`stormWhen`). A day is said once in it (`from 1 a.m.
  until noon Monday`, `from 7 a.m. until 6 p.m. Monday`), and the small hours are the night before's, so
  read on Sunday a 1 am Monday start is tonight's `1 a.m.`, never `1 a.m. Monday until noon Monday`. It ends
  on one period, built through `sentence`, because a clock ending in "a.m." or "p.m." carries its own: from
  midnight on a warning's last day it read `Winter storm until 6 a.m..`. With the app left open in front,
  the strip's timer also asks again a second after a live product's VTEC begin (`alertTimer`), so at noon
  the headline turns from `from noon` to under way and NOW to the warning, with nothing touched.
  Josh's headline rules hold: the small hours are the night before's, today is "this morning" and
  "tonight", and any other day is named, which in a storm is plainer than "tomorrow" said after
  midnight. The forecast's own sentence went because it sat over a hurricane saying "Raining now. Keep
  the rain gear close.", and every hazard it could name is on the card. A thunderstorm overhead (a fresh
  current code 95, 96 or 99) still leads it (`Storms overhead. Head inside. Hurricane Florence is
  closest Friday morning.`, `stormsOverhead`, shared with `dayStory`), because the cards under it leave
  a storm overhead to the headline and the one thing to do now was said nowhere; `told` stays the
  storm's. What the card says is handed down as `told`, with no hour, which the cards read as said for
  every hour: Tonight leaves out the card's rain, snow and freezing rain, is never "a warm night" and
  never green ("Rain likely tonight, with a low of 71°." became `Down to 71° tonight.`), thunder still
  said because the card does not carry it, and missing night odds still `Rain odds unavailable.` unless
  the card has said the rain (a High Wind Warning has not). The storm's lead warning stands for a
  warning for the sentence cards, so the farm says only the family's action (`Feed early and keep a path
  open.` for the blizzard, in red, and no fishing times) and the boat `Stay off the water.`. The Sun
  card's sentence is never green under it.
- **The strip** leads with the strongest tropical warning while the card is up (`card`), and when the
  card speaks for the lead (`stormCover`: the tropical alerts, the one its instruction is from, a storm
  with no name's own warning) its body says only what else is active. Debby's Flood Watch at the house
  was none of those and kept its words. A short-fuse warning issued during the storm (`SHORT_FUSE`:
  tornado, flash flood, extreme wind, severe thunderstorm) leads the strip on its own, enters, and keeps
  its own words and instruction: it is minutes away, and it is never folded into the card. Each ` · `
  rides with the word after it (a hard space after the dot, and the clock's own between it, its am or pm
  and its day, and none else), so a strip that wraps starts its next line `· until 1:00 am Sun` or breaks
  after "until", and never ends a line on a lone dot or a day on its own: tying the whole clause
  together put today's coast strip on three lines at 320 where it had wrapped once. A midnight is `midnight`, on the day it
  ends (`until midnight` read on Saturday for 00:00 Sunday, never `until 12:00 am Sun`). The card comes
  down when what it stands on ends with the app left open: the house's alerts, the storm statement and
  the beach's tropical ones (`stormDue`) arm the strip's timer (`alertTimer`) beside the strip's own,
  because Debby's warning was the beach's alone and the house's only timed alert ran two days longer. A
  tropical one still standing past its expiry is due six hours on, so a beach that never answers again
  cannot hold the card.
- **The named tier** is one quiet line, `#stormLine`, where the tropics list was, in plain words with
  the miles from the hurricane center's or WPC's track and the gusts from the Weather Service's own
  alert (`stormLineHtml`): `Isaias's remnants pass 33 mi north Sunday evening · gusts to 50`. Its wind
  is the line's, so the Piddling card under it says only what to do (`Chores can wait.`) and not "Too
  windy until about 5 p.m." as well. With no tier there is nothing.
- **Relative words.** A product's "this evening", "tonight" and "late this morning" are its own day's.
  Read the same day before then they are said as written, because today goes unsaid; on a later day, or
  once the stretch they name is over, they take their day (`relDay`: "late this morning" read at 9:30 at
  night is "late Thursday morning"). The card's pills, its instruction and the strip's words all read
  through it.
- **Seeing it.** `tools/storm-fixtures.mjs` serves nine real cases through `stage()`'s `o.storm`:
  Florence at the coast (storm), Isaias at the farm on October 10 2026 (named), the coast the same day
  (none), RLX's 12 to 18 inch warning of January 2016 re-dated to 2027 (storm, on a WSSI Major that is made
  up, because WPC's archive starts in November 2020), Erin about 900 miles out (none), Debby on the beach
  (storm), RLX's January 23 2026 warning at the farm from the winter corpus (none: `ice-farm`, the index at
  Moderate there in WPC's archive, so the strip's alone), RLX's January 5 2025 warning, issued at 5:24
  for noon, with the index at Major on its second day (storm, `snow-ice-farm`, titled in its own sentence,
  its lane from noon, NOW the warning `from 12p` and the headline `from noon`), and RLX's February 17 2021 update, the
  corpus's longest sentence at 153 characters, with a Major that is made up because WPC's archive does not
  keep that cycle (storm, `long-quote-farm`, titled `Heavy mixed precipitation.` with the sentence under the
  chart). The products are IEM's archived text, verbatim, cut to the place's segments, put
  together as the API puts its alerts together, each alert's onset its VTEC begin; October 10's are the
  live API's own JSON. A scenario's `wssi` is the index's answer in the identify request's own shape
  (`wssiAnswer`), each day at the level WPC's archive gives the farm's grid cell for that cycle;
  `tools/storm-fixtures/wssi/` keeps real answers from the live service, the farm's on October 11 2026
  (no results) and a Montana point under a Major area on Day 1 that night (Winter Weather Area, Minor,
  Moderate and Major: the areas nest), and the same two from layer 4, the 72-hour layer the page asked until
  that day, which `wssiRead` no longer reads. `tools/shots.mjs` renders all nine with expects for the tier, the title, the line, the
  headline, the strip and Tonight, and three more on Florence: a routine Flash Flood Warning and a
  Tornado Warning issued under it (`FUSE`, in the API's shape), which lead the strip and leave the
  rain's hours and the tornadoes' row alone, and a thunderstorm overhead, which leads the headline. It
  fails a TCV impacts word on the card, anything cheerful under it, or a strip, a warnings line, a sources
  line or a named line that wraps on a lone dot at any width, and today's coast strip past two lines at 320,
  and a quoted title past three lines or under 18px (17 at 320), one that is not the warning's own sentence,
  its shorter one or its name, or a fallen-back title without the whole sentence under the chart
  (`stormTitleRule`), with the title at 320 held for the two long ones (`stormTitle320`).
  `?storm=debug` shows the model as plain text in `#stormDebug`, and `STORM_NOW` holds it. `stormRead`,
  `stormLanes`, `readStorm`, `stormStory`, `stormLineHtml`, `stormWarns`, `stormSay`, `stormStamps`,
  `stormCover`, `stormHero`, `stormPeak`, `stormWaits`, `stormDue`, `relDay`, `alertStrip`, `stormQuote`,
  `stormQuoteShort`, `winterKinds`, `wssiRead`, `wssiOver`, `wssiMajor` and `wsWindow` are pure and test.mjs
  runs them.
- **The winter warnings.** A wrong number on a storm card is worse than no card, and a winter warning's
  words could not be read safely for one. Three rounds (October 10 2026) wrote an amount grammar for the
  Weather Service's own phrasing, and each round's verifiers found another office's that it misread, across
  twelve winters of RLX's and ILM's warnings and their neighbours': "a few hundredths of an inch" as an inch
  of ice ("An inch of ice" on the card, firing F3), "below 3,000 feet" leaving "000 feet of snow", RLX's old
  "PIEDMONT...18 TO 24 INCHES" read as 0.18, "up to an inch of snow" taking the ice before it, "one to a
  quarter inch" as an inverted range, "snow and sleet" said as snow, and F3 coming and going within one
  warning as its updates said "additional 3 to 6 inches". So nothing in a winter warning is read as a
  number. Its title quotes it (`stormQuote`), its lane says what it is for (`winterKinds`), and the farm's
  bar is someone else's judgement of the impact: the Weather Prediction Center's Winter Storm Severity Index
  at the farm's own point, Major or Extreme on a day the warning is in effect (`wssiRead`, `wssiOver`,
  `wssiMajor`). The service gives each of its three days on its own layer, 24 hours each from the cycle's
  hour, and answers with the impact areas the point lies in, which nest (`WINTER WEATHER AREA`, `MINOR`,
  `MODERATE`, `MAJOR`, `EXTREME`, the service's own words), so a day's reading is the highest of them. A day
  counts only where it overlaps what is left of the warning's own hours, its VTEC begin (or onset), or now
  once it has begun, to its VTEC end (or ends) (`wsWindow`): until October 11 2026 the bar was the 72-hour
  layer's maximum, and a bigger storm on Day 3 raised and held tonight's small warning. A day that is over,
  a day with no times, no results (every answer outside winter), a failed request and a shape it does not
  know (the 72-hour layer's among them) are no reading: then the card stays down and the warning is the
  strip's. F2 (a blizzard, ice storm or high wind
  warning) and the coast's C3 (any winter storm, blizzard, ice storm or high wind warning) are read from
  the product alone, as before.
- **The latch.** Once a warning has raised the card it holds it while that same warning stands: its office,
  product and number (`stormEvents`, `KRLX.WS.W.2`), through NEW, CON, EXT, EXA, EXB and COR, until it is
  cancelled, runs out or is upgraded (an upgrade to a blizzard is the blizzard's own card). Another warning,
  a watch with the warning's number and another office's never hold it. The index steps down a level
  between updates of one warning, and RLX's January 2016 warning took the card down at the height of the
  snow. The model hands out what is holding the card (`held`, `{"KRLX.WS.W.2": {"rule": "F3", "end":
  "2025-01-07T11:00:00Z"}}`, the event's VTEC end; a bare `"F3"` from an older cache is read as one with no
  end) and takes it back in the next read: the page keeps it in memory (`STORM_HELD`) and with the reading,
  so its cache keeps it too. A held event applies only while that same event is live in the alert list, so
  nothing is ever raised from the latch alone. A read with no point list (its request failed, `alerts`
  null) knows nothing of the house's warnings: what is held is handed on as it was, and only its own end
  takes it off, and `render()` and `stormRun` write the latch only from a paint with a fresh point list. A
  list that no longer carries the event live lets it go (cancelled, run out or upgraded, which the fetch
  drops, or gone).
  VTEC event numbers restart every January, so with a list a held entry is the live event's only while it is
  this season's: one whose stored end is more than 30 days before now is last winter's, and is ignored and
  dropped (no warning runs that long, and every paint with the event live writes its end again), and one
  ended in another year than the live event's end is a number used again when the live product is a NEW (an
  update, CON, EXT and the rest, carries the same warning across the New Year). A latch left in the farm's
  entry from January 2025's KRLX.WS.W.0002 raised the next winter's WS.W.0002 at Moderate, with no index.
- **Only the list's own reading raises F3.** A reading of WPC's index is the judge only of the list it was
  asked for: it raises a warning (and adds a held key) only when it was asked once this list was in (its
  `at`, `seen.wssi`, at or after `seen.point`, when the house's list came in) or was asked for that same
  warning with those same hours (its `for`). A reading asked for an earlier list is carried until the
  lane's own answer lands and only keeps a warning already held, and `stormRun` raises the card when the
  lane's own answer lands, with the view held. Until October 11 2026 an in-app refresh (which never waits
  for the lane) painted a warning just extended into Day 3 on the last refresh's Day-3 Major, raised the card
  and latched it, and the new cycle's Moderate never took it down; a cold open the next morning with the
  lane slower than `STORM_WAIT` did the same for a new warning on yesterday's Day-2 Major. With no `seen`
  (a caller handing a reading over with its own list, as the tests and the backtest do) the reading is
  that list's.
- **A failed point request keeps the card.** When the house's alerts request fails, the paint is on the
  last good list this place had (the cache's, or the page's own `LAST`), less what has ended by now, and
  every paint reads it against now as it reads any list (`activeAlerts`, `stormLive`), so an alert whose end
  passes during the outage still comes down. It keeps the time it was fetched and is marked as carried, not
  freshly seen (`seen.carried`): a carried list never writes the latch (`render()`, `stormRun`), never
  raises F3 anew, and the model hands the latch on as it was. Until October 11 2026 one timed-out request
  under storm load took the card, the strip and the storm's headline down for that paint (the headline went
  back to the forecast's "Cold today. Freezing rain likely around 6 a.m. Bundle up." under a live Winter
  Storm Warning), and the cache was written with no alerts, so a reopen inside six hours showed no card
  either. The plain strip stays up through it too, where main blanked it. Until October 11 2026 a single timed-out request (api.weather.gov under storm load) wrote the
  latch as empty, and the next update at Moderate took the card down. And the latch and the last index are
  read out of this place's cache entry whatever its age (`readLatch`), apart from `readCache`'s six hours and
  its day: a card raised at 5:30 pm was gone on a cold open at 7 the next morning under the same warning.
  test.mjs runs both through the page's own `refresh()` (Major, a failed fetch, then the same warning CON at
  Moderate; then a cold open the next morning on a day-old entry), and `tools/interactions.mjs` on the page.
  test.mjs also runs the page's own `refresh()` and `stormRun` together on a moving clock (`pageRig`): a
  Day-3 Major, then the warning extended into Day 3 with a fresh all-Moderate cycle, on an in-app refresh
  (the cycle 0 and 1.5 seconds behind) and on a cold open with the lane slower than `STORM_WAIT`, inside six
  hours and the next day; yesterday's Day-2 Major beside a new WS.W.3 with today's Moderate behind it; and
  the farm and the coast through a failed point request, an advisory ending during it, a reopen while it
  still fails and the warning's own end. `tools/interactions.mjs` watches every frame of the extended
  warning's refresh with the index 1.5 seconds behind and of the next morning's cold open with a new warning
  and the index 4 seconds behind (no frame has the card), and the farm at 320 and the coast at 390 through a
  failed request with an advisory that ends 14 seconds in (the card, the strip and the headline never change,
  and the advisory comes down at its end with the point still failing).
  A held emergency holds the card, but is never still said to be an emergency (`emergency` is from the
  alerts as they are now).
- **The backtest.** `tools/storm-corpus.mjs` keeps every winter storm, blizzard and ice storm warning RLX
  wrote for Raleigh County (WVZ516, WVZ035 before the split) and ILM for Inland New Hanover (NCZ107) from
  January 2014 to October 10 2026, from Iowa State's AFOS archive, cut to the place's segment, live actions
  only (NEW, CON, EXT, EXA, EXB, COR), 284 at the farm and 44 at the coast, one file a winter in
  `tools/storm-fixtures/corpus/` (IEM has no ISW or BZW for either office: those warnings are in the WSW).
  `node tools/storm-corpus.mjs wssi` adds `corpus/wssi.json`, the index at each place for each segment since
  November 2020, from WPC's own archive of its grids (ftp-wpc.ncep.noaa.gov/WSSI_Archive/David_Archive/: the
  WSSI_Maximum_Overall GeoTIFF of the cycle out when the segment was issued, and its three days, the
  WSSI_Overall fhr24, fhr48 and fhr72 GeoTIFFs, read at the place's own grid cell, LZW and Lambert conformal
  by hand, with no library). 104 of those 176 segments fall in a cycle the archive does not keep, and read
  no index. test.mjs runs stormRead on every segment as it was issued, in order, each cycle's days on their
  own windows, the latch handed on: every quote is the segment's own words, never absurd and never cut at a
  number, F3 never fires from the words alone, and with the archived index the farm's card comes up for one
  storm in six winters, RLX's January 5 to 7 2025 warning, Major at the farm on Day 2 of the cycle out at
  10:24 UTC on the 5th (Moderate on Day 1), and held through its last update. Its January 23 to 26 2026 warning was Moderate there through every update,
  which is why `ice-farm` stays down. At the coast every winter warning is the card, and the index was
  Major there for one of them, January 30 2026. RLX's January 2016 sequence, given a Major at its first
  update, keeps the card up through all of them. `PORCH_CORPUS=1 node --test test.mjs` prints every farm
  firing with its title.

## The moon over the farm

The farm's wave, in the place the coast has its tide (Josh, September 27 2026: the farm "feels off,
like it's missing something"). At the coast the moon moves the water; at the farm the almanac says it
moves the fish, and its fishing times are the moon's own hours. `#moonSection`, `Almanac fishing
times`, draws the moon's height over the same day and a half as the tide chart, on one honest linear
scale with the pond's surface where zero falls: solid and washed in the sky while the moon is up,
dotted under the water while it is down. The windows that are clear on their own hours
(`fishWindows`) are quiet water bands, a major darker than a minor, each marked by when it starts
(`now` when under way), because the band is the span. The moon rides the curve at now in its own
phase, the way the skiff rides the tide, and the phase is the note beside the title (`moonName`: new
moon, waxing crescent, first quarter, waxing gibbous, full moon and back). Anything that says stay in
takes the windows with it. The chart speaks its windows (`The almanac's fishing times: 6:58 pm to
7:58 pm, ...`). It is drawn in like the tide.

**The moon, explained (October 10 2026).** A gale gusting 32 to 51 took every fishing time, and Josh
asked: "where did my fishing times go? i had lil jumping fish? that whole moon section doesn't make
sense now? maybe we can rethink that visual...". Three ways were drawn into copies of the page, and
Josh picked "A, plus B's choppy water": the moon chart explained, with the pond's surface from the
other drawing. So the chart says what it is on a day with no fishing times at all:

- **The moon's own times.** Under the water, the way the tide prints its lows, MOONRISE and MOONSET
  over their times, each on a tick down from where the curve crosses the surface. They are the faint
  ink at the regular weight and a size under the fishing times (`tfs` 9.2 to their 10.5), so the
  blue, heavy fishing times over the picture stay the answer and the two rows never read as rival
  answers. The slider stops on them and names them (`moonrise`, then `fishing until` when a time is
  under way there too), and PageUp and PageDown jump between now, the fishing times' starts and
  these. Both rows are placed, not stamped (`rowPlace`): labels that would touch join a run laid a
  character and a half apart, the run sits where its points say on average, inside the chart's
  edges, and one that would end up more than 18px off its point gives way, a minor before a major.
  At 320 the old placement stood two starts a single character apart, which read as one long
  number; the four starts of a full moon's night all stand at 320 now.
- **Why, in a word or two.** When the weather has taken every almanac time the chart would draw,
  the note beside the title says so after the phase, `new moon · too windy`, and the reason alone
  (`too windy`) when the two do not fit beside the title, because the disc already shows the phase.
  It is fitted again when the fonts land (`moonNoteFit`). `fishWhy` is pure and says, in this order:
  `storms` (thunder overhead), `weather warning`, `icy` (freezing rain falling now), then `icy`,
  `thunder` or `too windy` from the hours that took the times. When the farm's card said stay in for
  times that were clear on their own hours, those are the hours the card speaks for (`stay`).
  Otherwise every one of the times has to have gone for ice, thunder or a 30 mph gust in its own
  hours: a time that went for a gap in the forecast, or past the end of the run, is nobody's reason,
  and then nothing is said. It counts only the times the chart could ever draw, the ones that end
  inside the hours `fishWindows` reads (`until`, the card's 24 hours): the chart runs two hours past
  them, and a calm almanac time there was never going to be drawn, so a gale through all the rest
  left the chart empty with only `new moon` beside it until that was fixed (October 10 2026). It
  reads each time's own hours off the whole run (`full`). It is a reason, never a time: nothing in
  it names when anyone could go. The chart's spoken label says it after `none clear`.
- **The pond.** The horizon is the pond's surface, the water under it a light wash of the page's
  water colour in both themes, and the moon's dotted path runs on under the water, which is drawn
  over it. The surface stands up hour by hour from the gusts the run carries (`chopLevel`, pure):
  flat under 22 mph, a light chop from 22, and choppy from 30, the farm's own gale line, with a few
  short wavelets in the water too, clear of the disc and the fish. Flat before the run starts, past
  its end and wherever a gust is unknown, never a gale. `pondSurface` (pure) samples it every two
  pixels and eases it over about ten, sharp crests over broad troughs, the way wind stands water up.
  It is a still shape and adds no animation. It runs from `CHART_IN` to `CHART_IN` and rides on the
  horizon, so it never moves the moon's scale, and the moon's line is cut at it: over it in the sky,
  dotted under it. So a day the wind takes the fish shows the water it took them with.

Josh approved fish on both this moon line and the Shady Spring pond on October 7, 2026, as the
farm's playful counterpart to the boat on Wilmington's tide. A small olive-and-cream fish with a
forked tail, warm fins and Storybook ink makes one short leap, then rests. On October 10 2026 the
chart's fish moved into the pond and became fish you can see the whole time: until then they were
drawn only for the two seconds of each leap, out of 18, so on a phone with motion on there was no fish
most of the time, and that was half of "i had lil jumping fish?". Every fishing time the chart draws
gets one fish (`fishSpots`, pure), a major's bigger than a minor's (1.15 to .88), seated on the water
inside its own band, so each fish stands for its own time and no other: at the band's middle, or the
nearest spot inside the band where its whole leap clears the moon's disc. It rests just under the
surface, ghosted by the water drawn over it, then on its staggered 18-second clock leaps out past the
surface with its ring and spray, comes back in with its splash and settles back under
(`porchFishLeap`, `porchFishLeapRing`, `porchFishLeapDrops`, the chart's own keyframes). The resting
pose is the first frame and the plain style alike, so a paused fish, one past the animation budget and
one under reduced motion all rest in the same place, visible. The time under way chooses first,
because the moon is always in its band. Every spot in a band is tried, half a pixel apart and both
ends, leaping or resting at any depth, and the best kept, in this order: never on the moon's disc,
wherever the moon is; then clear of the other fish (4px apart at rest, and no leap reaching a resting
neighbour); then inside the pond, its sides and its floor; then inside its band; then leaping rather
than resting; then nearest the band's middle. So a fish rests without leaping (`leap-still`, no
animations) when its leap would reach the moon or a neighbour: the time under way at moonrise or
moonset with the moon on the water in its band, often the next time for an hour or two before it
starts, and on a narrow phone a crowded one. Measured over October 2026 that is some fish for about
eight hours a day at 320 and three at 760, and the rest leap. A resting fish settles at whatever depth
keeps it off the moon, from its back at the surface to the pond's floor, so it never sinks onto a moon
under the water (the first fix did, and sank it past the floor). When nothing inside its band clears
the moon, as with a moon low in shallow water at 760, a resting fish may sit up to half its resting
width past the band's end, its body still across its band. The first build walked the fish out along the whole chart to
find room, and it rested hours past its own time, under the gale that took the next one, and pushed its
neighbours out of their bands. The moon is not water, so no fish leaps out of the disc. A minor's band
is narrower than its fish on a phone and centred on the moment the moon crosses the water, so a
minor's fish rests where the moon's line goes under, over its first dots. The others keep 4px between resting fish and stay over the times under the water. On light paper the disc's dark side
is inked deep and its lit side white, with the rim just outside the face, so a crescent still reads as
a crescent. One pond fish in the header rises only while an approved window is underway, from its
start up to but not including its end, on its own keyframes (`porchFishRise`), gone between leaps,
and never under reduced motion: that is unchanged. The pond needs known weather, at least 45°F, and
no rain or storm. Both drawings share the weather-filtered window list and the farm's stay-in gate.
This is the almanac's picture, never a report of actual fish activity. The brief almanac fish rise
is Josh's approved extra cue alongside the farm's existing resident; the one-cue rule otherwise
stands, and neither animal is shrunk or sped up to make room.

Each fish's takeoff ring, landing splash and expanding ring share its 18-second clock: one brief arc
and a long rest, with chart fish staggered across their bands. Motion is transform and opacity only,
phased off wall time so a repaint continues the gesture. The chart keeps a continuous loop while it
is visible and nobody is exploring its reading. Keep paused animation objects while it is out of
view and resume at the current wall phase. Starting and stopping each short leap caused repeated SVG
layouts. The moon event owns the stagger, so one window ending cannot retime its neighbours. The fish
arrive with the chart's entrance and settle under the water while its reading is being explored. The
pond's splash lands on the water at the fish's contact point and stays behind the cattails.

An open app rechecks the fishing windows at their starts and ends, and on returning to the front;
changing places, hiding the app or clearing an unavailable reading cancels the old fishing timer.
The boundary repaint must not renew an old forecast's age or leave a stale fishing cue on screen.
The astronomy's existing two-minute samples use a fixed clock grid, so recomputing a window at
its edge cannot move that same edge forward and keep a fish out past its time.
`tools/fishing.mjs` checks these transitions, weather gates, phone-sized art, the chart fish resting
visibly (with motion and under reduced motion, the pond fish on its own clock), every chart fish
clear of the labels, the live moon and the frame at rest, takeoff, the top of the leap, the fall, the
splash and settling, and shared water contact. The animation ceiling stays 120.

The header's moving picture rests while the whole header is outside the viewport, leaving room
for the moon chart's fish without running the unseen rain and animals. It keeps the existing
animation objects and restores their elapsed clock when the header returns. A repaint replaces
those references; it must not revive the last place's animals or restart a gesture. On an unusually
tall screen that shows the header and moon together, the animation budget takes priority: a fish
past it rests in the pond and does not leap, and its fishing-time band and its fish both remain.

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

## Fuller, closer, more playful — October 6, 2026

Josh picked mockup B, then asked for it to be "fuller. funner" and approved shipping when ready.
Keep the open title/note → chart → labels layout. This is more presence in the same app, not
boxed cards or more information. Main data curves are 4px; lower-temperature curves remain
quieter at 2.4px. The Sun bar keeps its own 6px thickness and honest 0–12 scale. Temperature
numbers use Bricolage at weight 650, roughly 22% larger; time axes stay in Spline. Label placement
grows with the type and keeps the conservative .6em width allowance, checked against the actual
rendered faces. Chart heights grow together: `chartH` starts at 165, the week's height is 146,
and the hourly plot leaves 18px for its 15px axis and 3px gap. Small-phone titles and long notes
keep enough room. The heavier marks never change a value, scale, threshold or missing-data rule.
The tide's level tag also reserves six pixels around the curve and measures the larger label's
cap height; a thicker line must never run through a number's paper halo.

Daytime paper takes a pale blue-green tint from the actual sky (`daylightPaper`), with a slight
sage lean at the farm. Storm grey stays grey. The paper keeps a luminance floor of .72 and the
small daytime inks are darker so they still read clearly. `daylightBlend` eases from no daytime
tint at −3° solar altitude to its full tint at +6°, blending with the existing golden-hour light;
there is no switch from blue to cream at +6°. Night keeps its established palette. Chart-label
halos and reading pills use the same paper, computed before the charts draw.

The scene is closer through a smaller logical frame: `Math.max(320,appW()/1.22)`. Positions are
recomputed inside that frame before it fits the phone, rather than cropping off the outer
animals or scaling individual creatures separately. It gives about 22% enlargement at 393px;
at the narrowest 320px phone the scene keeps its full supported frame. The house across the pond
is the exception: its frame stays 320 by 194 and a wide screen scales that picture (see Porters Neck).
Preserve the relative sizes of the Storybook Ink cast, the sun path, edge residents, and every holiday clearance.
The fuller scene earns its playfulness from the existing drawings and their behavior.

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
  pleasant outdoor reading (a Freeze Warning or a Frost Advisory is not one: on a frosty fall night it
  printed "Feed early and keep a path open." in red and took the fishing times, fixed October 10 2026):
  the farm says the family's action in red and takes the fishing times,
  and with the boat season on the water says `Stay off the water.` Include
  the NWS instruction text in the expanded alert; do not invent an instruction.
- **The warning strip enters once.** It comes in when an alert arrives and then it stays put. The
  cache paints first and the live forecast lands a moment later, and a resize, a foreground and
  the hour turning over all paint again, so `renderAlerts` writes only what changed: `alertStrip`
  works out the words and `alertStep` says what to do with them. The same alert said the same way
  writes nothing. The warning extended, or another alert joining it, changes the words in place,
  so an open strip keeps its body. A different alert taking the lead plays the entrance again. An
  alert comes down when it ends, with the app left open and nothing touched (`alertTimer` asks for
  the forecast a second after the end, so a warning the Weather Service has extended stays up with
  its new words, and a second after a live product's VTEC begin when it was issued ahead of its
  start, so the storm's headline turns to under way), and the next one to arrive enters, closed. Until October 2026 the strip was
  written from scratch on every paint, so a strip opened on the cache came in again when the live
  forecast landed, a Tornado Warning taking over from a thunderstorm warning only swapped the
  words, and an ended warning stayed up until something painted. `alertStrip` and `alertStep` are
  pure and test.mjs runs them, with `renderAlerts` and `alertTimer` against a stand-in strip.
  Every end carries its day when it is not today, on the place's clock (`until 11:00 am Sun`):
  read on a Saturday, a bare "until 11:00 am" for Sunday was a morning that had passed. Its words'
  "this afternoon" takes its day once that afternoon is over (`relDay`). While a storm card is up it
  leads with the strongest tropical warning, leaves the card's own alerts' words to the card, and lets
  a short-fuse warning in on its own (see The storm card). At night the page's marker is a light
  salmon for type on dark paper, and cream type on it read about 2.7:1, so the strip keeps a deeper
  rust of its own at night, 4.5:1 and more for every word on it.
- Small labels need enough ink on both the sky-tinted daytime paper and the tinted evening
  paper. Keep long condition names wrappable beside three-digit temperatures.
- **Chart labels are placed, not stamped.** On a phone an hour of the hourly chart is about
  twelve pixels wide, so a label every fourth hour printed straight through the high beside
  it (78° under 79°, 62° under the 61° low), and only at some widths, which is why it came
  and went between the phone and the desktop. Each label gets a box in chart units (screen
  pixels, keeping the mono face's .6em advance as conservative room for the fuller display face)
  and goes down in priority order against what is
  already drawn: the bars and key dots, then the high, now and the low, then the regular
  hours where they have room, then the rain odds, then the moon on the night band (the words
  AFTER DARK went: the band and the moon already say it, so the moon has only its own box). The high always
  keeps the space above its dot; now or the low take the space under their own dot when the
  space above is taken. Check it at 320, 375, 393 and 430, not only at one width.
- **A sideways swipe on the picture changes place (October 22 2026).** The address tap still
  steps to the next place. A finger, a mouse or a trackpad drag on the picture itself slides
  it: left brings the next place, right the previous, and the three wrap. The picture follows
  the finger and eases the rest of the way, off through the sky, and the next one comes in
  from the other side. A vertical move stays a scroll (`touch-action: pan-y`, and a 10px lock
  that gives the gesture up once it is taller than it is wide). Nothing on the picture says
  the other places are there: Josh asked for the swipe to stay a thing you find (October 22
  2026), so the three dots came off the same day they went on. Reduced motion changes the place with no slide. One picture only, moved by a
  transform, so the sheets are not drawn twice.
- **Opening and switching in October 2026.** Four things a family member saw on a phone, fixed
  together on October 10 2026 after an audit of the staged paint (#75):
  - A place switch with a cache takes the last place's pictures, notes, sentences and strips down
    before the new place's first frame (`clearPlaceReadings`), and puts up the new place's shell
    (`paintLocationShell`). The cached paint lands in stages, and until the last one the coast's
    week, its water and Wilmington's year sat under the farm's name for 70 to 130ms. The charts
    draw in again, the way a new place's do. `tools/interactions.mjs` reads the frame after the tap.
  - The rain keeps falling while the lines draw in. PR #73 paused the streaks while the hours or
    the week drew, so every drop hung mid-air for about three seconds each time the app opened in
    the rain. The drops are compositor transforms, so the pause saved nothing a phone could feel.
  - The rain-soon bars grow in once, when the strip comes up, and a repaint sets their heights on
    the same nodes (`renderNowcast`). Rewritten each paint, every bar collapsed and grew again when
    the live forecast landed, the same fault the warning strip had.
  - The headline reads the whole hourly run (`dayStory(c,dy,full,now)`), so from five o'clock it
    says `Sunny tomorrow.` and not only `Tomorrow's high is 79°.`, which is for a short cache. Its
    look-ahead is still capped at 24 hours inside it. The hour now is in takes the observed sky
    (`codeAt`), so a cloudy reading never sits beside `Nice and sunny this afternoon.` And a wet
    sky at an hour with odds under 25, every reading known, is `Maybe a stray shower.` (`lowWet`,
    `stray`), never `Forecast details unavailable.`, which is for real gaps.
- **The paper is worked out, never read back (October 21 2026).** `render()` read the paper (`--paper`,
  `--wash`, `--line`) back with `getComputedStyle` just after setting the sky's colours, which made the browser
  restyle the whole page to answer, Beaufort's five to six thousand picture nodes with it. On a cached open,
  when the live forecast landed mid-pen, that was a 95 to 105ms frame and a 40 to 65ms one after it in
  `tools/webkit.mjs`'s WKWebView. `goldenHour` hands back the paper it set, and the light theme's own is
  `PAPER.lit`; every root colour is the same as main's at every place and hour. The sky's ink fade (`.sky`'s
  .8s `color` transition) still restyles the whole picture on each of its frames as the page opens, because
  the picture inherits it: taking it out (`.scene{color:var(--on-sky)}`) smoothed the first half second of an
  open but stopped the sun's path and times fading with the sky's words, and moved the bridge's ink by a level
  or two in WebKit, so it was left as it is.
- **Every line runs the same width.** Josh, October 9 2026: "the width of the week part doesn't
  extend as far as the other lines. everything should be even". The hours, the week, the water,
  the moon and the year each start their line and its fill `CHART_IN` (16px, the hourly's own
  inset) inside the content edge and end 16px inside the other, at every width and at both places.
  16 and not full bleed, because 16 is room for a three-letter label under an end point (NOW, SUN,
  J, a tide time) to sit centred under it inside the content edge. No line is drawn past its first
  or last reading to get there: the week's points moved out to the edges instead of its line being
  stretched, and a missing first or last reading still stops the line at the last known one. The
  week's day columns are centred under their points and meet halfway between them, so the two
  outer columns are cut at the content edge and pad toward the inside (`--wk-cols`, `--wk-pad`);
  TODAY is wider than its 32px and safe centring holds it inside the edge, a couple of pixels right
  of its point. A cut column's tapped wash and the weekend band are centred on its point, no more
  than 3px past the edge (the cut once left MON hard against the right of its own box), and the
  week's hairline runs from `CHART_IN` to `CHART_IN` like every other chart's rule. A cached place
  switch holds the week's height across the clear (`clearPlaceReadings`), because its height comes
  from its columns and everything under it jumped 200px and back while the paint was staged in.
  An end day's number steps in rather than hang off the page. The water's depth scale is no longer an axis that
  held its curve in: `2 ft` and `4 ft` sit on their own gridlines inside the plot, placed, not
  stamped, at the right end, then the left, then the nearest clear spot along the line, clear of
  the curve, the skiff and its tag, the tag's room beside the bow and the stern (drawn or not, because
  a bare `2 ft` in the slot `+1.5 ft` goes in reads as a reading about the boat), the now line, the
  times and the lows' ticks, and in one column
  when one spot clears every gridline. The year's twelve months are laid out between the two
  edges, its wrap (December into January, which is real) is clipped to them, and `.yr-months` pads
  by the same 16px so every letter is under its point. `tools/shots.mjs` measures it (`even`).

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

- **A tapped day uses the family's words.** Josh's October 2026 wording pass replaced the
  temperature-and-sky fragments with connected sentences: `Warm and sunny.`, `Cool and cloudy.`,
  `Nice and mostly sunny.` Nice needs a known high from 68 to under 82, a clear or partly cloudy
  sky, known rain odds under 25%, and known daily wind under 20 mph. Rain gets one sentence,
  `Rain likely.` or `Showers possible.`, rather than a second sentence saying it will be wet.
  Likely starts at 70%; thunder, snow and freezing rain keep their names and the established
  practical follow-up. Missing sky, temperature, odds or wind never earns nice. The weekly
  chart still carries the numerical odds. The current condition says `Sunny` or `Mostly sunny`
  in daylight and `Clear` or `Mostly clear` after sunset, from the same sky code.

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
  percentage. A cold open yields that work: the picture lands, then the hourly chart, then
  its pen, then the week and its pen, then the rest of the page, so the line's first frame
  is the pen and not the whole render. The animations keep the samples a straight join would
  miss by a third of a pixel (`penIdx`); the clock underneath stays the dense walk, and the
  dash, the tails, the tip and the fill stay the same. Reduced motion still yields the paint
  and never arms the pen.

`tools/interactions.mjs` runs sixty-five scenarios: every pill kept inside its chart at both edges
at 320, 390 and 900, keyboard navigation, location switching, snow/ice labels, a warning at the farm that is `Chores can
wait.` in red and takes the fishing times until it expires (the moon's note saying `weather warning`
while it does), source instructions, a warning strip
opened on the cache that stays put through the live paint, a re-render, a resize and a foreground
and changes its words in place when the warning is extended, then enters again for a different
alert, goes when it ends (refreshed or left open) and enters for the next (at the coast at 390 and
the farm at 320, with motion on), a farm day with
thunder in the run from noon and nothing warned (the headline `Thunder possible around noon.`,
the card `Piddle before the thunder.` in amber, and no fishing time inside the thunder), a phone that opens at the coast and taps to the farm's
cache (the farm's moon and its year's title on the cached paint and the live one),
the entrance across a cache-to-live paint that drops the nowcast strip with the week at the
fold (nothing on screen left undrawn) and with no cache (the tide the live paint pushes below
the fold waits for the scroll, then draws), retry, and cached/online recovery; a cold open in Debby's
storm with the beach zone in time (the card is in the first frame and the hours never move under it),
late and scrolled to the week (nothing on screen moves), late and scrolled partway with the header's
foot 150px down the screen (the hours hold still), and late at the top (the sky stays put), then
reopened offline on its cached card; Debby opened with the beach fast and the advisories 3.7 seconds
slow (the beach's warning is in the first frame), and left open across the beach warning's expiry
and renewal with the advisories slower than the forecast (every frame watched: the card never comes
down and the headline never leaves the storm); Florence with the advisories late and the card's top
100px above the screen at 320 and 390 (the card grows, the hours hold); and a Tornado Warning under Florence's Hurricane Warning, which
leads the strip with its own instruction, is never folded into the card, and hands the strip back to
the hurricane when it ends. At Beaufort it reads every stop of the October 27 king tide at 320, 390 and
900 and by a finger (the stage words, the flood tide in the grass's green, the wind with the chip's vane),
opens a hard April blow with the coastal waters 5.2 seconds late and the page's own scroll anchoring off
(the forecast is never held, the gusts line is there from the first paint, and the late advisory moves
nothing on screen under the chart, scrolled under it or onto it), and opens it on a cache that had the
advisory and no wind direction with the zone failing (the cached speeds with only now's arrow, then every
arrow and no bar). Then the explorer
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
`tools/shots.mjs`. A paint lands in stages (the picture, the hours a frame on, the week three after
that, the rest three after that), and the live stamp is written on the first of those frames, so
`interactions.mjs`, `tonight.mjs` and `shots.mjs` wait on `PAINT` past the live stamp, a refresh or
a render before they read a chart (`painted`). `PAINT` is the latest paint's promise: `render()`
makes a new one, its last stage settles it, and a newer paint or the loading shell settles the old
one, so a waiter never hangs on a paint that was superseded. Counting frames was a guess at the
staging and broke whenever a stage moved; and the week is tapped where
its points are (`weekAt`), not at even column centres. Request ordering and alert expiry also run in `node --test test.mjs`.

## Known issues

- `api.open-meteo.com` and `marine-api.open-meteo.com` are unreachable from some
  networks. DNS resolves, TCP never connects, on both 443 and 80. With both hosts
  down the forecast fetch fails and the page shows the last cached reading (same
  day, up to 6 hours old) and the cards worked out from it, cached seas and all,
  behind the age stamp and the dimmed live dot, which reads as working but stale.
  The water temperature and the level are not carried that far: they hide once
  the thermometer's reading is past its window (an hour for the station's, an hour and a half
  for the buoy's) and the gauge's is half an hour old. Past 6 hours or into a new
  day there is no cache, and the page shows the unavailable state: the sections in their
  places with their titles and no pictures, and no sentence card. When
  the marine host alone fails, the forecast still lands and the seas are left off the
  note (with the boat season on, `Seas unavailable.`, unless the wind alone decides it).
  That is the honest answer, not a bug. `api.weather.gov` and NOAA's CO-OPS answer
  fine on the same network. The fix under discussion is an NWS gridpoint fallback
  source: temperature, rain chance, wind, gusts and cloud all come through it, UV,
  the 15-minute nowcast and wave height do not.
