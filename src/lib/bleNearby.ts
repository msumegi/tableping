import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { Card, Presence } from "../types";
import { LOCAL_CARDS } from "./localCatalog";

type NearbyNative = {
  start(options: { payload: string; userId: string }): Promise<void>;
  setPayload(options: { payload: string }): Promise<void>;
  stop(): Promise<void>;
  openLocationSettings(): Promise<void>;
  requestEnableBluetooth(): Promise<void>;
  addListener(eventName: "peer", listener: (ev: { payload: string }) => void): Promise<PluginListenerHandle>;
};

const native = registerPlugin<NearbyNative>("TableTradeNearby");

/**
 * v2 wire frame, matching BleCrypto.java:
 * version (1) + uncompressed P-256 key (65) + nonce (12) + AES-GCM ciphertext and tag (plaintext + 16).
 * ATT payload at MTU 517 is 514 bytes, so the profile JSON must stay within 420 bytes.
 */
export const BLE_PROTOCOL_VERSION = 2;
export const BLE_PUBKEY_LEN = 65;
export const BLE_NONCE_LEN = 12;
export const BLE_TAG_LEN = 16;
export const BLE_VERSION_LEN = 1;
export const BLE_FRAME_OVERHEAD = BLE_VERSION_LEN + BLE_PUBKEY_LEN + BLE_NONCE_LEN + BLE_TAG_LEN;
export const BLE_TARGET_MTU = 517;
export const BLE_ATT_HEADER = 3;
export const BLE_MAX_FRAME = BLE_TARGET_MTU - BLE_ATT_HEADER;
export const BLE_MAX_PLAINTEXT = BLE_MAX_FRAME - BLE_FRAME_OVERHEAD;

export function nearbyFrameLength(plaintextBytes: number): number {
  return plaintextBytes + BLE_FRAME_OVERHEAD;
}

export function plaintextFitsTargetMtu(plaintextBytes: number): boolean {
  return plaintextBytes >= 0 && nearbyFrameLength(plaintextBytes) <= BLE_MAX_FRAME;
}

export type NearbyBlock = "location" | "bluetooth";

export function nearbyBlockFromError(err: unknown): NearbyBlock | null {
  const code = readField(err, "code");
  const message = err instanceof Error ? err.message : readField(err, "message");
  const hay = `${code}\n${message}`;
  if (hay.includes("LOCATION_OFF")) return "location";
  if (hay.includes("BLUETOOTH_OFF")) return "bluetooth";
  return null;
}

function readField(err: unknown, key: string): string {
  if (!err || typeof err !== "object" || !(key in err)) return "";
  const value = (err as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

/** Same JS calls later on iPhone. Android implements them first. */
export function canUsePhoneNearby(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function openPhoneLocationSettings(): Promise<void> {
  return native.openLocationSettings();
}

export function requestPhoneBluetooth(): Promise<void> {
  return native.requestEnableBluetooth();
}

function cardIds(cards: Card[], n: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of cards) {
    if (!c.id || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c.id);
    if (out.length >= n) break;
  }
  return out;
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function encodeNearbyPayload(p: Presence): string {
  let haveN = 12;
  let wantN = 12;
  const pack = (have: number, want: number) =>
    JSON.stringify({
      userId: p.userId,
      name: (p.name || "Trainer").slice(0, 24),
      note: p.note?.slice(0, 40),
      have: cardIds(p.have, have),
      want: cardIds(p.want, want),
      ts: p.ts,
    });
  let raw = pack(haveN, wantN);
  while (utf8Bytes(raw) > BLE_MAX_PLAINTEXT && (haveN > 0 || wantN > 0)) {
    if (haveN >= wantN && haveN > 0) haveN -= 1;
    else if (wantN > 0) wantN -= 1;
    else break;
    raw = pack(haveN, wantN);
  }
  return raw;
}

function inflate(list: unknown): Card[] {
  if (!Array.isArray(list)) return [];
  const out: Card[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      const local = LOCAL_CARDS.find((c) => c.id === item);
      out.push(local ?? { id: item, name: item, image: "", setName: "", number: "" });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const rec = item as { id?: string; name?: string };
    if (!rec.id) continue;
    const local = LOCAL_CARDS.find((c) => c.id === rec.id);
    out.push(
      local ?? {
        id: rec.id,
        name: rec.name || rec.id,
        image: "",
        setName: "",
        number: "",
      },
    );
  }
  return out;
}

export function decodeNearbyPayload(raw: string): Presence | null {
  try {
    const parsed = JSON.parse(raw) as {
      userId?: string;
      name?: string;
      note?: string;
      have?: unknown;
      want?: unknown;
      ts?: number;
    };
    if (!parsed?.userId || !parsed.ts) return null;
    return {
      userId: parsed.userId,
      name: parsed.name || "Trainer",
      note: parsed.note,
      have: inflate(parsed.have),
      want: inflate(parsed.want),
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

export async function startPhoneNearby(
  presence: Presence,
  onPeer: (peer: Presence) => void,
): Promise<() => void> {
  const handle = await native.addListener("peer", (ev) => {
    const peer = decodeNearbyPayload(ev.payload || "");
    if (peer) onPeer(peer);
  });
  try {
    await native.start({ payload: encodeNearbyPayload(presence), userId: presence.userId });
  } catch (err) {
    await handle.remove();
    throw err;
  }
  return () => {
    void handle.remove();
    void native.stop();
  };
}

export async function updatePhoneNearby(presence: Presence): Promise<void> {
  await native.setPayload({ payload: encodeNearbyPayload(presence) });
}
