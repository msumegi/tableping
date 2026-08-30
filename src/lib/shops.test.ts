import { describe, expect, it } from "vitest";
import { haversineMeters } from "./geo";
import {
  customShop,
  formatShopDistance,
  hintedShop,
  HINT_METERS,
  rankShops,
  resolveShopInput,
  shopById,
  shopSlug,
  SHOPS,
} from "./shops";

const djs = shopById("djs-sports-cards-red-deer")!;
const loft = shopById("wizards-loft-red-deer")!;

describe("shop catalog", () => {
  it("has unique ids and named Central Alberta shops", () => {
    const ids = SHOPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SHOPS.some((s) => s.city === "Red Deer")).toBe(true);
    expect(djs.name).toMatch(/Sports Cards/);
  });

  it("hints the shop from a parking-lot offset, not a city away", () => {
    const lot = { lat: djs.lat + 0.0008, lon: djs.lon - 0.0006 };
    expect(haversineMeters(djs.lat, djs.lon, lot.lat, lot.lon)).toBeLessThan(HINT_METERS);
    expect(hintedShop(lot)?.id).toBe(djs.id);

    const whyteAve = { lat: 53.5179, lon: -113.4868 };
    expect(hintedShop(whyteAve)?.city).toBe("Edmonton");
    expect(hintedShop(whyteAve)?.id).not.toBe(djs.id);
    expect(hintedShop({ lat: 53.5461, lon: -113.4938 })).toBeNull();
  });

  it("ranks by distance and only marks the nearest in-range shop as hinted", () => {
    const ranked = rankShops({ lat: loft.lat, lon: loft.lon });
    expect(ranked[0].id).toBe(loft.id);
    expect(ranked[0].hinted).toBe(true);
    expect(ranked.filter((s) => s.hinted)).toHaveLength(1);
  });

  it("filters by name without inventing a GPS pin", () => {
    const found = rankShops(null, "sentry");
    expect(found.map((s) => s.id)).toEqual(["sentry-box-calgary"]);
    expect(found[0].hinted).toBe(false);
    expect(found[0].distanceM).toBeUndefined();
  });
});

describe("typed shop names", () => {
  it("slugs a spoken shop name", () => {
    expect(shopSlug("D J’s Sports Cards")).toBe("d-js-sports-cards");
  });

  it("resolves a catalog name and a custom name to stable ids", () => {
    expect(resolveShopInput("Wizard’s Loft")?.id).toBe("wizards-loft-red-deer");
    const custom = customShop("The Felt Table");
    expect(custom?.id).toBe("name:the-felt-table");
    expect(resolveShopInput("The Felt Table")?.id).toBe(custom?.id);
    expect(customShop("ab")).toBeNull();
  });
});

describe("distance copy", () => {
  it("stays short", () => {
    expect(formatShopDistance(40)).toBe("Right here");
    expect(formatShopDistance(240)).toBe("240 m");
    expect(formatShopDistance(2400)).toBe("2.4 km");
  });
});
