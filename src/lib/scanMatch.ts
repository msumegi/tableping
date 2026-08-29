import type { Card } from "../types";
import { POKEMON_SPECIES } from "./pokemonNames";

/** Later optional: binder-page grid scan (~3×4, maybe 4×5). Not 4×8/8×10 table layouts. */

export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/♀/g, "f")
    .replace(/♂/g, "m")
    .replace(/&/g, "and")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/4/g, "a")
    .replace(/[^a-z0-9]+/g, "");
}

const IGNORE_WORDS = new Set(
  [
    "basic",
    "stage",
    "stage1",
    "stage2",
    "evolved",
    "evolves",
    "from",
    "hp",
    "weakness",
    "resistance",
    "retreat",
    "ability",
    "pokemon",
    "pokémon",
    "pokedex",
    "power",
    "body",
    "energy",
    "colorless",
    "grass",
    "fire",
    "water",
    "lightning",
    "psychic",
    "fighting",
    "darkness",
    "metal",
    "fairy",
    "dragon",
    "trainer",
    "supporter",
    "item",
    "stadium",
    "tool",
    "rule",
    "attack",
    "illustrator",
    "rare",
    "holo",
    "ultra",
    "secret",
    "illustration",
    "you",
    "your",
    "opponent",
    "bench",
    "active",
    "prize",
    "deck",
    "discard",
    "coin",
    "flip",
    "heads",
    "tails",
    "card",
    "cards",
    "this",
    "that",
    "the",
    "and",
    "for",
    "with",
    "into",
    "put",
    "knocked",
    "damage",
    "dmg",
    "cost",
    "plus",
    "times",
  ].map((w) => normalizeName(w)),
);

const VARIANT_SUFFIXES: { norm: string; print: string }[] = [
  { norm: "vmax", print: "VMAX" },
  { norm: "vstar", print: "VSTAR" },
  { norm: "vunion", print: "V-UNION" },
  { norm: "gx", print: "GX" },
  { norm: "ex", print: "ex" },
  { norm: "lvx", print: "LV.X" },
  { norm: "break", print: "BREAK" },
  { norm: "prime", print: "Prime" },
  { norm: "v", print: "V" },
];

const NAME_PREFIXES: { tokens: string[]; print: string }[] = [
  { tokens: ["team", "rockets"], print: "Team Rocket's" },
  { tokens: ["team", "aquas"], print: "Team Aqua's" },
  { tokens: ["team", "magmas"], print: "Team Magma's" },
  { tokens: ["lt", "surges"], print: "Lt. Surge's" },
  { tokens: ["giovannis"], print: "Giovanni's" },
  { tokens: ["brocks"], print: "Brock's" },
  { tokens: ["mistys"], print: "Misty's" },
  { tokens: ["erikas"], print: "Erika's" },
  { tokens: ["sabrinas"], print: "Sabrina's" },
  { tokens: ["blaines"], print: "Blaine's" },
  { tokens: ["kogas"], print: "Koga's" },
  { tokens: ["rockets"], print: "Rocket's" },
  { tokens: ["dawn", "wings"], print: "Dawn Wings" },
  { tokens: ["dusk", "mane"], print: "Dusk Mane" },
  { tokens: ["origin", "forme"], print: "Origin Forme" },
  { tokens: ["origin", "form"], print: "Origin Forme" },
  { tokens: ["teal", "mask"], print: "Teal Mask" },
  { tokens: ["wellspring"], print: "Wellspring" },
  { tokens: ["hearthflame"], print: "Hearthflame" },
  { tokens: ["cornerstone"], print: "Cornerstone" },
  { tokens: ["bloodmoon"], print: "Bloodmoon" },
  { tokens: ["alolan"], print: "Alolan" },
  { tokens: ["galarian"], print: "Galarian" },
  { tokens: ["hisuian"], print: "Hisuian" },
  { tokens: ["paldean"], print: "Paldean" },
  { tokens: ["mega"], print: "Mega" },
  { tokens: ["primal"], print: "Primal" },
  { tokens: ["radiant"], print: "Radiant" },
  { tokens: ["shining"], print: "Shining" },
  { tokens: ["dark"], print: "Dark" },
  { tokens: ["light"], print: "Light" },
];

type SpeciesEntry = { name: string; norm: string };

const SPECIES: SpeciesEntry[] = [
  ...POKEMON_SPECIES.map((name) => ({ name, norm: normalizeName(name) })),
  { name: "Nidoran", norm: "nidoran" },
];

export type ScanConfidence = "high" | "low" | "none";

export type ParsedCardOcr = {
  query: string | null;
  number?: string;
  setSize?: string;
  speciesHit: boolean;
  confidence: ScanConfidence;
};

export type ScanDecision = {
  confidence: ScanConfidence;
  candidates: Card[];
};

export function collectorNumberKey(number: string): string {
  const t = number.trim().toLowerCase();
  if (/^\d+$/.test(t)) return String(parseInt(t, 10));
  return t;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

export function parseCollectorNumber(text: string): { number: string; setSize?: string } | null {
  const slash = text.match(/\b(\d{1,3})\s*\/\s*(\d{2,3})\b/);
  if (slash) return { number: slash[1], setSize: slash[2] };
  const promo = text.match(/\b([a-z]{2,6}[- ]?\d{2,4})\b/i);
  if (promo && !/hp/i.test(promo[1])) return { number: promo[1].replace(/\s+/g, "") };
  return null;
}

function tokenize(text: string): string[] {
  return text
    .replace(/[|]/g, "I")
    .split(/[\s\n\r,;:/]+/)
    .map((w) => w.replace(/^[^\w♀♂']+|[^\w♀♂']+$/g, ""))
    .filter((w) => w.length > 0);
}

function maxEditDistance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

function scoreWindow(windowNorm: string, speciesNorm: string): number {
  if (!windowNorm || !speciesNorm) return 0;
  if (windowNorm === speciesNorm) return 100 + speciesNorm.length;
  const dist = levenshtein(windowNorm, speciesNorm);
  if (dist <= maxEditDistance(speciesNorm.length)) {
    return 82 - dist * 12 + Math.min(speciesNorm.length, 12) * 0.2;
  }
  return 0;
}

function suffixAfter(tokens: string[], indexAfter: number): string | null {
  const next = tokens[indexAfter];
  if (!next) return null;
  const norm = normalizeName(next);
  const hit = VARIANT_SUFFIXES.find((s) => s.norm === norm);
  return hit?.print ?? null;
}

function prefixBefore(tokenNorms: string[], startIndex: number): string | null {
  for (const prefix of NAME_PREFIXES) {
    const len = prefix.tokens.length;
    if (startIndex < len) continue;
    const slice = tokenNorms.slice(startIndex - len, startIndex);
    if (slice.every((t, i) => t === prefix.tokens[i])) return prefix.print;
  }
  return null;
}

function inferQueryFromSpecies(text: string): { query: string; fuzzy: boolean } | null {
  const tokens = tokenize(text).filter((tok) => {
    const n = normalizeName(tok);
    if (!n) return false;
    if (/^\d+$/.test(n)) return false;
    if (n.endsWith("hp") && n.length <= 5) return false;
    return !IGNORE_WORDS.has(n);
  });
  if (!tokens.length) return null;

  const norms = tokens.map((t) => normalizeName(t));
  let best: { score: number; name: string; start: number; end: number } | null = null;

  for (let i = 0; i < tokens.length; i++) {
    for (let w = 1; w <= 3 && i + w <= tokens.length; w++) {
      const windowNorm = norms.slice(i, i + w).join("");
      if (windowNorm.length < 3) continue;
      for (const species of SPECIES) {
        const score = scoreWindow(windowNorm, species.norm);
        if (score <= 0) continue;
        if (!best || score > best.score) {
          best = { score, name: species.name, start: i, end: i + w };
        }
      }
    }
  }

  if (!best || best.score < 70) return null;

  const prefix = prefixBefore(norms, best.start);
  const suffix = suffixAfter(tokens, best.end);
  const parts = [prefix, best.name, suffix].filter(Boolean);
  return { query: parts.join(" "), fuzzy: best.score < 100 };
}

function fallbackQuery(text: string): string | null {
  const lines = text.split(/\n+/);
  let best: string | null = null;
  for (const line of lines) {
    const stripped = line.replace(/\d+\s*HP\b/gi, " ").replace(/\b\d{1,3}\s*\/\s*\d{2,3}\b/g, " ");
    const words = tokenize(stripped).filter((tok) => {
      const n = normalizeName(tok);
      return n.length >= 2 && !IGNORE_WORDS.has(n) && !/^\d+$/.test(n);
    });
    if (words.length === 0 || words.length > 5) continue;
    const candidate = words.join(" ").trim();
    if (candidate.length < 4 || candidate.length > 28) continue;
    if (!best || candidate.length > best.length) best = candidate;
  }
  return best;
}

export function parseCardOcr(text: string): ParsedCardOcr {
  const collector = parseCollectorNumber(text);
  const species = inferQueryFromSpecies(text);
  const query = species?.query ?? fallbackQuery(text);
  if (!query) {
    return {
      query: null,
      number: collector?.number,
      setSize: collector?.setSize,
      speciesHit: false,
      confidence: "none",
    };
  }
  const high = Boolean(species && !species.fuzzy && collector?.number);
  return {
    query,
    number: collector?.number,
    setSize: collector?.setSize,
    speciesHit: Boolean(species),
    confidence: high ? "high" : "low",
  };
}

export function rankByCollectorNumber(cards: Card[], number?: string): Card[] {
  if (!number) return cards;
  const key = collectorNumberKey(number);
  return [...cards].sort((a, b) => {
    const aHit = collectorNumberKey(a.number) === key ? 0 : 1;
    const bHit = collectorNumberKey(b.number) === key ? 0 : 1;
    return aHit - bHit;
  });
}

export function decideScanMatch(cards: Card[], parsed: ParsedCardOcr): ScanDecision {
  if (!parsed.query || !cards.length) return { confidence: "none", candidates: [] };
  const ranked = rankByCollectorNumber(cards, parsed.number).slice(0, 8);
  const numberHits = parsed.number
    ? ranked.filter((c) => collectorNumberKey(c.number) === collectorNumberKey(parsed.number!))
    : [];

  if (numberHits.length === 1) {
    const top = numberHits[0];
    return {
      confidence: "high",
      candidates: [top, ...ranked.filter((c) => c.id !== top.id)],
    };
  }
  if (ranked.length === 1) {
    return { confidence: "high", candidates: ranked };
  }
  return { confidence: "low", candidates: ranked };
}
