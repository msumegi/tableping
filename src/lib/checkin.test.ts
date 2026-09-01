import { describe, expect, it } from "vitest";
import { presenceMatchSource, sameCheckedInShop } from "./checkin";
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

describe("check-in is the room", () => {
  it("matches two people on the same shop id", () => {
    const them = peer({ shopId: "wizards-loft-red-deer" });
    expect(presenceMatchSource(them, { shopId: "wizards-loft-red-deer" })).toBe("shop");
    expect(sameCheckedInShop("wizards-loft-red-deer", them)).toBe(true);
  });

  it("does not treat GPS-only presence as in the room", () => {
    const them = peer({ lat: 52.27, lon: -113.82, geohash: "c3nfk3x" });
    expect(presenceMatchSource(them, { shopId: "wizards-loft-red-deer" })).toBeNull();
    expect(sameCheckedInShop("wizards-loft-red-deer", them)).toBe(false);
  });

  it("does not match different shops even when GPS is close", () => {
    const them = peer({ shopId: "djs-sports-cards-red-deer", lat: 52.27, lon: -113.82 });
    expect(presenceMatchSource(them, { shopId: "wizards-loft-red-deer" })).toBeNull();
  });

  it("does not match on a table code", () => {
    const them = peer({ room: "AB12" });
    expect(presenceMatchSource(them, { shopId: "wizards-loft-red-deer" })).toBeNull();
    expect(presenceMatchSource(them, {})).toBeNull();
  });
});
