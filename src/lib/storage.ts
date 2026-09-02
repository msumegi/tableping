import type { Card, Settings } from "../types";

const HAVE = "tableping.have.v1";
const WANT = "tableping.want.v1";
const SETTINGS = "tableping.settings.v1";
const SEEN = "tableping.seenMatches.v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadHave(): Card[] {
  return readJson<Card[]>(HAVE, []);
}

export function loadWant(): Card[] {
  return readJson<Card[]>(WANT, []);
}

export function saveHave(cards: Card[]): void {
  localStorage.setItem(HAVE, JSON.stringify(cards));
}

export function saveWant(cards: Card[]): void {
  localStorage.setItem(WANT, JSON.stringify(cards));
}

export function newUserId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `u-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function loadSettings(): Settings {
  const stored = readJson<Partial<Settings> | null>(SETTINGS, null);
  return {
    displayName: stored?.displayName?.trim() || "Trainer",
    userId: stored?.userId || newUserId(),
    demoMode: Boolean(stored?.demoMode),
    tableCode: stored?.tableCode || "",
    photo: stored?.photo,
    lastShopId: stored?.lastShopId,
    lookingNote: typeof stored?.lookingNote === "string" ? stored.lookingNote.slice(0, 40) : "",
  };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS, JSON.stringify(settings));
}

export function loadSeenMatchIds(): string[] {
  return readJson<string[]>(SEEN, []);
}

export function saveSeenMatchIds(ids: string[]): void {
  localStorage.setItem(SEEN, JSON.stringify(ids.slice(-80)));
}

export function upsertCard(list: Card[], card: Card): Card[] {
  if (list.some((c) => c.id === card.id)) return list;
  return [card, ...list];
}

export function removeCard(list: Card[], id: string): Card[] {
  return list.filter((c) => c.id !== id);
}
