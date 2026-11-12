import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE || "/";

/** Downlevel to Chrome 69 (Android 9 System WebView). es2018 drops ?? and ?.; chrome69 is the same floor. */
const chrome69Target = ["es2018", "chrome69"] as const;

export default defineConfig({
  base,
  esbuild: {
    target: "es2018",
  },
  build: {
    target: [...chrome69Target],
    cssTarget: "chrome69",
    rollupOptions: {
      output: {
        // Capacitor's web builds use import(), which Chrome 69 can run but which
        // is newer than ES2018. Inlining removes that syntax from the shipped bundle.
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2}"],
        // Marketing page is a real static file. Do not serve the SPA shell for /welcome/.
        globIgnores: ["**/welcome/**"],
        navigateFallbackDenylist: [/\/welcome(?:\/|$)/],
        importScripts: ["chrome69-sw.js"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.pokemontcg\.io\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "pokemontcg-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/api\.pokemontcg\.io\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "pokemontcg-api",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^https:\/\/assets\.tcgdex\.net\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "tcgdex-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "tesseract-cdn",
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/tessdata\.projectnaptha\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "tesseract-lang",
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ["tesseract.js"],
    esbuildOptions: {
      target: [...chrome69Target],
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});
