import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const html = readFileSync(join(root, "public/welcome/index.html"), "utf8");
const css = readFileSync(join(root, "public/welcome/styles.css"), "utf8");
const vite = readFileSync(join(root, "vite.config.ts"), "utf8");

describe("marketing landing page is a static public file", () => {
  it("is not wired as a React / Vite SPA entry", () => {
    expect(html).not.toMatch(/src\/main\.tsx/);
    expect(html).not.toMatch(/type=["']module["']/);
    expect(html).not.toMatch(/id=["']root["']/);
    expect(html).toContain('href="styles.css"');
    expect(css.length).toBeGreaterThan(400);
  });

  it("names the product, studio, lead, live app, and unofficial status", () => {
    expect(html).toMatch(/<title>[^<]*TableTrade/);
    expect(html).toMatch(/<h1>\s*TableTrade\s*<\/h1>/);
    expect(html).toContain("TableTrade");
    expect(html).toContain("Trade here, now.");
    expect(html).not.toMatch(/TablePing/);
    expect(html).not.toMatch(/NowTrade/);
    expect(html).not.toMatch(/tonight/i);
    expect(html).toContain("Range Road Technologies");
    expect(html).toContain("Built by");
    expect(html).toContain("Matt Sumegi");
    expect(html).toContain("https://msumegi.github.io/tableping/");
    expect(html).toMatch(/unofficial/i);
    expect(html).toMatch(/Nintendo|Pokémon Company|Pokemon Company/);
    expect(html).toContain("Open TableTrade");
    expect(html).not.toMatch(/Play Store|Google Play/i);
    expect(html).toMatch(/Check in|I’m here|in this shop/i);
    expect(html).not.toMatch(/~120/);
    expect(html).not.toMatch(/Tinder/i);
    expect(html).not.toMatch(/Magic/);
    expect(html).not.toMatch(/One Piece/);
    expect(html).not.toMatch(/marketplace/i);
  });

  it("keeps /welcome/ out of the PWA navigation fallback", () => {
    expect(vite).toContain("navigateFallbackDenylist");
    expect(vite).toMatch(/\/welcome/);
    expect(vite).toContain('globIgnores: ["**/welcome/**"]');
  });
});
