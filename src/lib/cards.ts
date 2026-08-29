import type { Card } from "../types";
import { LOCAL_CARDS } from "./localCatalog";
import { POKEMON_SPECIES } from "./pokemonNames";
import { normalizeName, rankByCollectorNumber } from "./scanMatch";

const POKEMON_TCG = "https://api.pokemontcg.io/v2";
const SEARCH_TIMEOUT_MS = 8000;

/** Shown when the live catalog is down and the name is not in the local list. */
export const SEARCH_UNAVAILABLE =
  "Can't reach the card catalog right now. Try a well-known name like Pikachu, or check your connection.";

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

/** Match a camera read to printings. Number is used when OCR saw 58/102 (etc). */
export async function findCardsFromScan(name: string, number?: string): Promise<Card[]> {
  const q = name.trim();
  if (q.length < 2) return [];

  try {
    if (number) {
      const num = /^\d+$/.test(number.trim()) ? String(parseInt(number.trim(), 10)) : number.trim();
      try {
        const precise = await searchPokemonTcgLucene(`${luceneNameQuery(q)} number:${num}`);
        if (precise.length) return rankByCollectorNumber(rankSearchResults(q, precise), number).slice(0, 12);
      } catch {
        /* name-only next */
      }
    }
    const byName = await searchPokemonTcgApi(q);
    if (byName.length) return rankByCollectorNumber(rankSearchResults(q, byName), number).slice(0, 12);
    return rankByCollectorNumber(searchLocalCatalog(q), number).slice(0, 12);
  } catch {
    const local = searchLocalCatalog(q);
    if (local.length) return rankByCollectorNumber(local, number).slice(0, 12);
    throw new Error(SEARCH_UNAVAILABLE);
  }
}

export async function searchCards(query: string): Promise<Card[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const parsed = parseCatalogQuery(q);

  try {
    const remote = await searchPokemonTcgApi(q);
    const matched = remote.filter((card) => cardMatchesQuery(card, q));
    if (matched.length) return rankSearchResults(q, matched).slice(0, 36);
    if (parsed.set) {
      const byName = await searchPokemonTcgLucene(luceneNameQuery(parsed.name));
      const setHits = byName.filter((card) => cardMatchesQuery(card, q));
      if (setHits.length) return rankSearchResults(q, setHits).slice(0, 36);
    }
    return searchLocalCatalog(q);
  } catch {
    const local = searchLocalCatalog(q);
    if (local.length) return local;
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
