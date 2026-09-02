export type Card = {
  id: string;
  name: string;
  image: string;
  setName: string;
  number: string;
};

export type Tab = "have" | "want" | "nearby" | "you";

export type MatchKind = "they_want_yours" | "you_want_theirs" | "both";

export type MatchSource = "shop" | "gps" | "table" | "demo" | "qr";

export type Presence = {
  userId: string;
  name: string;
  have: Card[];
  want: Card[];
  photo?: string;
  note?: string;
  geohash?: string;
  lat?: number;
  lon?: number;
  room?: string;
  shopId?: string;
  shopName?: string;
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
  photo?: string;
  lastShopId?: string;
  lookingNote?: string;
};
