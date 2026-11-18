import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NATIVE_SELF_DESTROYING_SW } from "./nativeServiceWorker";

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const OLD_SW = [
  "var CACHE = 'tabletrade-vc8';",
  "self.addEventListener('install', function (event) {",
  "  event.waitUntil(",
  "    caches.open(CACHE).then(function (cache) {",
  "      return cache.addAll(['/', '/index.html', '/app.js']);",
  "    }).then(function () {",
  "      return self.skipWaiting();",
  "    })",
  "  );",
  "});",
  "self.addEventListener('activate', function (event) {",
  "  event.waitUntil(self.clients.claim());",
  "});",
  "self.addEventListener('fetch', function (event) {",
  "  event.respondWith(",
  "    caches.match(event.request).then(function (cached) {",
  "      return cached || fetch(event.request);",
  "    })",
  "  );",
  "});",
  "",
].join("\n");

const OLD_HTML = [
  "<!doctype html>",
  "<html><head><title>TableTrade</title></head><body>",
  "<div id=\"root\">old-bundle</div>",
  "<script src=\"/app.js\"></script>",
  "<script>",
  "if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');",
  "</script>",
  "</body></html>",
  "",
].join("\n");

const NEW_HTML = [
  "<!doctype html>",
  "<html><head><title>TableTrade</title></head><body>",
  "<div id=\"root\">new-bundle</div>",
  "<script src=\"/app.js\"></script>",
  "</body></html>",
  "",
].join("\n");

function chromePath(): string {
  const candidates = [
    process.env.CHROME_PATH || "",
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error("Chrome is required for the service worker update test");
}

describe("Android service worker", () => {
  let outDir = "";

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "tt-native-sw-"));
    await execFileAsync("npx", ["vite", "build", "--outDir", outDir], {
      cwd: root,
      env: { ...process.env, VITE_NATIVE: "1", VITE_BASE: "/" },
    });
  }, 120000);

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it("ships a killer worker and does not register it from index.html", async () => {
    const html = await readFile(join(outDir, "index.html"), "utf8");
    const sw = await readFile(join(outDir, "sw.js"), "utf8");
    expect(html).not.toMatch(/registerSW/);
    expect(html).not.toMatch(/serviceWorker\.register/);
    expect(sw).toBe(NATIVE_SELF_DESTROYING_SW);
    expect(sw).toMatch(/skipWaiting/);
    expect(sw).toMatch(/caches\.delete/);
    expect(sw).toMatch(/unregister/);
    expect(sw).not.toMatch(/precache/i);
    expect(sw).not.toMatch(/addEventListener\(\s*['"]fetch['"]/);
    expect(sw).toMatch(/\.then\(function \(\) \{\}, function \(\) \{\}\)/);
    await expect(readFile(join(outDir, "chrome69-sw.js"), "utf8")).rejects.toThrow();
  });

  it("replaces a controlling Workbox worker on the first load", async () => {
    const site = await mkdtemp(join(tmpdir(), "tt-sw-site-"));
    const files: Record<string, string> = {
      "/index.html": OLD_HTML,
      "/sw.js": OLD_SW,
      "/app.js": "window.__ttBuild='old';\n",
    };
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const body = files[path];
      if (body == null) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      const type = path.endsWith(".js") ? "text/javascript" : "text/html";
      res.writeHead(200, {
        "content-type": type,
        "cache-control": "no-cache",
      });
      res.end(body);
    });
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const origin = `http://127.0.0.1:${address.port}/`;

    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({
      executablePath: chromePath(),
      headless: true,
      args: ["--no-sandbox", "--disable-gpu"],
    });
    try {
      const page = await browser.newPage();
      await page.goto(origin, { waitUntil: "load" });
      await page.waitForFunction(
        () => navigator.serviceWorker.controller != null && window.__ttBuild === "old",
        { timeout: 10000 },
      );
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction(() => window.__ttBuild === "old", { timeout: 5000 });

      files["/index.html"] = NEW_HTML;
      files["/sw.js"] = NATIVE_SELF_DESTROYING_SW;
      files["/app.js"] = "window.__ttBuild='new';\n";

      const started = Date.now();
      await page.reload({ waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => undefined);
      await page.waitForFunction(() => window.__ttBuild === "new", { timeout: 5000 });
      expect(Date.now() - started).toBeLessThanOrEqual(5000);
      await page.waitForFunction(
        () =>
          navigator.serviceWorker
            .getRegistrations()
            .then((regs) => caches.keys().then((keys) => regs.length === 0 && keys.length === 0)),
        { timeout: 5000 },
      );
      const left = await page.evaluate(async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        const keys = await caches.keys();
        return { regs: regs.length, keys: keys.length, build: window.__ttBuild };
      });
      expect(left).toEqual({ regs: 0, keys: 0, build: "new" });
    } finally {
      await browser.close();
      server.close();
      await rm(site, { recursive: true, force: true });
    }
  }, 30000);
});

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

declare global {
  interface Window {
    __ttBuild?: string;
  }
}
