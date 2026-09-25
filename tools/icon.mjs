/**
 * Export the home-screen icon from its master.
 *
 *   node tools/icon.mjs
 *
 * Rewrites icon-180.png and icon-512.png from icon.svg, rendered by Chrome at 1x so the 180 file
 * is the 180px grid the master is drawn on. A new export is a new shell: bump CACHE in sw.js.
 * If the Playwright package is present but its bundled browser is not, set PORCH_CHROME_PATH.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.error("playwright is not installed.\n  npm i playwright && npx playwright install chromium"); process.exit(1); }
const uri = "data:image/svg+xml;base64," + readFileSync(path.join(ROOT, "icon.svg")).toString("base64");
const browser = await chromium.launch(process.env.PORCH_CHROME_PATH ? { executablePath: process.env.PORCH_CHROME_PATH } : {});
for (const s of [180, 512]) {
  const page = await browser.newPage({ viewport: { width: s, height: s }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0"><img src="${uri}" width="${s}" height="${s}" style="display:block">`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(ROOT, `icon-${s}.png`) });
  await page.close();
  console.log(`wrote icon-${s}.png`);
}
await browser.close();
