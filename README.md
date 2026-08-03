# Porch Weather

A small, installable weather app tailored to Moss Bridge Court in Porters Neck, North Carolina, and Bob Plumley Road in Shady Spring, West Virginia.

The production site is [joshsmith-lab.github.io/mossbridge-wx](https://joshsmith-lab.github.io/mossbridge-wx/). GitHub Pages serves the `main` branch, so feature branches and draft pull requests do not change the shared site.

## Development

The app is intentionally build-free: `index.html` contains the application, `sw.js` provides offline shell caching, and `manifest.json` makes it installable.

Run the checks with:

```sh
node --test test.mjs
```

Weather data comes from Open-Meteo, marine forecasts from Open-Meteo Marine, tides from NOAA, and alerts and tropical products from the National Weather Service.
