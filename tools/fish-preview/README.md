# Fish on the moon line: local proposal

Josh asked for a familiar, playful counterpart to the boat on Wilmington's tide curve: fish at Shady Spring's almanac fishing windows, on the moon line and in the pond. This is a reviewable animated mockup, not a shipped feature or a new claim about actual fish activity.

The generator copies the current shell into an output folder, injects the proposed drawings and motion, and supplies clearly labeled sample forecasts. It never writes production files. The published app does not load this directory. No cache bump is needed until the shell itself changes.

```sh
TZ=America/New_York PORCH_FONT_DIR=/path/to/fonts node tools/fish-preview/build.mjs /path/to/output
python3 -m http.server 8951 --directory /path/to/output
# In another terminal, with Playwright available:
TZ=America/New_York PORCH_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tools/fish-preview/check.mjs /path/to/output
```

The gallery shows the moon chart and pond at phone size, by day and night, between windows and in a storm. The chart fish mark the displayed almanac windows. One pond fish rises only while an allowed window contains now, in suitable weather. Both read the existing weather-filtered window list. Keep the moon disc and labels clear. One short leap shares a clock with its landing splash and expanding ripple.

A fish too close to the current moon disc is omitted; its window band remains. The chart shows the almanac schedule, while the pond shows whether a window is underway. The fixed sample date advances while a page is open; reload to reset it. Preview pages run on their own local origin and use sample data only.

Before any live implementation, settle the art/motion with Josh, add window-boundary repaint scheduling, preserve the existing chart's entrance and explorer clearance, update AGENTS.md and matching assertions, and complete the release checks. This proposal has no deployment authorization.
