import type { Card } from "../types";

const TCGDEX = "https://api.tcgdex.net/v2/en";

type TcgdexListCard = {
  id: string;
  name: string;
  image?: string;
  localId?: string;
};

type TcgdexDetail = TcgdexListCard & {
  set?: { name?: string; id?: string };
  localId?: string;
};

export function cardImageUrl(imageBase: string, size: "low" | "high" = "low"): string {
  if (!imageBase) return "";
  if (imageBase.endsWith(".png") || imageBase.endsWith(".webp") || imageBase.endsWith(".jpg")) {
    return imageBase;
  }
  return `${imageBase}/${size}.webp`;
}

function toCard(raw: TcgdexListCard, setName = ""): Card | null {
  if (!raw.id || !raw.name || !raw.image) return null;
  return {
    id: raw.id,
    name: raw.name,
    image: cardImageUrl(raw.image, "low"),
    setName: setName || raw.id.split("-")[0] || "",
    number: String(raw.localId ?? ""),
  };
}

export async function searchCards(query: string): Promise<Card[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = `${TCGDEX}/cards?name=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Card search failed (${res.status})`);
  }
  const data = (await res.json()) as TcgdexListCard[] | { error?: string };
  if (!Array.isArray(data)) {
    throw new Error("Card search returned an unexpected response");
  }

  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const raw of data) {
    const card = toCard(raw);
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
    if (cards.length >= 36) break;
  }
  return cards;
}

export async function hydrateSetName(card: Card): Promise<Card> {
  if (card.setName && card.setName.length > 4) return card;
  try {
    const res = await fetch(`${TCGDEX}/cards/${encodeURIComponent(card.id)}`);
    if (!res.ok) return card;
    const detail = (await res.json()) as TcgdexDetail;
    return {
      ...card,
      setName: detail.set?.name || card.setName,
      number: String(detail.localId ?? card.number),
      image: detail.image ? cardImageUrl(detail.image, "low") : card.image,
    };
  } catch {
    return card;
  }
}

/** Starter printings used by demo mode when lists are empty. */
export const SAMPLE_PIKACHU: Card = {
  id: "base1-58",
  name: "Pikachu",
  image: cardImageUrl("https://assets.tcgdex.net/en/base/base1/58"),
  setName: "Base Set",
  number: "58",
};

export const SAMPLE_CHARIZARD: Card = {
  id: "base1-4",
  name: "Charizard",
  image: cardImageUrl("https://assets.tcgdex.net/en/base/base1/4"),
  setName: "Base Set",
  number: "4",
};

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
