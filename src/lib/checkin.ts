import type { MatchSource, Presence } from "../types";

export type CheckinMe = {
  shopId?: string;
};

/**
 * Bare GPS is not a room. Same shop check-in is the match signal.
 */
export function presenceMatchSource(peer: Presence, me: CheckinMe): MatchSource | null {
  if (peer.shopId && me.shopId && peer.shopId === me.shopId) return "shop";
  return null;
}

export function sameCheckedInShop(meShopId: string | undefined, peer: Presence): boolean {
  return Boolean(meShopId && peer.shopId && meShopId === peer.shopId);
}
