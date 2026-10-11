# Porch Weather

A small, installable weather app tailored to Moss Bridge Court in Porters Neck, North Carolina, and Bob Plumley Road in Shady Spring, West Virginia.

The production site is [joshsmith-lab.github.io/mossbridge-wx](https://joshsmith-lab.github.io/mossbridge-wx/). GitHub Pages serves the `main` branch, so feature branches and draft pull requests do not change the shared site.

## Development

The app is intentionally build-free: `index.html` contains the application, `sw.js` provides offline shell caching, and `manifest.json` makes it installable.

Run the checks with:

```sh
node --test test.mjs
```

To eyeball the app across day, night, storm, dusk, the weekend and the seasons at
both locations, with mocked upstream data and a shifted clock:

```sh
npm i playwright && npx playwright install chromium
TZ=America/New_York node tools/shots.mjs
TZ=America/New_York node tools/interactions.mjs
TZ=America/New_York node tools/scene.mjs
```

See [AGENTS.md](AGENTS.md) for the deploy route, the design principles behind
the current copy and charts, and the known issues.

Weather data comes from Open-Meteo, the seas from Open-Meteo Marine, the tide table, water temperature and water level from NOAA CO-OPS station 8658163 (Wrightsville Beach), the water temperature when that station has none from UNCW CORMP's Masonboro Inlet buoy (NDBC 41110) through SECOORA's ERDDAP, the watches, warnings and advisories from the National Weather Service (at the house, and at the coast the beach zone's tropical ones, with each office's tropical cyclone statements), the storm card's storm (its name, strength and forecast track) from the National Hurricane Center's and the Weather Prediction Center's public and forecast advisories, all through api.weather.gov, the bar for a winter storm warning at the farm from the Weather Prediction Center's Winter Storm Severity Index (its overall impact on each of days 1, 2 and 3, through NOAA's mapservices.weather.noaa.gov, and its archive at ftp-wpc.ncep.noaa.gov for the backtest), and the year's averages from NOAA's 1991-2020 climate normals at Wilmington and Beckley airports.
