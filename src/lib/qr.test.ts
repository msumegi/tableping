import { describe, expect, it } from "vitest";
import { decodePresenceQr, decodeTableQr, encodePresenceQr } from "./qr";

const samplePresence = {
  userId: "u1",
  name: "Kai",
  have: [{ id: "base1-58", name: "Pikachu", image: "x", setName: "Base", number: "58" }],
  want: [{ id: "base6-4", name: "Charizard", image: "y", setName: "Base", number: "4" }],
};

describe("table and presence QR payloads", () => {
  it("still decodes a presence QR so existing pings keep working", () => {
    const raw = encodePresenceQr(samplePresence);
    const decoded = decodeTableQr(raw);
    expect(decoded?.kind).toBe("presence");
    if (decoded?.kind !== "presence") return;
    expect(decoded.presence.userId).toBe("u1");
    expect(decoded.presence.have[0]?.name).toBe("Pikachu");
    expect(decodePresenceQr(raw)?.name).toBe("Kai");
  });

  it("reads a join deep-link QR to the app URL", () => {
    expect(decodeTableQr("https://msumegi.github.io/tableping/?join=K7M2")).toEqual({
      kind: "join",
      code: "K7M2",
    });
    expect(decodeTableQr("https://msumegi.github.io/tableping/?t=ab3d")).toEqual({
      kind: "join",
      code: "AB3D",
    });
  });

  it("reads a bare four-character table code", () => {
    expect(decodeTableQr("k7m2")).toEqual({ kind: "join", code: "K7M2" });
  });

  it("ignores junk", () => {
    expect(decodeTableQr("https://example.com/")).toBeNull();
    expect(decodeTableQr("hi")).toBeNull();
  });
});
