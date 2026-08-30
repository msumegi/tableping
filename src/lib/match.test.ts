import { describe, expect, it } from "vitest";
import { complementaryDemoPresence, DEMO_USER_ID, seedListsIfEmpty } from "./demo";
import { SAMPLE_CHARIZARD, SAMPLE_PIKACHU } from "./cards";
import { classifyKind, intersectHaveWant, matchAgainst } from "./match";
import { encodeGeohash, geohashNeighborhood, haversineMeters, MAX_MATCH_METERS, SHOP_PRECISION } from "./geo";
import { decodePresenceQr, encodePresenceQr } from "./qr";
import { normalizeTableCode } from "./tableCode";

const me = {
  userId: "matt",
  have: [SAMPLE_PIKACHU],
  want: [SAMPLE_CHARIZARD],
};

describe("trade matching", () => {
  it("returns null when lists do not overlap", () => {
    const lugia = { ...SAMPLE_PIKACHU, id: "neo1-9", name: "Lugia", number: "9" };
    const peer = {
      userId: "other",
      name: "Other",
      have: [lugia],
      want: [lugia],
      ts: 1,
    };
    expect(matchAgainst(me, peer, "table")).toBeNull();
  });

  it("detects they-want-yours", () => {
    const peer = {
      userId: "other",
      name: "Other",
      have: [],
      want: [SAMPLE_PIKACHU],
      ts: 1,
    };
    const match = matchAgainst(me, peer, "table");
    expect(match?.kind).toBe("they_want_yours");
    expect(match?.youCanGive.map((c) => c.id)).toEqual([SAMPLE_PIKACHU.id]);
    expect(match?.youCanGet).toEqual([]);
  });

  it("detects you-want-theirs", () => {
    const peer = {
      userId: "other",
      name: "Other",
      have: [SAMPLE_CHARIZARD],
      want: [],
      ts: 1,
    };
    const match = matchAgainst(me, peer, "shop");
    expect(match?.kind).toBe("you_want_theirs");
    expect(match?.youCanGet.map((c) => c.id)).toEqual([SAMPLE_CHARIZARD.id]);
  });

  it("detects a two-way trade", () => {
    const peer = {
      userId: "other",
      name: "Other",
      have: [SAMPLE_CHARIZARD],
      want: [SAMPLE_PIKACHU],
      ts: 1,
    };
    expect(matchAgainst(me, peer, "demo")?.kind).toBe("both");
  });

  it("matches printings by id, not by Pokémon name", () => {
    const otherPika = { ...SAMPLE_PIKACHU, id: "swsh4-66", setName: "Vivid Voltage" };
    const overlap = intersectHaveWant([SAMPLE_PIKACHU], [{ ...SAMPLE_PIKACHU, name: "Pikachu", id: otherPika.id }]);
    expect(overlap).toEqual([]);
    expect(intersectHaveWant([SAMPLE_PIKACHU], [SAMPLE_PIKACHU])).toHaveLength(1);
  });

  it("ignores your own presence", () => {
    const self = { userId: "matt", name: "Matt", have: [SAMPLE_CHARIZARD], want: [SAMPLE_PIKACHU], ts: 1 };
    expect(matchAgainst(me, self, "gps")).toBeNull();
  });

  it("classifies empty intersections as null", () => {
    expect(classifyKind([], [])).toBeNull();
  });
});

describe("demo trainer", () => {
  it("always complements the tester so a ping is guaranteed", () => {
    const demo = complementaryDemoPresence(me.have, me.want);
    expect(demo.userId).toBe(DEMO_USER_ID);
    const match = matchAgainst(me, demo, "demo");
    expect(match?.kind).toBe("both");
  });

  it("seeds sample Pikachu/Charizard when lists are empty", () => {
    const seeded = seedListsIfEmpty([], []);
    expect(seeded.seeded).toBe(true);
    expect(seeded.have[0].id).toBe(SAMPLE_PIKACHU.id);
    expect(seeded.want[0].id).toBe(SAMPLE_CHARIZARD.id);
  });
});

describe("in-room geo, not city-wide", () => {
  it("uses shop-scale precision 7 (~76m cells)", () => {
    expect(SHOP_PRECISION).toBe(7);
    expect(MAX_MATCH_METERS).toBeLessThanOrEqual(120);
  });

  it("keeps two shop-door coordinates in the same neighborhood", () => {
    // ~40m apart in Ottawa
    const a = encodeGeohash(45.4215, -75.6972);
    const b = encodeGeohash(45.4218, -75.6975);
    const near = new Set(geohashNeighborhood(a));
    expect(a).toHaveLength(7);
    expect(near.has(b) || a === b).toBe(true);
  });

  it("does not treat two cities as the same room", () => {
    const ottawa = encodeGeohash(45.4215, -75.6972);
    const toronto = encodeGeohash(43.6532, -79.3832);
    expect(ottawa).not.toBe(toronto);
    expect(geohashNeighborhood(ottawa)).not.toContain(toronto);
    const km = haversineMeters(45.4215, -75.6972, 43.6532, -79.3832) / 1000;
    expect(km).toBeGreaterThan(300);
  });
});

describe("qr payload", () => {
  it("round-trips a presence list", () => {
    const encoded = encodePresenceQr({
      userId: "x",
      name: "Matt",
      have: [SAMPLE_PIKACHU],
      want: [SAMPLE_CHARIZARD],
    });
    const decoded = decodePresenceQr(encoded);
    expect(decoded?.userId).toBe("x");
    expect(decoded?.have[0].id).toBe(SAMPLE_PIKACHU.id);
    expect(decoded?.want[0].id).toBe(SAMPLE_CHARIZARD.id);
  });

  it("rejects unrelated QR content", () => {
    expect(decodePresenceQr("https://example.com")).toBeNull();
  });
});

describe("table codes", () => {
  it("normalizes typed codes", () => {
    expect(normalizeTableCode(" ab-12 ")).toBe("AB12");
  });
});
