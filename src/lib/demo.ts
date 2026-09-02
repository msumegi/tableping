import { SAMPLE_CHARIZARD, SAMPLE_PIKACHU } from "./cards";
import type { Card, Presence } from "../types";

export const DEMO_USER_ID = "demo-kai";
export const DEMO_NAME = "Kai (demo)";

/**
 * Build a nearby demo trainer who complements the tester's lists.
 * If the tester has A and wants B, Kai wants A and has B — a guaranteed two-way ping.
 */
export function complementaryDemoPresence(
  have: Card[],
  want: Card[],
  extras?: {
    geohash?: string;
    room?: string;
    lat?: number;
    lon?: number;
    note?: string;
    shopId?: string;
    shopName?: string;
  },
): Presence {
  const demoHave = want.length ? want : [SAMPLE_CHARIZARD];
  const demoWant = have.length ? have : [SAMPLE_PIKACHU];
  return {
    userId: DEMO_USER_ID,
    name: DEMO_NAME,
    have: demoHave,
    want: demoWant,
    note: extras?.note ?? "Red hoodie. Back table.",
    geohash: extras?.geohash,
    lat: extras?.lat,
    lon: extras?.lon,
    room: extras?.room,
    shopId: extras?.shopId,
    shopName: extras?.shopName,
    ts: Date.now(),
  };
}

export function seedListsIfEmpty(
  have: Card[],
  want: Card[],
): { have: Card[]; want: Card[]; seeded: boolean } {
  if (have.length || want.length) {
    return { have, want, seeded: false };
  }
  return { have: [SAMPLE_PIKACHU], want: [SAMPLE_CHARIZARD], seeded: true };
}
