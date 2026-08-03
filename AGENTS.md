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

There is no working git push from an agent session. Confirmed absent on Josh's
Mac: `gh`, a git credential helper, a keychain entry, and any SSH key. A cloud
session's own GitHub token has no access to this repo.

The route that works is Josh's logged-in browser, through the GitHub web
editor, on a feature branch:

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

`tools/shots.mjs` renders the app across eight scenarios (day, night, storm,
dusk, both locations, an afternoon that should recommend today, and a washout)
against mocked API responses and a fixed clock, then writes screenshots to
`tools/shots/` and prints the generated copy. Use it before shipping anything
visual.

```sh
npm i playwright && npx playwright install chromium
TZ=America/New_York node tools/shots.mjs
```

Notes: it shims `Date` rather than freezing the clock, so CSS animations still
run; run it with `TZ=America/New_York` or the mocked data and the page will
disagree about what time it is; set `PORCH_FONT_DIR` to a folder holding
`bricolage.woff2` and `spline.woff2` if Google Fonts is unreachable, otherwise
type metrics are wrong and any alignment work is misleading.

## Known issues

- `api.open-meteo.com` and `marine-api.open-meteo.com` are unreachable from some
  networks. DNS resolves, TCP never connects, on both 443 and 80. The app falls
  back to cached data behind a quiet "cached" label, which reads as working but
  stale. `api.weather.gov` answers fine on the same network. The fix under
  discussion is an NWS gridpoint fallback source: temperature, rain chance,
  wind, gusts and cloud all come through it, UV, the 15-minute nowcast and wave
  height do not.
- Stale data should say how stale it is.
