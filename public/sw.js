/* Network-only: never cache authentication, family data, documents or API responses. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mone Thakbe — Offline</title><body style="font-family:system-ui;padding:40px;max-width:560px;margin:auto;background:#f7f9fa;color:#12345a"><h1>মনে থাকবে</h1><h2>You are offline</h2><p>Reconnect to the internet, then reload to access your family records. No private records are stored for offline access.</p><a href="/app">Try again</a></body></html>`, {status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}})));
});
