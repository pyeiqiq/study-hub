/* 离线缓存：缓存应用外壳，联网时更新。注册于 app.js。 */
const CACHE = "studyHub-v2";
const SHELL = [
  "./",
  "./index.html",
  "./assets/css/style.css",
  "./assets/js/data.js",
  "./assets/js/app.js",
  "./assets/manifest.webmanifest",
  "./assets/img/icon.svg"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(function (r) {
      return r || fetch(e.request).then(function (res) {
        var cp = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, cp); });
        return res;
      }).catch(function () { return caches.match("./index.html"); });
    })
  );
});
