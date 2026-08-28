export type Card = {
  id: string;
  name: string;
  image: string;
  setName: string;
  number: string;
};

export type Tab = "have" | "want" | "nearby" | "you";

export type MatchKind = "they_want_yours" | "you_want_theirs" | "both";

export type MatchSource = "gps" | "table" | "demo" | "qr";

export type Presence = {
  userId: string;
  name: string;
  have: Card[];
  want: Card[];
  geohash?: string;
  lat?: number;
  lon?: number;
  room?: string;
  ts: number;
};

export type TradeMatch = {
  id: string;
  peer: Presence;
  kind: MatchKind;
  youCanGive: Card[];
  youCanGet: Card[];
  source: MatchSource;
  distanceM?: number;
  at: number;
};

export type Settings = {
  displayName: string;
  userId: string;
  demoMode: boolean;
  tableCode: string;
};
