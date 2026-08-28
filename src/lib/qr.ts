import type { Card, Presence } from "../types";

const PREFIX = "TPv1:";

type Payload = {
  v: 1;
  id: string;
  n: string;
  h: Array<[string, string, string, string, string]>;
  w: Array<[string, string, string, string, string]>;
};

function packCards(cards: Card[]): Payload["h"] {
  return cards.slice(0, 18).map((c) => [c.id, c.name, c.image, c.setName, c.number]);
}

function unpackCards(rows: Payload["h"]): Card[] {
  return rows.map(([id, name, image, setName, number]) => ({
    id,
    name,
    image,
    setName,
    number,
  }));
}

export function encodePresenceQr(presence: Pick<Presence, "userId" | "name" | "have" | "want">): string {
  const payload: Payload = {
    v: 1,
    id: presence.userId,
    n: presence.name,
    h: packCards(presence.have),
    w: packCards(presence.want),
  };
  const json = JSON.stringify(payload);
  return PREFIX + btoa(unescape(encodeURIComponent(json)));
}

export function decodePresenceQr(raw: string): Presence | null {
  const text = raw.trim();
  if (!text.startsWith(PREFIX)) return null;
  try {
    const json = decodeURIComponent(escape(atob(text.slice(PREFIX.length))));
    const payload = JSON.parse(json) as Payload;
    if (payload.v !== 1 || !payload.id) return null;
    return {
      userId: payload.id,
      name: payload.n || "Trainer",
      have: unpackCards(payload.h || []),
      want: unpackCards(payload.w || []),
      ts: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function presenceToQrDataUrl(
  presence: Pick<Presence, "userId" | "name" | "have" | "want">,
): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(encodePresenceQr(presence), {
    margin: 1,
    width: 360,
    color: { dark: "#1c1410", light: "#f3ead8" },
    errorCorrectionLevel: "M",
  });
}
