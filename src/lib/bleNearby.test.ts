import { describe, expect, it } from "vitest";
import {
  BLE_FRAME_OVERHEAD,
  BLE_MAX_FRAME,
  BLE_MAX_PLAINTEXT,
  BLE_PROTOCOL_VERSION,
  BLE_SINGLE_PACKET,
  decodeNearbyPayload,
  encodeNearbyPayload,
  nearbyBlockFromError,
  nearbyFrameLength,
  payloadTooLarge,
  plaintextFitsCeiling,
  plaintextFitsTargetMtu,
} from "./bleNearby";
import type { Card, Presence } from "../types";

const me: Presence = {
  userId: "u1",
  name: "Kai",
  note: "Red hoodie",
  have: [{ id: "base1-58", name: "Pikachu", image: "https://x/p.png", setName: "Base", number: "58" }],
  want: [{ id: "base1-4", name: "Charizard", image: "https://x/c.png", setName: "Base", number: "4" }],
  ts: 1,
};

function card(id: string): Card {
  return { id, name: id, image: "https://x/c.png", setName: "Set", number: "1" };
}

describe("nearby payload", () => {
  it("round-trips name, note, and card ids without photos", () => {
    const raw = encodeNearbyPayload(me);
    expect(raw).not.toMatch(/https:/);
    const back = decodeNearbyPayload(raw);
    expect(back?.userId).toBe("u1");
    expect(back?.name).toBe("Kai");
    expect(back?.note).toBe("Red hoodie");
    expect(back?.have[0]?.id).toBe("base1-58");
    expect(back?.want[0]?.id).toBe("base1-4");
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(BLE_MAX_PLAINTEXT);
  });

  it("sends every card at max name, note, and 12 + 12 long ids", () => {
    expect(BLE_PROTOCOL_VERSION).toBe(2);
    expect(BLE_FRAME_OVERHEAD).toBe(94);
    expect(BLE_SINGLE_PACKET).toBe(514);
    expect(BLE_MAX_FRAME).toBe(2048);
    expect(BLE_MAX_PLAINTEXT).toBe(2048 - 94);
    const have = Array.from({ length: 12 }, (_, i) => card(`swsh12pt5gg-GG${String(i).padStart(2, "0")}`));
    const want = Array.from({ length: 12 }, (_, i) => card(`sv8pt5-${200 + i}`));
    const max: Presence = {
      userId: "12345678-1234-1234-1234-123456789abc",
      name: "N".repeat(24),
      note: "O".repeat(40),
      have,
      want,
      ts: 1_731_400_000_000,
    };
    const raw = encodeNearbyPayload(max);
    const bytes = new TextEncoder().encode(raw).length;
    expect(plaintextFitsCeiling(bytes)).toBe(true);
    expect(plaintextFitsTargetMtu(bytes)).toBe(false);
    expect(nearbyFrameLength(bytes)).toBeGreaterThan(BLE_SINGLE_PACKET);
    expect(nearbyFrameLength(bytes)).toBeLessThanOrEqual(BLE_MAX_FRAME);
    const back = decodeNearbyPayload(raw);
    expect(back?.name).toBe("N".repeat(24));
    expect(back?.note).toBe("O".repeat(40));
    expect(back?.have.map((c) => c.id)).toEqual(have.map((c) => c.id));
    expect(back?.want.map((c) => c.id)).toEqual(want.map((c) => c.id));
  });

  it("refuses a profile over 2 KB instead of dropping cards", () => {
    const fat = "x".repeat(200);
    const over: Presence = {
      userId: "u",
      name: "N".repeat(24),
      note: "O".repeat(40),
      have: Array.from({ length: 12 }, (_, i) => card(`${fat}${i}`)),
      want: Array.from({ length: 12 }, (_, i) => card(`${fat}w${i}`)),
      ts: 1,
    };
    expect(() => encodeNearbyPayload(over)).toThrow(/PAYLOAD_TOO_LARGE/);
    try {
      encodeNearbyPayload(over);
    } catch (err) {
      expect(payloadTooLarge(err)).toBe(true);
    }
  });
});

describe("nearby radio errors", () => {
  it("maps location and bluetooth failures, including a code-only bridge error", () => {
    expect(nearbyBlockFromError({ code: "LOCATION_OFF", message: "Turn on Location" })).toBe("location");
    expect(nearbyBlockFromError({ code: "BLUETOOTH_OFF" })).toBe("bluetooth");
    expect(nearbyBlockFromError(new Error("LOCATION_OFF"))).toBe("location");
    expect(nearbyBlockFromError(new Error("Allow Bluetooth, then tap I’m looking."))).toBeNull();
    expect(nearbyBlockFromError({ code: "PERMISSION_BLOCKED" })).toBe("settings");
    expect(nearbyBlockFromError({ code: "PERMISSION_DENIED" })).toBe("permission");
  });

  it("caps a peer profile instead of keeping a huge name or list", () => {
    const raw = JSON.stringify({
      userId: "u".repeat(80),
      name: "N".repeat(80),
      note: "O".repeat(80),
      have: Array.from({ length: 20 }, (_, i) => `h${i}`),
      want: Array.from({ length: 20 }, (_, i) => `w${i}`),
      ts: 5,
    });
    expect(decodeNearbyPayload(raw)).toBeNull();
    const trimmed = decodeNearbyPayload(raw.replace("u".repeat(80), "user-1"));
    expect(trimmed?.name).toBe("N".repeat(24));
    expect(trimmed?.note).toBe("O".repeat(40));
    expect(trimmed?.have).toHaveLength(12);
    expect(trimmed?.want).toHaveLength(12);
  });
});
