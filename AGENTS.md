# Shared project guidance

Read this before touching anything. It exists so a fresh session does not
rediscover the same things the hard way.

## What this is

A single-file, build-free PWA. `index.html` is the whole application,
`sw.js` caches the shell, `manifest.json` makes it installable.

Production is <https://joshsmith-lab.github.io/mossbridge-wx/>, served from
`main`, and it is shared with family. Three locations live in the `LOCS` table:
`mb` (Moss Bridge Ct, Porters Neck NC, coastal, gets marine + tides + tropics)
and `sp` (Bob Plumley Rd, Shady Spring WV, inland) are permanent family places.
`den` is the rotating travel entry, currently Denver. Give the next destination a
new unique id and update `LOC_ORDER`; reusing `den` would briefly show cached Denver
weather under the new place name.

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
  are obvious from a tide curve. "Reapply after two hours" is nagging.
- **Never promise what the forecast cannot keep.** The headline is built from
  the hourly run, not from 7-day weather codes, because those flip between model
  runs and made the app name a storm date that moved every few hours. Any
  look-ahead is capped at three days and always prints the odds.
- **Scales are honest.** The tide chart is measured up from the chart datum
  (0 ft MLLW), never autoscaled to the window, so the height of the water on
  screen is the water that is there.
- **Motion tracks the weather.** Cloud drift, grass and tree sway, and the
  skiff's rocking all scale with the actual wind and gusts. Everything respects
  `prefers-reduced-motion` through the `PRM` flag.
- **A picture and its label must agree.** The old wind dial pointed downwind
  while the text beside it read upwind. The vane now points into the wind, the
  way a rooftop vane does.
- **Alignment comes from a rule, not a magic number.** The now block uses
  `align-items: last baseline`; the degree mark is its own flex column so
  numeral tracking can never crowd it.
- **Today means today.** Cards about today do not silently recommend tomorrow.
  Mornings almost always outscore afternoons, so `bestOutsideWindow` stays on
  today unless today is out of daylight or genuinely rough.
- Golden hour is sun elevation +6° to -4°, the convention the photo apps use.
  Blue hour is -4° to -6°. The displayed sunrise and sunset times come from the
  forecast API; sun and moon positions and the golden-hour boundaries are
  computed locally from `sunPos`.

## Deploying

**`git push` works from an agent session on Josh's Mac now.** `credential.helper`
is set to `osxkeychain` and the keychain holds a working credential; a
`git push --dry-run` to a throwaway branch confirms it in a couple of seconds
and creates nothing. Push the feature branch normally.

`gh` is still absent, so the pull request itself has to be opened in the
browser. Push the branch, then hand Josh the compare URL:
`https://github.com/joshsmith-lab/mossbridge-wx/compare/main...<branch>?expand=1`.

A cloud session's own GitHub token still has no access to this repo, and the
browser route below is still the fallback if the keychain credential is ever
revoked:

1. Open `https://github.com/joshsmith-lab/mossbridge-wx/edit/main/<file>`.
2. Do **not** rely on synthetic `cmd+a` / `cmd+v` from the browser extension.
   It works sometimes and silently stops working after the extension
   reconnects, leaving the Commit button greyed out with no error.
3. Instead, run this in the page:
   - `fetch` the current file from `raw.githubusercontent.com` (reachable from
     the edit page; `localhost` is not, CSP blocks it),
   - apply your change as a string replace in JS,
   - dispatch a synthetic `keydown` for `cmd+a` on `.cm-content` (CodeMirror
     honours untrusted events), then a synthetic `paste` `ClipboardEvent`
     carrying a `DataTransfer` with the new text.
4. In the commit dialog choose **Create a new branch and start a pull request**.
5. Verify before declaring victory: fetch `origin` and diff the pushed file
   against your local copy byte for byte. A UTF-8 round trip once mangled every
   `°`, `·` and `—` in the file and it was invisible in the diff view.

If you do use the clipboard, `pbcopy` needs `LANG=en_US.UTF-8` or it encodes as
MacRoman and corrupts every multi-byte character.

## Verifying visually

Two harnesses, sharing their mocked upstreams through `tools/fixtures.mjs`.

```sh
npm i playwright && npx playwright install chromium
TZ=America/New_York node tools/shots.mjs          # the copy
TZ=America/New_York node tools/scene.mjs          # the picture and its motion
TZ=America/New_York node tools/scene.mjs fog storm  # just the scenes you are working on
```

`tools/shots.mjs` renders twelve scenarios (day, night, after midnight, storm, dusk,
the three locations, an afternoon that should recommend today, a washout, and three
Denver clothing conditions), writes
screenshots to `tools/shots/` and prints the generated copy, so wording changes
are reviewable as text.

`tools/scene.mjs` is for anything that moves. Twenty-three scenes force the light
and weather that are hard to wait for: calm noon, a hard blow, golden hour, a warm
clear night, a storm, a fog morning, drizzle against a downpour, freezing rain on
the coast, and the ridge by day, by evening with the buck out, in warm rain, on a
snow day, on a cold January night and in a night downpour, plus Denver in clear,
golden, storm, snow, night, and windy conditions. The ridge night downpour is
there on purpose: dark theme, code 82, two rain layers and a frog, which is
where the animation count goes looking for trouble. It found some, which is the
point of having it. Per scene it writes the sky and the scene on their
own, counts the animations *still running* grouped by keyframe, reads
`LayoutCount` off CDP while the scene idles, and proves the page holds perfectly
still under `prefers-reduced-motion` by comparing two screenshots taken 1.4s
apart. It exits non-zero on a page error, on layout thrash, or on anything that
survives reduced motion.

Two numbers worth knowing before you change motion: every scene idles at **0-1
layouts per 6 seconds**, and the busiest scene runs **110 animations**. If either
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

`index.html` is around 160 KB of source, and an early plan set 160 KB as a
ceiling. That number was about the source file and it is not the number that
matters. GitHub Pages serves the file gzipped, so what a phone actually
downloads is **about 53 KB**, once, and the service worker caches it after
that. Crossing the old line costs a phone roughly one extra kilobyte.

So: do not delete working code to stay under a self-imposed source limit. Write
what the app needs. If the transferred size ever approaches a few hundred KB,
revisit it then, and measure the transferred size rather than the source size.

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
- `transform` and `opacity` only. The one exception is the hourly line draw-in,
  which is one-shot and PRM-gated.
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
- **Draw silhouettes, not anatomy.** A bird in this sky is fourteen pixels across.
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
  the windows disappear under a warned storm so they never read as an
  invitation to stand in a thunderstorm with a rod.

## Known issues

- `api.open-meteo.com` and `marine-api.open-meteo.com` are unreachable from some
  networks. DNS resolves, TCP never connects, on both 443 and 80. The app falls
  back to cached data behind a quiet "cached" label, which reads as working but
  stale. `api.weather.gov` answers fine on the same network. The fix under
  discussion is an NWS gridpoint fallback source: temperature, rain chance,
  wind, gusts and cloud all come through it, UV, the 15-minute nowcast and wave
  height do not.
