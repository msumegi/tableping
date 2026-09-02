const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Shop-scale cell. Precision 7 is about 76m × 76m — a card shop, not a city. */
export const SHOP_PRECISION = 7;

export function encodeGeohash(lat: number, lon: number, precision = SHOP_PRECISION): string {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";

  let latMin = -90,
    latMax = 90;
  let lonMin = -180,
    lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (lon >= lonMid) {
        idx = idx * 2 + 1;
        lonMin = lonMid;
      } else {
        idx = idx * 2;
        lonMax = lonMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) {
        idx = idx * 2 + 1;
        latMin = latMid;
      } else {
        idx = idx * 2;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (++bit === 5) {
      geohash += BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }
  return geohash;
}

const NEIGHBOR: Record<"n" | "s" | "e" | "w", [string, string]> = {
  n: ["p0r21436x8zb9dcf5h7kjnmqesgutwvy", "bc01fg45238967deuvhjyznpkmstqrwx"],
  s: ["14365h7k9dcfesgujnmqp0r2twvyx8zb", "238967debc01fg45kmstqrwxuvhjyznp"],
  e: ["bc01fg45238967deuvhjyznpkmstqrwx", "p0r21436x8zb9dcf5h7kjnmqesgutwvy"],
  w: ["238967debc01fg45kmstqrwxuvhjyznp", "14365h7k9dcfesgujnmqp0r2twvyx8zb"],
};

const BORDER: Record<"n" | "s" | "e" | "w", [string, string]> = {
  n: ["prxz", "bcfguvyz"],
  s: ["028b", "0145hjnp"],
  e: ["bcfguvyz", "prxz"],
  w: ["0145hjnp", "028b"],
};

function adjacent(hash: string, dir: "n" | "s" | "e" | "w"): string {
  hash = hash.toLowerCase();
  const lastChr = hash.slice(-1);
  const type = hash.length % 2;
  const parent = hash.slice(0, -1);

  if (BORDER[dir][type].includes(lastChr) && parent) {
    return adjacent(parent, dir) + BASE32.charAt(NEIGHBOR[dir][type].indexOf(lastChr));
  }
  return parent + BASE32.charAt(NEIGHBOR[dir][type].indexOf(lastChr));
}

/** Center cell plus 8 neighbors so shop-door GPS jitter still matches. */
export function geohashNeighborhood(hash: string): string[] {
  const n = adjacent(hash, "n");
  const s = adjacent(hash, "s");
  return [
    hash,
    n,
    s,
    adjacent(hash, "e"),
    adjacent(hash, "w"),
    adjacent(n, "e"),
    adjacent(n, "w"),
    adjacent(s, "e"),
    adjacent(s, "w"),
  ];
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Hard cap so we never behave like a city-wide radar. Indoor GPS is messy. */
export const MAX_MATCH_METERS = 200;
