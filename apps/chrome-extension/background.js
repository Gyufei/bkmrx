// bkmrx-chrome-ext — Service Worker
// Minimal: currently no persistent background tasks needed.
// Reserved for future features (keyboard shortcuts, alarms, etc.).
self.addEventListener('install', () => {
  self.skipWaiting();
});
