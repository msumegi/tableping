import type { MqttClient } from "mqtt";
import { geohashNeighborhood } from "./geo";
import type { Presence } from "../types";

const BROKER = "wss://broker.hivemq.com:8884/mqtt";
const PREFIX = "tableping/v1";

export const PRESENCE_TTL_MS = 45_000;
const HEARTBEAT_MS = 12_000;

export function geoTopic(hash: string): string {
  return `${PREFIX}/geo/${hash}`;
}

export function tableTopic(code: string): string {
  return `${PREFIX}/table/${code}`;
}

type Handler = (presence: Presence, topic: string) => void;

export type PresenceHub = {
  publish: (presence: Presence) => void;
  leave: (userId: string, geohash?: string, room?: string) => void;
  disconnect: () => void;
};

/**
 * Live presence for two phones in the same shop.
 * Topics are shop-scale geohash cells (~76m) and/or a 4-character table code.
 * The HiveMQ public broker is a v1 convenience — not a private production backend.
 */
export async function connectPresenceHub(onMessage: Handler): Promise<PresenceHub> {
  const mqtt = (await import("mqtt")).default;
  const client: MqttClient = mqtt.connect(BROKER, {
    clientId: `tp-${Math.random().toString(16).slice(2)}`,
    clean: true,
    connectTimeout: 8_000,
    reconnectPeriod: 4_000,
    protocolVersion: 4,
  });

  const subscribed = new Set<string>();

  function ensureSub(topic: string) {
    if (subscribed.has(topic)) return;
    subscribed.add(topic);
    client.subscribe(topic, { qos: 0 }, (err) => {
      if (err) subscribed.delete(topic);
    });
  }

  client.on("message", (topic, payload) => {
    try {
      const parsed = JSON.parse(payload.toString()) as Presence;
      if (!parsed?.userId || !parsed.ts) return;
      if (Date.now() - parsed.ts > PRESENCE_TTL_MS) return;
      onMessage(parsed, topic);
    } catch {
      /* ignore junk on the public broker */
    }
  });

  return {
    publish(presence) {
      const body = JSON.stringify(presence);
      if (presence.geohash) {
        for (const cell of geohashNeighborhood(presence.geohash)) {
          ensureSub(geoTopic(cell));
        }
        client.publish(geoTopic(presence.geohash), body, { qos: 0, retain: false });
      }
      if (presence.room) {
        const topic = tableTopic(presence.room);
        ensureSub(topic);
        client.publish(topic, body, { qos: 0, retain: false });
      }
    },
    leave(userId, geohash, room) {
      const payload = JSON.stringify({ userId, ts: 0, name: "", have: [], want: [] });
      if (geohash) client.publish(geoTopic(geohash), payload, { qos: 0, retain: false });
      if (room) client.publish(tableTopic(room), payload, { qos: 0, retain: false });
    },
    disconnect() {
      try {
        client.end(true);
      } catch {
        /* already closed */
      }
    },
  };
}

export { HEARTBEAT_MS };

const CHANNEL = "tableping-local-v1";

/** Same-phone / two-tab testing without the public broker. */
export function connectLocalHub(onMessage: Handler): PresenceHub {
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (ev: MessageEvent<Presence>) => {
    const parsed = ev.data;
    if (!parsed?.userId || !parsed.ts) return;
    onMessage(parsed, CHANNEL);
  };
  return {
    publish(presence) {
      ch.postMessage(presence);
    },
    leave() {
      /* local only */
    },
    disconnect() {
      ch.close();
    },
  };
}
