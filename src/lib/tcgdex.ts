import type { Card } from "../types";
import setMap from "./tcgdexSetMap.json";

/**
 * English TCGdex set id → pokemontcg.io set id and set name.
 * Built from both catalogs' set lists (normalized name plus card count).
 * Pokémon Futsal matches on that unique word plus an equal 5-card count.
 * 177 of 221 English TCGdex sets match. The other 44, including Pokémon TCG
 * Pocket and most trainer kits, are left out so a card never gets an id that
 * would miss on another phone.
 */
export const TCGDEX_SET_MAP: Record<string, { ptcg: string; name: string }> = setMap;

export const TCGDEX_ENGLISH_SETS = 221;
export const TCGDEX_MAPPED_SETS = 177;

export const TCGDEX_API_ORIGIN = "https://api.tcgdex.net";
export const TCGDEX_ASSET_ORIGIN = "https://assets.tcgdex.net";

const TCGDEX_CARDS = `${TCGDEX_API_ORIGIN}/v2/en/cards`;

/**
 * Chrome 69 paints WebP (since Chrome 32). List tiles use /low.webp.
 * The large picture of the same card is the same base with /high.webp.
 */
export function tcgdexThumbUrl(imageBase: string): string {
  return `${imageBase.replace(/\/+$/, "")}/low.webp`;
}

/** Purely numeric collector numbers drop leading zeros. Promo text such as SWSH050 stays. */
export function collectorNumber(localId: string): string {
  if (/^\d+$/.test(localId)) return String(parseInt(localId, 10));
  return localId;
}

export function fromTcgdexBrief(raw: unknown): Card | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    id?: unknown;
    localId?: unknown;
    name?: unknown;
    image?: unknown;
    rarity?: unknown;
  };
  if (typeof row.id !== "string" || typeof row.localId !== "string") return null;
  if (typeof row.name !== "string" || typeof row.image !== "string") return null;
  const name = row.name.trim();
  const image = row.image.trim();
  if (!name || !image) return null;
  const suffix = `-${row.localId}`;
  if (!row.id.endsWith(suffix)) return null;
  const tcgdexSetId = row.id.slice(0, -suffix.length);
  const mapped = TCGDEX_SET_MAP[tcgdexSetId];
  if (!mapped) return null;
  const number = collectorNumber(row.localId);
  if (!number) return null;
  const card: Card = {
    id: `${mapped.ptcg}-${number}`,
    name,
    image: tcgdexThumbUrl(image),
    setName: mapped.name,
    number,
  };
  if (typeof row.rarity === "string" && row.rarity.trim()) card.rarity = row.rarity.trim();
  return card;
}

export async function searchTcgdexByName(name: string, timeoutMs: number): Promise<Card[]> {
  const q = name.trim();
  if (q.length < 2 || timeoutMs < 200) throw new Error("TCGdex search skipped");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${TCGDEX_CARDS}?name=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`TCGdex search failed (${res.status})`);
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) throw new Error("TCGdex search returned an unexpected response");
    const seen = new Set<string>();
    const cards: Card[] = [];
    for (const raw of body) {
      const card = fromTcgdexBrief(raw);
      if (!card || seen.has(card.id)) continue;
      seen.add(card.id);
      cards.push(card);
    }
    return cards;
  } finally {
    clearTimeout(timer);
  }
}
