import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { Card, Presence } from "../types";
import { LOCAL_CARDS } from "./localCatalog";

type NearbyNative = {
  start(options: { payload: string }): Promise<void>;
  setPayload(options: { payload: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(eventName: "peer", listener: (ev: { payload: string }) => void): Promise<PluginListenerHandle>;
};

const native = registerPlugin<NearbyNative>("TableTradeNearby");

/** Same JS calls later on iPhone. Android implements them first. */
export function canUsePhoneNearby(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function slimCards(cards: Card[]): { id: string; name: string }[] {
  return cards.slice(0, 24).map((c) => ({ id: c.id, name: c.name.slice(0, 24) }));
}

export function encodeNearbyPayload(p: Presence): string {
  return JSON.stringify({
    userId: p.userId,
    name: (p.name || "Trainer").slice(0, 24),
    note: p.note?.slice(0, 40),
    have: slimCards(p.have),
    want: slimCards(p.want),
    ts: p.ts,
  });
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
  await native.start({ payload: encodeNearbyPayload(presence) });
  const handle = await native.addListener("peer", (ev) => {
    const peer = decodeNearbyPayload(ev.payload || "");
    if (peer) onPeer(peer);
  });
  return () => {
    void handle.remove();
    void native.stop();
  };
}

export async function updatePhoneNearby(presence: Presence): Promise<void> {
  await native.setPayload({ payload: encodeNearbyPayload(presence) });
}
