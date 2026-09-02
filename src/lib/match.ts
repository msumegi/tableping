import type { Card, MatchKind, MatchSource, Presence, TradeMatch } from "../types";

export function cardsById(cards: Card[]): Map<string, Card> {
  return new Map(cards.map((c) => [c.id, c]));
}

export function intersectHaveWant(have: Card[], want: Card[]): Card[] {
  const wanted = new Set(want.map((c) => c.id));
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const card of have) {
    if (wanted.has(card.id) && !seen.has(card.id)) {
      seen.add(card.id);
      out.push(card);
    }
  }
  return out;
}

export function classifyKind(youCanGive: Card[], youCanGet: Card[]): MatchKind | null {
  if (youCanGive.length && youCanGet.length) return "both";
  if (youCanGive.length) return "they_want_yours";
  if (youCanGet.length) return "you_want_theirs";
  return null;
}

export function matchAgainst(
  me: Pick<Presence, "userId" | "have" | "want">,
  peer: Presence,
  source: MatchSource,
  distanceM?: number,
): TradeMatch | null {
  if (!peer.userId || peer.userId === me.userId) return null;
  const youCanGive = intersectHaveWant(me.have, peer.want);
  const youCanGet = intersectHaveWant(peer.have, me.want);
  const kind = classifyKind(youCanGive, youCanGet);
  if (!kind) return null;
  return {
    id: `${peer.userId}:${kind}:${youCanGive.map((c) => c.id).join(",")}:${youCanGet.map((c) => c.id).join(",")}`,
    peer,
    kind,
    youCanGive,
    youCanGet,
    source,
    distanceM,
    at: Date.now(),
  };
}

export function kindLabel(kind: MatchKind): string {
  switch (kind) {
    case "both":
      return "You can trade both ways";
    case "they_want_yours":
      return "They want a card you have";
    case "you_want_theirs":
      return "They have a card you want";
  }
}

export function sourceLabel(source: MatchSource): string {
  switch (source) {
    case "shop":
      return "Here";
    case "demo":
      return "Demo";
    case "table":
      return "Table";
    case "qr":
      return "QR";
    case "gps":
      return "Close by";
  }
}
