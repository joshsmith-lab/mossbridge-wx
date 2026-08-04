# Shared project guidance

Read this before touching anything. It exists so a fresh session does not
rediscover the same things the hard way.

## What this is

A single-file, build-free PWA. `index.html` is the whole application,
`sw.js` caches the shell, `manifest.json` makes it installable.

Production is <https://joshsmith-lab.github.io/mossbridge-wx/>, served from
`main`, and it is shared with family. Two locations live in the `LOCS` table:
`mb` (Moss Bridge Ct, Porters Neck NC, coastal, gets marine + tides + tropics)
and `sp` (Bob Plumley Rd, Shady Spring WV, inland).

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
  Blue hour is -4° to -6°. Sunrise and sunset are computed locally from
  `sunPos`, not taken on faith from an API.

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

`tools/shots.mjs` renders eight scenarios (day, night, storm, dusk, both
locations, an afternoon that should recommend today, and a washout), writes
screenshots to `tools/shots/` and prints the generated copy, so wording changes
are reviewable as text.

`tools/scene.mjs` is for anything that moves. Thirteen scenes force the light and
weather that are hard to wait for: calm noon, a hard blow, golden hour, a warm
clear night, a storm, a fog morning, drizzle against a downpour, freezing rain
on the coast, and the ridge by day, by evening with the buck out, on a snow day,
and on a cold January night. Per scene it writes the sky and the scene on their
own, counts the animations *still running* grouped by keyframe, reads
`LayoutCount` off CDP while the scene idles, and proves the page holds perfectly
still under `prefers-reduced-motion` by comparing two screenshots taken 1.4s
apart. It exits non-zero on a page error, on layout thrash, or on anything that
survives reduced motion.

Two numbers worth knowing before you change motion: every scene idles at **0-1
layouts per 6 seconds**, and the busiest scene runs **110 animations**. If either
jumps, you have added something that is not a `transform` or an `opacity`.

Notes: both shim `Date` rather than freezing the clock, because `page.clock`
would also stop the CSS animations that `scene.mjs` exists to look at; run them
with `TZ=America/New_York` or the mocked data and the page will disagree about
what time it is; set `PORCH_FONT_DIR` to a folder holding `bricolage.woff2` and
`spline.woff2` if Google Fonts is unreachable, otherwise type metrics are wrong
and any alignment work is misleading.

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
- One local wildlife **cue** at a time. That rule is about the performing cue,
  the thing that moves and takes the eye, and it still holds: refine the cues,
  do not stack them.
- Under the cue sits a **resident**, and there is always exactly one. It is
  present at every hour in every weather, five to ten units against a 430-unit
  frame, and it barely moves. Residents are why the scene is never empty; the
  one-cue rule is why it is never busy. Do not let a resident start performing.
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
- Stale data should say how stale it is.
