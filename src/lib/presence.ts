import type { MqttClient } from "mqtt";
import { geohashNeighborhood } from "./geo";
import type { Presence } from "../types";

const PREFIX = "tableping/v2";
export const PRESENCE_TTL_MS = 45_000;
const HEARTBEAT_MS = 12_000;
const PUBLIC_HIVE = /broker\.hivemq\.com/i;

export function mqttBrokerUrl(): string | null {
  const raw = (import.meta.env.VITE_MQTT_URL as string | undefined)?.trim() || "";
  if (!raw) return null;
  if (PUBLIC_HIVE.test(raw)) return null;
  return raw;
}

export function geoTopic(hash: string): string {
  return `${PREFIX}/geo/${hash}`;
}

type Handler = (presence: Presence, topic: string) => void;

export type PresenceHub = {
  publish: (presence: Presence) => void;
  leave: (userId: string, opts?: { geohash?: string }) => void;
  disconnect: () => void;
};

function slimPresence(presence: Presence): Presence {
  return {
    userId: presence.userId,
    name: presence.name,
    have: presence.have,
    want: presence.want,
    note: presence.note,
    geohash: presence.geohash,
    lat: presence.lat,
    lon: presence.lon,
    ts: presence.ts,
  };
}

/**
 * Live presence for two phones that are looking and close enough.
 * Geo cells are the room. Needs a private broker URL (VITE_MQTT_URL).
 * The old public HiveMQ demo broker is refused.
 */
export async function connectPresenceHub(onMessage: Handler): Promise<PresenceHub> {
  const broker = mqttBrokerUrl();
  if (!broker) {
    throw new Error("No private match radio on this build.");
  }
  const mqtt = (await import("mqtt")).default;
  const user = (import.meta.env.VITE_MQTT_USERNAME as string | undefined)?.trim();
  const pass = (import.meta.env.VITE_MQTT_PASSWORD as string | undefined)?.trim();
  const client: MqttClient = mqtt.connect(broker, {
    clientId: `tp-${Math.random().toString(16).slice(2)}`,
    clean: true,
    connectTimeout: 8_000,
    reconnectPeriod: 4_000,
    protocolVersion: 4,
    username: user || undefined,
    password: pass || undefined,
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
      /* ignore junk */
    }
  });

  return {
    publish(presence) {
      if (!presence.geohash) return;
      const body = JSON.stringify(slimPresence(presence));
      for (const cell of geohashNeighborhood(presence.geohash)) {
        ensureSub(geoTopic(cell));
      }
      client.publish(geoTopic(presence.geohash), body, { qos: 0, retain: false });
    },
    leave(userId, opts) {
      const payload = JSON.stringify({ userId, ts: 0, name: "", have: [], want: [] });
      if (opts?.geohash) client.publish(geoTopic(opts.geohash), payload, { qos: 0, retain: false });
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

const CHANNEL = "tableping-local-v2";

/** Same-phone / two-tab testing without a broker. */
export function connectLocalHub(onMessage: Handler): PresenceHub {
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (ev: MessageEvent<Presence>) => {
    const parsed = ev.data;
    if (!parsed?.userId || !parsed.ts) return;
    onMessage(parsed, CHANNEL);
  };
  return {
    publish(presence) {
      ch.postMessage(slimPresence(presence));
    },
    leave() {
      /* local only */
    },
    disconnect() {
      ch.close();
    },
  };
}
