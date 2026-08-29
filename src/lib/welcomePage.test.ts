import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const seed = join(root, "scripts/tabletrade-seed");
const html = readFileSync(join(seed, "index.html"), "utf8");
const css = readFileSync(join(seed, "styles.css"), "utf8");
const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");

describe("marketing site is disconnected from the app Pages deploy", () => {
  it("does not ship /welcome on the app site", () => {
    expect(existsSync(join(root, "public/welcome"))).toBe(false);
    expect(readme).not.toMatch(/tableping\/welcome/);
    expect(html).not.toMatch(/\/welcome/);
  });

  it("keeps /welcome/ out of the PWA navigation fallback so the old path 404s", () => {
    expect(vite).toContain("navigateFallbackDenylist");
    expect(vite).toMatch(/\/welcome/);
    expect(vite).not.toContain('globIgnores: ["**/welcome/**"]');
  });

  it("seeds a standalone TableTrade site at its own Pages root", () => {
    expect(html).not.toMatch(/src\/main\.tsx/);
    expect(html).not.toMatch(/type=["']module["']/);
    expect(html).not.toMatch(/id=["']root["']/);
    expect(html).toContain('href="styles.css"');
    expect(html).toContain('href="favicon.svg"');
    expect(css.length).toBeGreaterThan(400);
    expect(html).toMatch(/<title>[^<]*TableTrade/);
    expect(html).toMatch(/<h1>\s*TableTrade\s*<\/h1>/);
    expect(html).toContain("TableTrade");
    expect(html).toContain("Trade here, now.");
    expect(html).not.toMatch(/TablePing/);
    expect(html).not.toMatch(/NowTrade/);
    expect(html).not.toMatch(/tonight/i);
    expect(html).toContain("Central Alberta Technologies");
    expect(html).toContain("Lead Developer");
    expect(html).toContain("Matt Sumegi");
    expect(html).toContain("https://msumegi.github.io/tabletrade/");
    expect(html).toContain("https://msumegi.github.io/tableping/");
    expect(html).toMatch(/unofficial/i);
    expect(html).toMatch(/Nintendo|Pokémon Company|Pokemon Company/);
    expect(html).toContain("Open TableTrade");
    expect(html).not.toMatch(/Play Store|Google Play/i);
    expect(readme).toContain("https://msumegi.github.io/tabletrade/");
  });
});
