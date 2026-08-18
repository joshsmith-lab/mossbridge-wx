const CACHE="mbwx-shell-v51";
const SHELL=["./","index.html","manifest.json","icon-180.png","icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.hostname.includes("open-meteo.com")||u.hostname.includes("noaa.gov")||u.hostname.includes("weather.gov")||u.hostname.includes("fonts.g")) return; // always network for data/fonts
  // network-first for the shell so design updates land on next open; cache fallback offline
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
  e.respondWith(
    fetch(e.request,{cache:"no-cache",signal:controller.signal}).then(r=>{
      if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{})}
      return r;
    }).catch(async()=>await caches.match(e.request,{ignoreSearch:true})||fetch(e.request)).finally(()=>clearTimeout(timer))
  );
});
