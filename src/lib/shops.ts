import { haversineMeters } from "./geo";

export type Shop = {
  id: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
};

export type RankedShop = Shop & {
  distanceM?: number;
  hinted: boolean;
};

/** Offer a shop as the hinted check-in when GPS is this close. Matching never uses this. */
export const HINT_METERS = 2000;

/**
 * Named shops for v1 check-in. GPS only ranks and hints.
 * Unused catalog. Check-in is close-by location, not these shop ids.
 */
export const SHOPS: Shop[] = [
  {
    id: "djs-sports-cards-red-deer",
    name: "D J’s Sports Cards Comics",
    city: "Red Deer",
    lat: 52.2665651,
    lon: -113.8288881,
  },
  {
    id: "wizards-loft-red-deer",
    name: "Wizard’s Loft",
    city: "Red Deer",
    lat: 52.271835,
    lon: -113.818763,
  },
  {
    id: "holmestead-red-deer",
    name: "Holmestead Sports Cards",
    city: "Red Deer",
    lat: 52.2899982,
    lon: -113.8342308,
  },
  {
    id: "sentry-box-calgary",
    name: "The Sentry Box",
    city: "Calgary",
    lat: 51.0441975,
    lon: -114.1035337,
  },
  {
    id: "shoebox-games-calgary",
    name: "ShoeBox Games & Cafe",
    city: "Calgary",
    lat: 51.0874,
    lon: -114.0482,
  },
  {
    id: "warp-1-edmonton",
    name: "Warp 1 Comics and Games",
    city: "Edmonton",
    lat: 53.5178166,
    lon: -113.4869214,
  },
  {
    id: "happy-harbor-edmonton",
    name: "Happy Harbor Comics",
    city: "Edmonton",
    lat: 53.5521044,
    lon: -113.5354783,
  },
];

export function shopById(id: string | undefined): Shop | undefined {
  if (!id) return undefined;
  return SHOPS.find((shop) => shop.id === id);
}

export function shopSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function customShop(name: string): Shop | null {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const slug = shopSlug(trimmed);
  if (slug.length < 3) return null;
  return {
    id: `name:${slug}`,
    name: trimmed,
    city: "This shop",
    lat: 0,
    lon: 0,
  };
}

export function resolveShopInput(raw: string): Shop | null {
  const q = raw.trim();
  if (!q) return null;
  const slug = shopSlug(q);
  const listed = SHOPS.find(
    (shop) => shop.id === slug || shopSlug(shop.name) === slug || shop.name.toLowerCase() === q.toLowerCase(),
  );
  return listed ?? customShop(q);
}

function matchesQuery(shop: Shop, query: string): boolean {
  if (!query) return true;
  const hay = `${shop.name} ${shop.city}`.toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((part) => hay.includes(part));
}

export function rankShops(here?: { lat: number; lon: number } | null, query = ""): RankedShop[] {
  const rows: RankedShop[] = SHOPS.filter((shop) => matchesQuery(shop, query)).map((shop) => {
    const distanceM = here ? haversineMeters(here.lat, here.lon, shop.lat, shop.lon) : undefined;
    return { ...shop, distanceM, hinted: false };
  });
  rows.sort((a, b) => {
    if (a.distanceM != null && b.distanceM != null) return a.distanceM - b.distanceM;
    if (a.distanceM != null) return -1;
    if (b.distanceM != null) return 1;
    return a.name.localeCompare(b.name);
  });
  if (rows[0] && rows[0].distanceM != null && rows[0].distanceM <= HINT_METERS) {
    rows[0].hinted = true;
  }
  return rows;
}

export function hintedShop(here: { lat: number; lon: number }): Shop | null {
  const ranked = rankShops(here);
  return ranked[0]?.hinted ? ranked[0] : null;
}

export function formatShopDistance(meters: number | undefined): string {
  if (meters == null) return "";
  if (meters < 80) return "Right here";
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
