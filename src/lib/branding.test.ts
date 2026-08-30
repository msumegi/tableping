import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const manifest = readFileSync(join(root, "public/manifest.webmanifest"), "utf8");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");

describe("player-facing name is TableTrade", () => {
  it("uses TableTrade in the PWA document, install name, and share tags", () => {
    expect(indexHtml).toMatch(/<title>TableTrade<\/title>/);
    expect(indexHtml).toContain('content="TableTrade"');
    expect(indexHtml).toContain('apple-mobile-web-app-title');
    expect(indexHtml).toContain('property="og:title"');
    expect(indexHtml).toContain('property="og:site_name" content="TableTrade"');
    expect(indexHtml).not.toMatch(/TablePing/);
    expect(indexHtml).toContain("https://msumegi.github.io/tableping/");

    const parsed = JSON.parse(manifest) as { name: string; short_name: string; description: string };
    expect(parsed.name).toBe("TableTrade");
    expect(parsed.short_name).toBe("TableTrade");
    expect(parsed.description).toMatch(/TableTrade|Pokémon trades here/i);
    expect(manifest).not.toMatch(/TablePing/i);

    expect(app).toContain("TableTrade");
    expect(app).not.toMatch(/TablePing/);
  });
});
