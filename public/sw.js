// Exists only to satisfy the browser's PWA installability requirement (Chrome/Edge
// won't show an install prompt without a registered service worker with a fetch
// handler). This app is inherently live/real-time (chat, Firestore listeners), so
// there is no meaningful offline mode to build - deliberately no caching here.
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
    // No-op: let every request go to the network as normal.
});
