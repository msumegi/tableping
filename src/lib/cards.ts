import type { Card } from "../types";
import { LOCAL_CARDS } from "./localCatalog";

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

function luceneNameQuery(raw: string): string {
  const cleaned = raw.replace(/[:"*?\\()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "name:*";
  if (cleaned.includes(" ")) return `name:"${cleaned}*"`;
  return `name:${cleaned}*`;
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
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = LOCAL_CARDS.filter((card) => card.name.toLowerCase().includes(q));
  return rankSearchResults(query, dedupeCards(hits)).slice(0, 36);
}

async function searchPokemonTcgApi(query: string): Promise<Card[]> {
  const params = new URLSearchParams({
    q: luceneNameQuery(query),
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

export async function searchCards(query: string): Promise<Card[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const remote = await searchPokemonTcgApi(q);
    if (remote.length) return rankSearchResults(q, remote).slice(0, 36);
    return searchLocalCatalog(q);
  } catch {
    const local = searchLocalCatalog(q);
    if (local.length) return local;
    throw new Error(SEARCH_UNAVAILABLE);
  }
}

export function rankSearchResults(query: string, cards: Card[]): Card[] {
  const q = query.trim().toLowerCase();
  const score = (name: string) => {
    const n = name.toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q + " ")) return 1;
    if (n.startsWith(q)) return 2;
    if (n.includes(q)) return 3;
    return 4;
  };
  return [...cards].sort((a, b) => {
    const d = score(a.name) - score(b.name);
    if (d !== 0) return d;
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
