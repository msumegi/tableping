import { describe, expect, it } from "vitest";
import { PERMISSION_LOCATION, PERMISSION_NEARBY } from "./copy";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { permissionDenied, resumePermission, showLocationAsk, tapLooking, type PermissionUi } from "./nearbyPermission";

const idle: PermissionUi = { looking: false, hint: "", block: null, requests: 0 };

describe("location permission", () => {
  it("asks once on deny, then stays stopped with the Allow Location message", () => {
    const asking = tapLooking(idle);
    expect(asking.requests).toBe(1);
    const denied = permissionDenied(asking, { blocked: false, needsLocation: true });
    expect(denied.requests).toBe(1);
    expect(denied.looking).toBe(false);
    expect(denied.block).toBe("permission");
    expect(denied.hint).toBe(PERMISSION_LOCATION);
    const back = resumePermission(denied, false);
    expect(back.requests).toBe(1);
    expect(back.looking).toBe(false);
    expect(back.hint).toBe(PERMISSION_LOCATION);
    expect(back.block).toBe("permission");
  });

  it("uses Nearby devices wording on Android 12 and newer", () => {
    const denied = permissionDenied(tapLooking(idle), { blocked: false, needsLocation: false });
    expect(denied.hint).toBe(PERMISSION_NEARBY);
  });

  it("permanent deny shows the settings path and the Allow Location sentence, never Turning looking on", () => {
    const blocked = permissionDenied(tapLooking(idle), { blocked: true, needsLocation: true });
    expect(blocked.looking).toBe(false);
    expect(blocked.block).toBe("settings");
    expect(blocked.hint).toBe(PERMISSION_LOCATION);
    expect(blocked.hint).not.toMatch(/Turning looking on/);
    expect(blocked.requests).toBe(1);
    const stillDenied = resumePermission(blocked, false);
    expect(stillDenied.requests).toBe(1);
    expect(stillDenied.hint).toBe(PERMISSION_LOCATION);
    expect(stillDenied.block).toBe("settings");
    const granted = resumePermission(blocked, true);
    expect(granted.looking).toBe(false);
    expect(granted.hint).toBe("");
    expect(granted.block).toBeNull();
    expect(granted.requests).toBe(1);
  });

  it("hides the Location explanation after a denial", () => {
    expect(showLocationAsk(true, null)).toBe(true);
    expect(showLocationAsk(true, "permission")).toBe(false);
    expect(showLocationAsk(true, "settings")).toBe(false);
    expect(showLocationAsk(false, null)).toBe(false);
  });

  it("keeps the tab bar on screen by scrolling the middle, without requiring dvh", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../index.css"), "utf8");
    const beforeSupports = css.slice(0, css.indexOf("@supports (height: 100dvh)"));
    expect(beforeSupports).not.toMatch(/100dvh/);
    expect(css).toMatch(/@supports\s*\(\s*height:\s*100dvh\s*\)/);
    expect(css).toMatch(/grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/);
    expect(css).toMatch(/\.screen\s*\{[^}]*min-height:\s*0/);
    expect(css).toMatch(/\.screen\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.screen\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/);
  });
});
