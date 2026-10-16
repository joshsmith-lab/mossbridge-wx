# Handoff, Friday October 16 2026

This branch holds notes only. Never merge it, and never let `handoff/` reach main. The work moved
from Josh's laptop to a cloud session at about 11:30 am, because he was closing the laptop to travel.

## What Josh asked for, and what he cleared

1. **The oak glow.** "when the sun is behind the oak tree, like it is now, that tree should really
   glow like it would in real life." This was Beaufort at 8:35 am, with the sun low behind the live
   oak's crown.
2. **The grass.** "the mud flat sim is excellent! let's look at that grass though, because at low tide
   like now, looks like it's floating." At tide 0.15 the spartina tufts along both near banks stood
   over water.
   - For 1 and 2 he said: **"i trust you with both of these, just ship when ready."**
3. **The water chart.** He saw three mockups at https://claude.ai/artifact/FwDUFuaEY3Aj4TDGTAcgQf.
   The recommendation was **option C with A's "gusts to" line added back**. He answered **"go with your
   pick."**, then **"ship when ready. nice job!"**

All three are cleared to go live once they are right. Ship 1 and 2 together first, then 3.

## Branches (all pushed)

| Branch | Commit | State |
|---|---|---|
| `feature/bft-oak-glow` | 02ee124 | Built and self-tested (test.mjs 73/73 in NY and UTC). **Not reviewed:** the two reviewers were stopped. It also lights the palmettos at sunset. See `oak-build.json` and the art brief in `oak-reference-brief.json`. |
| `feature/bft-low-tide-grass` | 475b6d3 | Built. The reviewer said **ship**, with fixes (`grass-review.json`). |
| `wip/bft-low-tide-grass-revise` | 3ef3daf | Those fixes, half applied when it was stopped. Unverified: finish it or redo it. |
| `feature/bft-fishing-water` | 86ec4e0 | The base for the water chart, the same commit as `mock/bft-water-C`. |
| `wip/bft-fishing-water` | 2eb722b | The production build, stopped mid-way. Unverified: finish it or redo it from 86ec4e0. |
| `ref/bft-water-A` | 505a0f8 | Mockup A squashed onto main, as a reference. It has A's "gusts to" line to port: search index.html for `gusts to`. (B stayed on the laptop. It is only a reference.) |
| `mock/bft-water-C` | 86ec4e0 | Josh's pick. |
| `feature/beaufort-water-mock` | 4d9e958 | A tools-only fixtures commit (Beaufort tide table in fixtures, buoy water by month). Not needed if the mocks carry their own. |

`water-mockups.json` is the research, the judge's review and each mock's full write-up:
- the fish runs, tide fishing and wind sources;
- what is real and what is hard-coded;
- the USGS 02176603 gauge idea, which is the next step, not built.

`fish-calendar-check.json` is SC DNR's month-by-month check of the in-season row, with sources. It
**found the 2026 shrimp baiting season: noon Friday September 11 to noon Monday November 9 2026**
(SCDNR's 2026-27 regulations guide, https://www.dnr.sc.gov/regs/pdf/Regs2627.pdf), so "baiting" can
show under shrimp for those dates.

## The plan

1. **Oak and grass, one PR.**
   - Make `feature/bft-oak-glow-and-grass` from origin/main and merge both branches.
   - Apply the grass review's fixes: take them from the WIP branch, or apply them fresh.
   - Review the oak properly at 320 and 390. Check realism and Storybook craft. Check its honesty gates:
     sun up and behind the crown, cloud, fog, rain, storm, night. Check the layers: nothing new on
     `#sceneMoss` beyond strand colours, nothing on the moving layers.
   - Bump `CACHE` to v101 and update test.mjs's assertion for it.
   - Run every test and harness. Check that Porters Neck and Shady Spring are unchanged, then ship.
2. **The water chart, a second PR once the first is merged.**
   - Port A's gusts line into C's wind row. Its rule: gusts at or over BOAT's caution gust and 6 or more
     over the wind.
   - Make it production quality: nothing mock-labelled. The AMZ362 zone keeps its own lane. A late zone
     answer repaints with the view held, the way the storm lane does.
   - Apply the calendar check, the shrimp baiting dates included.
   - Write a proper AGENTS.md part under "## Beaufort", in its voice: the family's asks, Josh's pick on
     October 16, each mark's rule and source, and what was left out and why. Update README sources and
     test.mjs.
   - Merge origin/main, set `CACHE` to v102, run everything, and ship.
3. **After each ship,** run the merge flow below. Then send Josh a phone-size picture (this morning's
   scene, then the water section) with a plain-words line on what changed.

## Josh's merge flow

1. In a separate read, confirm the PR's headRefOid is the tested HEAD, CI `test` is SUCCESS and
   mergeStateStatus is CLEAN.
2. Merge with `gh pr merge <n> --merge --match-head-commit <sha>`. The repo uses merge commits.
3. Wait for Pages (`gh api repos/joshsmith-lab/mossbridge-wx/pages/builds/latest`).
4. Compare the sha256 of the live index.html, sw.js and manifest.json at
   https://joshsmith-lab.github.io/mossbridge-wx/ against origin/main. Only then call it live.

Never push to main. Never force-push.

## Harnesses in the cloud

- Install Playwright and its Chromium: `npm i playwright && npx playwright install chromium`. If Google
  Fonts is unreachable, set `PORCH_FONT_DIR` (AGENTS.md "Verifying visually").
- Run harnesses with `TZ=America/New_York`. Run `node --test test.mjs` under both America/New_York and UTC.
- `tools/webkit.mjs` needs macOS (a WKWebView built with swiftc), so it cannot run here.
  - Compare main and the branch in Playwright's WebKit as a proxy (`npx playwright install webkit`),
    and tell Josh it was a proxy.
  - The Mac numbers on October 15: Beaufort held 60 fps by day and 56 on an October night.

## Josh

He is not a developer. Say what changes on the phone, in plain words, and keep code and CI talk out of it.

## Names

The repo is public. Keep the Beaufort family's first names out of anything committed. AGENTS.md
already says "Jen's family", and that can stay. Say "the family" for the boater and the pilot, and do not
quote the family's conversation by name.
