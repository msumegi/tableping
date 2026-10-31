import type { Card } from "../types";
import { LOCAL_CARDS } from "./localCatalog";
import { POKEMON_SPECIES } from "./pokemonNames";
import { normalizeName, rankByCollectorNumber } from "./scanMatch";

const POKEMON_TCG = "https://api.pokemontcg.io/v2";
const TCGDEX = "https://api.tcgdex.net/v2/en";
const TCGDEX_ID_PREFIX = "tcgdex:";
const SEARCH_TIMEOUT_MS = 6000;

/** Shown when the live catalog is down and the name is not in the local list. */
export const SEARCH_UNAVAILABLE =
  "Can't reach the card list right now. Try a well-known name like Pikachu, or check your connection.";

const CATALOG_CACHE = "tableping.catalogCache.v1";

function readCatalogCache(): Record<string, Card[]> {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Card[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCatalogCache(map: Record<string, Card[]>): void {
  try {
    const keys = Object.keys(map);
    const trimmed: Record<string, Card[]> = {};
    for (const key of keys.slice(-80)) trimmed[key] = map[key];
    localStorage.setItem(CATALOG_CACHE, JSON.stringify(trimmed));
  } catch {
    /* quota */
  }
}

function cacheKey(query: string): string {
  return query.trim().toLowerCase();
}

function cachedCards(query: string): Card[] {
  if (typeof localStorage === "undefined") return [];
  const hit = readCatalogCache()[cacheKey(query)];
  return Array.isArray(hit) ? hit : [];
}

function rememberCards(query: string, cards: Card[]): void {
  if (typeof localStorage === "undefined" || !cards.length) return;
  const map = readCatalogCache();
  map[cacheKey(query)] = cards;
  writeCatalogCache(map);
}

type PtcgCard = {
  id?: string;
  name?: string;
  number?: string;
  set?: { name?: string; id?: string };
  images?: { small?: string; large?: string };
};

type TcgdexCard = {
  id?: string;
  localId?: string | number;
  name?: string;
  image?: string;
  set?: { id?: string; name?: string };
};

let tcgdexSetNames: Map<string, string> | null = null;

function tcgdexSetId(id: string, localId: string): string {
  const suffix = `-${localId}`;
  if (localId && id.endsWith(suffix)) return id.slice(0, -suffix.length);
  const cut = id.lastIndexOf("-");
  return cut > 0 ? id.slice(0, cut) : id;
}

function tcgdexThumb(base: string): string {
  return `${base.replace(/\/+$/, "")}/low.webp`;
}

function fromTcgdex(raw: TcgdexCard, sets: Map<string, string>): Card | null {
  if (!raw.id || !raw.name || !raw.image) return null;
  const localId = raw.localId == null ? "" : String(raw.localId);
  const setId = raw.set?.id || tcgdexSetId(raw.id, localId);
  return {
    id: `${TCGDEX_ID_PREFIX}${raw.id}`,
    name: raw.name,
    image: tcgdexThumb(raw.image),
    setName: raw.set?.name || sets.get(setId) || "",
    number: localId,
  };
}

async function loadTcgdexSetNames(): Promise<Map<string, string>> {
  if (tcgdexSetNames) return tcgdexSetNames;
  const res = await fetchWithTimeout(`${TCGDEX}/sets`);
  if (!res.ok) throw new Error(`TCGdex sets failed (${res.status})`);
  const body = (await res.json()) as { id?: string; name?: string }[];
  if (!Array.isArray(body)) throw new Error("TCGdex sets returned an unexpected response");
  const map = new Map<string, string>();
  for (const set of body) {
    if (set?.id && set?.name) map.set(set.id, set.name);
  }
  tcgdexSetNames = map;
  return map;
}

function fromPtcg(raw: PtcgCard): Card | null {
  const image = raw.images?.small || raw.images?.large || "";
  if (!raw.id || !raw.name || !image) return null;
  return {
    id: raw.id,
    name: raw.name,
    image,
    setName: raw.set?.name || "",
    number: String(raw.number ?? ""),
  };
}

const VARIANT_WORDS = new Set(["vmax", "vstar", "vunion", "gx", "ex", "v", "break", "prime"]);

const SPECIES_NORMS = new Set(POKEMON_SPECIES.map((name) => normalizeName(name)));
SPECIES_NORMS.add("nidoran");

export type CatalogQuery = { name: string; set?: string };

function luceneClean(raw: string): string {
  return raw.replace(/[:"*?\\()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
}

function luceneNameQuery(raw: string): string {
  const cleaned = luceneClean(raw);
  if (!cleaned) return "name:*";
  if (cleaned.includes(" ")) return `name:"${cleaned}*"`;
  return `name:${cleaned}*`;
}

/** Split `umbreon evolving skies` into a Pokémon name and a set phrase. */
export function parseCatalogQuery(query: string): CatalogQuery {
  const trimmed = query.trim();
  if (!trimmed) return { name: "" };
  const words = trimmed.split(/\s+/);
  const firstNorm = normalizeName(words[0] ?? "");
  if (!firstNorm || !SPECIES_NORMS.has(firstNorm)) return { name: trimmed };

  let nameWords = 1;
  const secondNorm = normalizeName(words[1] ?? "");
  if (words.length >= 2 && VARIANT_WORDS.has(secondNorm)) nameWords = 2;
  if (nameWords >= words.length) return { name: trimmed };
  return {
    name: words.slice(0, nameWords).join(" "),
    set: words.slice(nameWords).join(" "),
  };
}

function luceneCatalogQuery(raw: string): string {
  const parsed = parseCatalogQuery(raw);
  const nameClause = luceneNameQuery(parsed.name);
  if (!parsed.set) return nameClause;
  const setClean = luceneClean(parsed.set);
  if (!setClean) return nameClause;
  const setFirst = setClean.split(" ")[0] ?? setClean;
  return `${nameClause} (set.name:"${setClean}*" OR set.name:${setFirst}*)`;
}

export function cardMatchesQuery(card: Card, query: string): boolean {
  const parsed = parseCatalogQuery(query);
  const nameQ = parsed.name.trim().toLowerCase();
  if (nameQ.length < 2) return false;
  const cardName = card.name.toLowerCase();
  const nameTokens = nameQ.split(/\s+/).filter((w) => w.length >= 2);
  if (!cardName.includes(nameQ) && !nameTokens.every((w) => cardName.includes(w))) return false;
  if (!parsed.set) return true;
  const setHay = `${card.setName} ${card.number}`.toLowerCase();
  const setTokens = parsed.set
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  return setTokens.every((w) => setHay.includes(w));
}

async function fetchWithTimeout(url: string, timeoutMs = SEARCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function dedupeCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

export function searchLocalCatalog(query: string): Card[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const hits = LOCAL_CARDS.filter((card) => cardMatchesQuery(card, q));
  return rankSearchResults(query, dedupeCards(hits)).slice(0, 36);
}

async function searchPokemonTcgLucene(lucene: string): Promise<Card[]> {
  const params = new URLSearchParams({
    q: lucene,
    pageSize: "40",
  });
  const res = await fetchWithTimeout(`${POKEMON_TCG}/cards?${params}`);
  if (!res.ok) {
    throw new Error(`Card search failed (${res.status})`);
  }
  const body = (await res.json()) as { data?: PtcgCard[] };
  if (!Array.isArray(body?.data)) {
    throw new Error("Card search returned an unexpected response");
  }
  return dedupeCards(body.data.map(fromPtcg).filter((card): card is Card => card !== null));
}

async function searchPokemonTcgApi(query: string): Promise<Card[]> {
  return searchPokemonTcgLucene(luceneCatalogQuery(query));
}

async function searchTcgdex(query: string): Promise<Card[]> {
  const parsed = parseCatalogQuery(query);
  const name = (parsed.name || query).trim();
  if (name.length < 2) return [];
  const params = new URLSearchParams({ name });
  const [sets, res] = await Promise.all([
    loadTcgdexSetNames(),
    fetchWithTimeout(`${TCGDEX}/cards?${params}`),
  ]);
  if (!res.ok) throw new Error(`TCGdex search failed (${res.status})`);
  const body = (await res.json()) as TcgdexCard[];
  if (!Array.isArray(body)) throw new Error("TCGdex search returned an unexpected response");
  return dedupeCards(body.map((raw) => fromTcgdex(raw, sets)).filter((card): card is Card => card !== null));
}

function sameCollectorNumber(cardNumber: string, scanned: string): boolean {
  const key = (raw: string) => {
    const trimmed = raw.trim();
    return /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed.toLowerCase();
  };
  return key(cardNumber) === key(scanned) && key(scanned).length > 0;
}

function takeMatches(query: string, cards: Card[]): Card[] | null {
  const matched = cards.filter((card) => cardMatchesQuery(card, query));
  if (!matched.length) return null;
  const ranked = rankSearchResults(query, matched).slice(0, 36);
  rememberCards(query, ranked);
  return ranked;
}

/** Match a camera read to printings. Number is used when OCR saw 58/102 (etc). */
export async function findCardsFromScan(name: string, number?: string): Promise<Card[]> {
  const q = name.trim();
  if (q.length < 2) return [];
  const num = number && /^\d+$/.test(number.trim()) ? String(parseInt(number.trim(), 10)) : number?.trim();
  const rank = (cards: Card[]) => rankByCollectorNumber(rankSearchResults(q, cards), number).slice(0, 12);

  try {
    if (num) {
      try {
        const live = await searchTcgdex(q);
        const precise = live.filter((card) => sameCollectorNumber(card.number, num));
        if (precise.length) return rank(precise);
      } catch {
        try {
          const precise = await searchPokemonTcgLucene(`${luceneNameQuery(q)} number:${num}`);
          if (precise.length) return rank(precise);
        } catch {
          /* name-only next */
        }
      }
    }
    try {
      const byName = await searchTcgdex(q);
      const matched = byName.filter((card) => cardMatchesQuery(card, q));
      const pool = matched.length ? matched : byName;
      if (pool.length) return rank(pool);
    } catch {
      const byName = await searchPokemonTcgApi(q);
      if (byName.length) return rank(byName);
    }
    return rank(searchLocalCatalog(q));
  } catch {
    const local = searchLocalCatalog(q);
    if (local.length) return rank(local);
    throw new Error(SEARCH_UNAVAILABLE);
  }
}

export async function searchCards(query: string): Promise<Card[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const parsed = parseCatalogQuery(q);
  const local = searchLocalCatalog(q);
  const cached = cachedCards(q);

  try {
    const remote = await searchTcgdex(q);
    const hit = takeMatches(q, remote);
    if (hit) return hit;
  } catch {
    try {
      const remote = await searchPokemonTcgApi(q);
      const hit = takeMatches(q, remote);
      if (hit) return hit;
      if (parsed.set) {
        const byName = await searchPokemonTcgLucene(luceneNameQuery(parsed.name));
        const widened = takeMatches(q, byName);
        if (widened) return widened;
      }
    } catch {
      /* local list below */
    }
  }
  if (cached.length) return cached;
  if (local.length) return local;
  throw new Error(SEARCH_UNAVAILABLE);
}

export function rankSearchResults(query: string, cards: Card[]): Card[] {
  const parsed = parseCatalogQuery(query);
  const nameQ = parsed.name.trim().toLowerCase();
  const setQ = parsed.set?.trim().toLowerCase() ?? "";
  const setWords = setQ.split(/\s+/).filter((w) => w.length >= 2);

  const nameScore = (name: string) => {
    const n = name.toLowerCase();
    if (n === nameQ) return 0;
    if (n.startsWith(nameQ + " ")) return 1;
    if (n.startsWith(nameQ)) return 2;
    if (n.includes(nameQ)) return 3;
    return 4;
  };

  const setScore = (setName: string) => {
    if (!setWords.length) return 0;
    const s = setName.toLowerCase();
    if (s === setQ) return 0;
    if (s.includes(setQ)) return 1;
    if (setWords.every((w) => s.includes(w))) return 2;
    return 8;
  };

  return [...cards].sort((a, b) => {
    const setDiff = setScore(a.setName) - setScore(b.setName);
    if (setDiff !== 0) return setDiff;
    const nameDiff = nameScore(a.name) - nameScore(b.name);
    if (nameDiff !== 0) return nameDiff;
    return a.id.localeCompare(b.id);
  });
}

export async function hydrateSetName(card: Card): Promise<Card> {
  if (card.setName) return card;
  if (card.id.startsWith(TCGDEX_ID_PREFIX)) {
    try {
      const rawId = card.id.slice(TCGDEX_ID_PREFIX.length);
      const res = await fetchWithTimeout(`${TCGDEX}/cards/${encodeURIComponent(rawId)}`);
      if (!res.ok) return card;
      const body = (await res.json()) as TcgdexCard;
      const sets = await loadTcgdexSetNames().catch(() => new Map<string, string>());
      const mapped = fromTcgdex(body, sets);
      if (!mapped) return card;
      return {
        ...card,
        setName: mapped.setName || card.setName,
        number: mapped.number || card.number,
        image: mapped.image || card.image,
      };
    } catch {
      return card;
    }
  }
  try {
    const res = await fetchWithTimeout(`${POKEMON_TCG}/cards/${encodeURIComponent(card.id)}`);
    if (!res.ok) return card;
    const body = (await res.json()) as { data?: PtcgCard };
    const raw = body.data;
    if (!raw) return card;
    const mapped = fromPtcg(raw);
    if (!mapped) return card;
    return {
      ...card,
      setName: mapped.setName || card.setName,
      number: mapped.number || card.number,
      image: mapped.image || card.image,
    };
  } catch {
    return card;
  }
}

function mustLocal(id: string): Card {
  const card = LOCAL_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`Missing local card ${id}`);
  return card;
}

/** Starter printings used by demo mode when lists are empty. */
export const SAMPLE_PIKACHU: Card = mustLocal("base1-58");
export const SAMPLE_CHARIZARD: Card = mustLocal("base1-4");

export const QUICK_SEARCHES = [
  "Pikachu",
  "Charizard",
  "Mew",
  "Umbreon",
  "Gardevoir",
  "Miraidon",
  "Dragapult",
  "Lugia",
];
