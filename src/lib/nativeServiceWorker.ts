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
  "  event.waitUntil(",
  "    self.caches.keys().then(function (keys) {",
  "      return Promise.all(keys.map(function (key) {",
  "        return self.caches.delete(key);",
  "      }));",
  "    }).then(function () {",
  "      return self.registration.unregister();",
  "    }).then(function () {",
  "      return self.clients.matchAll({ type: 'window' });",
  "    }).then(function (clients) {",
  "      var waits = [];",
  "      for (var i = 0; i < clients.length; i++) {",
  "        var client = clients[i];",
  "        if (client.navigate) waits.push(client.navigate(client.url));",
  "      }",
  "      return Promise.all(waits);",
  "    })",
  "  );",
  "});",
  "",
].join("\n");
