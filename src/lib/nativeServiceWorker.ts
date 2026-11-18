/**
 * The Android bundle keeps this worker at sw.js forever.
 * An already-installed Workbox worker updates to it, then this worker
 * deletes every cache, unregisters, and reloads open windows.
 * Syntax stays within Chrome 69.
 */
export const NATIVE_SELF_DESTROYING_SW = [
  "self.addEventListener('install', function (event) {",
  "  self.skipWaiting();",
  "});",
  "self.addEventListener('activate', function (event) {",
  "  var cleanup = Promise.resolve().then(function () {",
  "    return self.caches.keys().then(function (keys) {",
  "      return Promise.all(keys.map(function (key) {",
  "        return self.caches.delete(key);",
  "      }));",
  "    });",
  "  }).then(function () {}, function () {}).then(function () {",
  "    return self.registration.unregister();",
  "  }).then(function () {}, function () {});",
  "  event.waitUntil(cleanup);",
  "  cleanup.then(function () {",
  "    self.clients.matchAll({ type: 'window' }).then(function (cs) {",
  "      cs.forEach(function (c) {",
  "        try {",
  "          var nav = c.navigate(c.url);",
  "          if (nav && nav.then) nav.then(function () {}, function () {});",
  "        } catch (e) {}",
  "      });",
  "    });",
  "  });",
  "});",
  "",
].join("\n");
