import { describe, expect, it } from "vitest";
import { shopHint } from "./copy";

describe("shop toggle hint", () => {
  it("shows the quiet line when the shop toggle is off", () => {
    expect(shopHint(false, "Off")).toBe("Your phone stays quiet. The app is off.");
  });

  it("keeps a location error visible after the toggle drops off", () => {
    expect(shopHint(false, "Location permission denied.")).toBe("Location permission denied.");
  });

  it("shows one ready line when the shop toggle is on", () => {
    expect(shopHint(true, "Off")).toBe("Ready to trade here.");
    expect(shopHint(true, "Ready to trade here.")).toBe("Ready to trade here.");
    expect(shopHint(true, "Looking around this shop…")).toBe("Looking around this shop…");
  });
});
