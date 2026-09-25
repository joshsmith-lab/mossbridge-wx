/**
 * Rebuild icon.svg from its parameters.
 *
 *   node tools/icon/build.mjs [--grain=file-with-a-data-url]
 *   node tools/icon.mjs                      # then export the PNGs, and bump CACHE in sw.js
 *
 * The master is C2_SHIP in gen.mjs, drawn by master(). The paper grain is a baked image kept inside
 * icon.svg so the master stands alone; a rebuild reuses the grain already there unless --grain
 * names another.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { master } from "./gen.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = path.join(ROOT, "icon.svg");
const arg = process.argv.find((a) => a.startsWith("--grain="));
const grain = arg ? readFileSync(arg.slice(8), "utf8").trim()
  : (readFileSync(file, "utf8").match(/<image id="grainI" href="(data:image\/png;base64,[^"]+)"/) || [])[1];
if (!grain || !grain.startsWith("data:image/png;base64,")) { console.error("no grain: pass --grain=<file holding a data:image/png URL>"); process.exit(1); }
const svg = master(grain);
writeFileSync(file, svg);
console.log(`wrote icon.svg (${(svg.length / 1024).toFixed(0)} KB)`);
