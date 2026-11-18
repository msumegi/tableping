import type { Card } from "../types";
import { LOCAL_CARDS } from "./localCatalog";
import { POKEMON_SPECIES } from "./pokemonNames";
import { normalizeName, rankByCollectorNumber } from "./scanMatch";
import { searchTcgdexByName } from "./tcgdex";

const POKEMON_TCG = "https://api.pokemontcg.io/v2";
const SEARCH_TIMEOUT_MS = 8000;
/**
 * A dead pokemontcg.io gets this long, then TCGdex uses whatever is left of
 * CATALOG_BUDGET_MS. Worst case stays at today's 8s timeout plus about 1s.
 */
export const PRIMARY_CATALOG_TIMEOUT_MS = 3500;
export const CATALOG_BUDGET_MS = SEARCH_TIMEOUT_MS + 1000;

/** Shown when the live catalog is down and the name is not in the local list. */
export const SEARCH_UNAVAILABLE =
  "Can't reach the card list right now. Try a well-known name like Pikachu, or check your connection.";

export type CardSearchResult = { cards: Card[]; savedOnly: boolean };

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

function startBudget(): { started: number } {
  return { started: Date.now() };
}

function budgetLeft(budget: { started: number }): number {
  return Math.max(0, CATALOG_BUDGET_MS - (Date.now() - budget.started));
}

/** Primary first. TCGdex runs only after an error, a non-2xx, or a timeout. */
async function primaryThenTcgdex(
  budget: { started: number },
  primary: (timeoutMs: number) => Promise<Card[]>,
  backupName: string,
  number?: string,
): Promise<Card[]> {
  const primaryMs = Math.min(PRIMARY_CATALOG_TIMEOUT_MS, budgetLeft(budget));
  try {
    if (primaryMs < 200) throw new Error("catalog budget");
    return await primary(primaryMs);
  } catch {
    const left = budgetLeft(budget);
    if (left < 200) throw new Error("catalog budget");
    const cards = await searchTcgdexByName(backupName, left);
    if (!number) return cards;
    const wanted = /^\d+$/.test(number) ? String(parseInt(number, 10)) : number;
    return cards.filter((card) => card.number.toLowerCase() === wanted.toLowerCase());
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

async function searchPokemonTcgLucene(lucene: string, timeoutMs = SEARCH_TIMEOUT_MS): Promise<Card[]> {
  const params = new URLSearchParams({
    q: lucene,
    pageSize: "40",
  });
  const res = await fetchWithTimeout(`${POKEMON_TCG}/cards?${params}`, timeoutMs);
  if (!res.ok) {
    throw new Error(`Card search failed (${res.status})`);
  }
  const body = (await res.json()) as { data?: PtcgCard[] };
  if (!Array.isArray(body?.data)) {
    throw new Error("Card search returned an unexpected response");
  }
  return dedupeCards(body.data.map(fromPtcg).filter((card): card is Card => card !== null));
}

async function searchPokemonTcgApi(query: string, timeoutMs = SEARCH_TIMEOUT_MS): Promise<Card[]> {
  return searchPokemonTcgLucene(luceneCatalogQuery(query), timeoutMs);
}

/** Match a camera read to printings. Number is used when OCR saw 58/102 (etc). */
export async function findCardsFromScan(name: string, number?: string): Promise<Card[]> {
  const q = name.trim();
  if (q.length < 2) return [];
  const budget = startBudget();
  const wanted = number?.trim();

  try {
    if (wanted) {
      const num = /^\d+$/.test(wanted) ? String(parseInt(wanted, 10)) : wanted;
      try {
        const precise = await primaryThenTcgdex(
          budget,
          (ms) => searchPokemonTcgLucene(`${luceneNameQuery(q)} number:${num}`, ms),
          q,
          num,
        );
        if (precise.length) return rankByCollectorNumber(rankSearchResults(q, precise), number).slice(0, 12);
      } catch {
        /* name-only next */
      }
    }
    const byName = await primaryThenTcgdex(budget, (ms) => searchPokemonTcgApi(q, ms), q);
    if (byName.length) return rankByCollectorNumber(rankSearchResults(q, byName), number).slice(0, 12);
    return rankByCollectorNumber(searchLocalCatalog(q), number).slice(0, 12);
  } catch {
    const local = searchLocalCatalog(q);
    if (local.length) return rankByCollectorNumber(local, number).slice(0, 12);
    throw new Error(SEARCH_UNAVAILABLE);
  }
}

export async function searchCards(query: string): Promise<Card[]> {
  return (await searchCardList(query)).cards;
}

export async function searchCardList(query: string): Promise<CardSearchResult> {
  const q = query.trim();
  if (q.length < 2) return { cards: [], savedOnly: false };
  const parsed = parseCatalogQuery(q);
  const local = searchLocalCatalog(q);
  const cached = cachedCards(q);
  const budget = startBudget();
  const backupName = parsed.name || q;

  try {
    const remote = await primaryThenTcgdex(budget, (ms) => searchPokemonTcgApi(q, ms), backupName);
    const matched = remote.filter((card) => cardMatchesQuery(card, q));
    if (matched.length) {
      const ranked = rankSearchResults(q, matched).slice(0, 36);
      rememberCards(q, ranked);
      return { cards: ranked, savedOnly: false };
    }
    if (parsed.set) {
      const byName = await primaryThenTcgdex(
        budget,
        (ms) => searchPokemonTcgLucene(luceneNameQuery(parsed.name), ms),
        parsed.name,
      );
      const setHits = byName.filter((card) => cardMatchesQuery(card, q));
      if (setHits.length) {
        const ranked = rankSearchResults(q, setHits).slice(0, 36);
        rememberCards(q, ranked);
        return { cards: ranked, savedOnly: false };
      }
    }
    if (cached.length) return { cards: cached, savedOnly: false };
    return { cards: local, savedOnly: false };
  } catch {
    if (cached.length) return { cards: cached, savedOnly: true };
    if (local.length) return { cards: local, savedOnly: true };
    throw new Error(SEARCH_UNAVAILABLE);
  }
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
  try {
    const res = await fetchWithTimeout(`${POKEMON_TCG}/cards/${encodeURIComponent(card.id)}`, 5000);
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
