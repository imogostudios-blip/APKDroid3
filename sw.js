// Cleanup Service Worker - clears all old caches and unregisters itself
const CACHE_NAME = 'bayt-althilal-cleanup-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      // Unregister this service worker after cleanup
      self.registration.unregister().then(() => {
        console.log('Old service worker cleaned up and unregistered');
      });
      return self.clients.claim();
    })
  );
});

// Don't cache anything
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
