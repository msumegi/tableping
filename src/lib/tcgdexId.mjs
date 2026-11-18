/** Purely numeric collector numbers drop leading zeros. Promo text such as SWSH050 stays. */
export function collectorNumber(localId) {
  if (/^\d+$/.test(localId)) return String(parseInt(localId, 10));
  return localId;
}

/** The pokemontcg.io id TableTrade stores for a TCGdex card. */
export function ptcgIdForTcgdexCard(ptcgSetId, localId) {
  const number = collectorNumber(localId);
  if (!number) return null;
  return `${ptcgSetId}-${number}`;
}
