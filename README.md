# Porch Weather

A small, installable weather app tailored to Moss Bridge Court in Porters Neck, North Carolina, Bob Plumley Road in Shady Spring, West Virginia, and Coosaw Club Drive on Lady's Island in Beaufort, South Carolina.

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
TZ=America/New_York node tools/beaufort/scene.mjs   # Beaufort's scene in every weather, tide and October case, and its fishing water
node tools/beaufort/look.mjs palmetto              # one of Beaufort's drawings, close up and at phone size
```

See [AGENTS.md](AGENTS.md) for the deploy route, the design principles behind
the current copy and charts, and the known issues.

Weather data comes from Open-Meteo, the seas from Open-Meteo Marine, the tide table, water temperature and water level from NOAA CO-OPS station 8658163 (Wrightsville Beach), the water temperature when that station has none from UNCW CORMP's Masonboro Inlet buoy (NDBC 41110) through SECOORA's ERDDAP, the watches, warnings and advisories from the National Weather Service (at the house, and at the coast the beach zone's tropical ones, with each office's tropical cyclone statements), the storm card's storm (its name, strength and forecast track) from the National Hurricane Center's and the Weather Prediction Center's public and forecast advisories, all through api.weather.gov, the bar for a winter storm warning at the farm from the Weather Prediction Center's Winter Storm Severity Index (its overall impact on each of days 1, 2 and 3, through NOAA's mapservices.weather.noaa.gov, and its archive at ftp-wpc.ncep.noaa.gov for the backtest), and the year's averages from NOAA's 1991-2020 climate normals at Wilmington and Beckley airports. At Beaufort the tide table is NOAA CO-OPS station 8667999 (Beaufort, on the Beaufort River), which has predictions only, the water temperature is UNCW CORMP's wave buoy off Fripp Inlet (41067) through SECOORA's ERDDAP, the seas are Open-Meteo Marine at the same spot, the alerts are the National Weather Service's for Beaufort County (zone SCZ148), and the year's averages are NOAA's normals at Marine Corps Air Station Beaufort. Beaufort's water chart adds its grass line at the station's own mean higher high water (NOAA's datums for 8667999), the wind at now and at each turn of the tide, and its direction, from Open-Meteo's hourly forecast at the house, the offshore advisories from the National Weather Service's active alerts for the coastal waters zone AMZ362 (Edisto Beach to Savannah out 20 nm) through api.weather.gov, and what is in season from the South Carolina Department of Natural Resources' species pages, its 2025 fishing snapshots and its Technical Report 89 on cobia, with the cobia closure from SC Code 50-5-1713.
