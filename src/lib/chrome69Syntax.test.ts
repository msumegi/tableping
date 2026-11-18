import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// Plain script so `node scripts/chrome69-syntax.mjs` can run without a TypeScript loader.
// @ts-expect-error no declaration file for the checker script
import { assertChrome69Syntax, checkDist } from "../../scripts/chrome69-syntax.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Chrome 69 syntax", () => {
  it("rejects nullish coalescing and optional chaining", () => {
    expect(() => assertChrome69Syntax("const a = b ?? c;\n")).toThrow(/Chrome 69/);
    expect(() => assertChrome69Syntax("const a = obj?.name;\n")).toThrow(/Chrome 69/);
    expect(() => assertChrome69Syntax("obj.method?.();\n")).toThrow(/Chrome 69/);
  });

  it("accepts ES2018, including ternaries and object spread", () => {
    expect(() =>
      assertChrome69Syntax("const a = b ? c : d;\nconst o = { ...b, c: 1 };\nasync function f() { await 1; }\n"),
    ).not.toThrow();
  });

  it("parses dist/assets JavaScript as ES2018 when a production build is present", () => {
    const result = checkDist(path.join(root, "dist"));
    if (result.skipped) return;
    expect(result.checked).toBeGreaterThan(0);
  });
});
