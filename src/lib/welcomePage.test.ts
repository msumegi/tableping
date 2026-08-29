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
    expect(html).toContain("TablePing");
    expect(html).toContain("Central Alberta Technologies");
    expect(html).toContain("Lead Developer");
    expect(html).toContain("Matt Sumegi");
    expect(html).toContain("https://msumegi.github.io/tableping/");
    expect(html).toMatch(/unofficial/i);
    expect(html).toMatch(/Nintendo|Pokémon Company|Pokemon Company/);
    expect(html).toContain("Open TablePing");
    expect(html).not.toMatch(/Play Store|Google Play/i);
  });

  it("keeps /welcome/ out of the PWA navigation fallback", () => {
    expect(vite).toContain("navigateFallbackDenylist");
    expect(vite).toMatch(/\/welcome/);
    expect(vite).toContain('globIgnores: ["**/welcome/**"]');
  });
});
