import type { MatchSource, Presence } from "../types";
import { haversineMeters, MAX_MATCH_METERS } from "./geo";

export type CheckinMe = {
  lat?: number;
  lon?: number;
};

export { MAX_MATCH_METERS as PING_RADIUS_METERS };

/**
 * Close enough is the match signal. Named shops are not.
 */
export function presenceMatchSource(peer: Presence, me: CheckinMe): MatchSource | null {
  if (
    typeof peer.lat !== "number" ||
    typeof peer.lon !== "number" ||
    typeof me.lat !== "number" ||
    typeof me.lon !== "number"
  ) {
    return null;
  }
  const meters = haversineMeters(me.lat, me.lon, peer.lat, peer.lon);
  if (meters > MAX_MATCH_METERS) return null;
  return "gps";
}

export function presenceDistanceM(peer: Presence, me: CheckinMe): number | undefined {
  if (
    typeof peer.lat !== "number" ||
    typeof peer.lon !== "number" ||
    typeof me.lat !== "number" ||
    typeof me.lon !== "number"
  ) {
    return undefined;
  }
  return haversineMeters(me.lat, me.lon, peer.lat, peer.lon);
}
