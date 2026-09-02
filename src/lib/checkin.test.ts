import { describe, expect, it } from "vitest";
import { presenceDistanceM, presenceMatchSource } from "./checkin";
import { MAX_MATCH_METERS } from "./geo";
import type { Presence } from "../types";

function peer(partial: Partial<Presence>): Presence {
  return {
    userId: "other",
    name: "Kai",
    have: [],
    want: [],
    ts: 1,
    ...partial,
  };
}

const here = { lat: 52.2681, lon: -113.8112 };

describe("close-by check-in", () => {
  it("matches two people within the radius", () => {
    const them = peer({ lat: 52.2682, lon: -113.8113 });
    expect(presenceMatchSource(them, here)).toBe("gps");
    expect(presenceDistanceM(them, here)).toBeLessThan(MAX_MATCH_METERS);
  });

  it("does not match across town", () => {
    const them = peer({ lat: 51.0447, lon: -114.0719 });
    expect(presenceMatchSource(them, here)).toBeNull();
  });

  it("does not match on a shop name without location", () => {
    const them = peer({ shopId: "wizards-loft-red-deer", shopName: "Wizard’s Loft" });
    expect(presenceMatchSource(them, here)).toBeNull();
    expect(presenceMatchSource(them, {})).toBeNull();
  });

  it("does not match on a table code", () => {
    const them = peer({ room: "AB12" });
    expect(presenceMatchSource(them, here)).toBeNull();
  });
});
