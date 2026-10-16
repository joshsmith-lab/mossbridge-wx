/**
 * Fetch NOAA's own high and low predictions for Beaufort (8667999) for the water mock's cases, the way the
 * page asks for them (the day before, 96 hours, MLLW, the station's local time), and keep them in
 * tools/beaufort/tides-8667999.json so the harness serves the real table and not the fixtures' sine.
 *
 *   node tools/beaufort/tides-fetch.mjs 2026-08-02 2026-10-27 ...
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "tides-8667999.json");
const have = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
for (const day of process.argv.slice(2)) {
  const d = new Date(day + "T12:00:00"); d.setDate(d.getDate() - 1);
  const bd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&datum=MLLW&station=8667999&time_zone=lst_ldt&units=english&interval=hilo&format=json&begin_date=${bd}&range=96`;
  const j = await (await fetch(url)).json();
  if (!j.predictions) { console.error(day, "no predictions", JSON.stringify(j).slice(0, 200)); continue; }
  have[day] = j.predictions;
  console.log(day, j.predictions.map((p) => `${p.t.slice(5)} ${p.type} ${(+p.v).toFixed(2)}`).join(" | "));
}
writeFileSync(OUT, JSON.stringify(have, null, 0).replace(/\],"/g, '],\n"') + "\n");
