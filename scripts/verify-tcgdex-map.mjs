/**
 * Check every mapped TCGdex set against pokemontcg.io.
 * Card ids use ptcgIdForTcgdexCard, the same helper the app uses.
 * A missing id, or an id whose pokemontcg.io name is a different card, fails the run.
 * Not part of npm test: this talks to both catalogs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ptcgIdForTcgdexCard } from "../src/lib/tcgdexId.mjs";

const mapPath = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/tcgdexSetMap.json");
const map = JSON.parse(readFileSync(mapPath, "utf8"));

function normName(name) {
  const stripped = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bLV\.?\s*X\b/gi, " ")
    .replace(/[★☆]/g, " star ")
    .replace(/^\s*basic\s+/i, "");
  const tokens = stripped.split(/\s+/).filter((token) => token && !/\d/.test(token));
  return tokens
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/♂/g, "m")
    .replace(/♀/g, "f")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function sameCardName(left, right) {
  const a = normName(left);
  const b = normName(right);
  if (a === b) return true;
  const gap = Math.abs(a.length - b.length);
  if (gap > 1 || Math.min(a.length, b.length) < 8) return false;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length === b.length) {
      i += 1;
      j += 1;
    } else if (a.length > b.length) i += 1;
    else j += 1;
  }
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 429) {
      last = `${res.status} ${url}`;
      await sleep(Math.min(8000, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(last || `failed ${url}`);
}

async function tcgdexCards(setId) {
  const body = await getJson(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(setId)}`);
  return Array.isArray(body.cards) ? body.cards : [];
}

async function ptcgCards(setId) {
  const byId = new Map();
  let page = 1;
  let total = Infinity;
  while ((page - 1) * 250 < total) {
    const query = encodeURIComponent(`set.id:${setId}`);
    const url = `https://api.pokemontcg.io/v2/cards?q=${query}&pageSize=250&page=${page}&select=id,name`;
    const body = await getJson(url);
    const data = Array.isArray(body.data) ? body.data : [];
    total = Number(body.totalCount ?? data.length);
    for (const card of data) {
      if (card && typeof card.id === "string" && typeof card.name === "string") byId.set(card.id, card.name);
    }
    if (!data.length) break;
    page += 1;
  }
  return byId;
}

async function checkSet(tcgdexId, entry) {
  const [briefs, official] = await Promise.all([tcgdexCards(tcgdexId), ptcgCards(entry.ptcg)]);
  const problems = [];
  const missing = [];
  for (const brief of briefs) {
    if (!brief || typeof brief.localId !== "string" || typeof brief.name !== "string" || !brief.name.trim()) continue;
    const id = ptcgIdForTcgdexCard(entry.ptcg, brief.localId);
    if (!id) continue;
    const officialName = official.get(id);
    if (!officialName) {
      missing.push(`${tcgdexId} ${brief.name} (${brief.localId}) -> ${id} is missing on pokemontcg.io`);
      continue;
    }
    if (!sameCardName(officialName, brief.name)) {
      problems.push(`${tcgdexId} ${brief.name} (${brief.localId}) -> ${id} is ${officialName} on pokemontcg.io`);
    }
  }
  return { problems, missing };
}

const entries = Object.entries(map);
const failures = [];
const warnings = [];
const retry = [];

async function visit(id, entry, finalPass) {
  try {
    const { problems, missing } = await checkSet(id, entry);
    if (problems.length) {
      failures.push(...problems);
      console.error(`${id}: ${problems.length} name collision(s)`);
      for (const line of problems.slice(0, 8)) console.error(`  ${line}`);
    }
    if (missing.length) {
      warnings.push(...missing);
      console.error(`${id}: ${missing.length} id(s) absent on pokemontcg.io`);
      for (const line of missing.slice(0, 4)) console.error(`  ${line}`);
    }
    if (!problems.length && !missing.length) console.log(`${id}: ok`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!finalPass) {
      retry.push([id, entry]);
      console.error(`${id}: retry later (${message})`);
      return;
    }
    failures.push(`${id}: ${message}`);
    console.error(`${id}: ${message}`);
  }
}

for (const [id, entry] of entries) await visit(id, entry, false);
for (const [id, entry] of retry) await visit(id, entry, true);

if (warnings.length) {
  console.error(`${warnings.length} card id(s) are absent on pokemontcg.io (not a different card)`);
}
if (failures.length) {
  console.error(`${failures.length} problem(s) across ${entries.length} mapped sets`);
  process.exit(1);
}
console.log(`${entries.length} mapped sets have no pokemontcg.io id pointing at a different card`);
