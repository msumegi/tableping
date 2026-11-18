import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "acorn";

/** Chrome 69 parses ES2018. It does not parse ??, ?., or other ES2020 syntax. */
export function assertChrome69Syntax(code, filename = "input") {
  try {
    parse(code, { ecmaVersion: 2018, sourceType: "module" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${filename}: Chrome 69 syntax check failed: ${message}`);
  }
}

export function checkDist(distDir) {
  const assets = path.join(distDir, "assets");
  if (!existsSync(assets)) return { checked: 0, skipped: true };
  const files = readdirSync(assets).filter((name) => name.endsWith(".js"));
  if (files.length === 0) {
    throw new Error(`${assets} has no JavaScript files`);
  }
  for (const name of files) {
    const full = path.join(assets, name);
    assertChrome69Syntax(readFileSync(full, "utf8"), full);
  }
  return { checked: files.length, skipped: false };
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  const requireDist = process.argv.includes("--require");
  const distArg = process.argv.slice(2).find((arg) => arg !== "--require");
  const distDir = path.resolve(distArg || "dist");
  const result = checkDist(distDir);
  if (result.skipped) {
    if (requireDist) {
      console.error(`chrome69 syntax: no JS in ${path.join(distDir, "assets")}`);
      process.exit(1);
    }
    console.log("chrome69 syntax: no dist yet, skipped");
  } else {
    console.log(`chrome69 syntax: ${result.checked} file(s) parse as ES2018`);
  }
}
