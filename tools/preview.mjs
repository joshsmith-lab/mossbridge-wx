/**
 * Phone preview.
 *
 * Serves the working tree on the local network so a real phone on the same wifi can open
 * the branch you are actually holding, against real live weather. Nothing is mocked and
 * nothing is deployed: this is the working copy on disk, at whatever commit you are on.
 *
 *   node tools/preview.mjs
 *
 * It prints a URL to open on the phone. Ctrl-C stops it.
 *
 * Two things to know while previewing:
 *   - The service worker is skipped here, so every reload is the file on disk. That is the
 *     point: you are looking at the branch, not at a cached copy of production.
 *   - The location you pick is remembered in localStorage under the same key production
 *     uses, but on a different origin, so it cannot disturb the installed family app.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORCH_PREVIEW_PORT || 8080);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".png": "image/png" };

const server = createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  // Never hand the phone a service worker in preview: it would cache the branch and then
  // keep serving it after the server is gone, which is a confusing thing to debug later.
  if (p === "/sw.js") {
    res.writeHead(200, { "Content-Type": MIME[".js"], "Cache-Control": "no-store" });
    return res.end("self.addEventListener('install',()=>self.skipWaiting());\n" +
      "self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.map(c=>caches.delete(c)))).then(()=>self.clients.claim())));\n");
  }
  const f = path.join(ROOT, p);
  if (!existsSync(f) || !f.startsWith(ROOT)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "text/plain", "Cache-Control": "no-store" });
  res.end(readFileSync(f));
});

const lan = Object.values(networkInterfaces()).flat()
  .find((n) => n && n.family === "IPv4" && !n.internal)?.address || "localhost";
let head = "unknown";
try { head = execSync("git log --oneline -1", { cwd: ROOT }).toString().trim(); } catch {}

server.listen(PORT, () => {
  console.log(`\n  Porch Weather preview\n`);
  console.log(`  on this Mac : http://localhost:${PORT}/`);
  console.log(`  on a phone  : http://${lan}:${PORT}/     <- same wifi\n`);
  console.log(`  serving     : ${ROOT}`);
  console.log(`  commit      : ${head}`);
  console.log(`  service worker is stubbed out, so every reload is the file on disk\n`);
  console.log(`  Ctrl-C to stop.\n`);
});
