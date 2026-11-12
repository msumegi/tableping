import { describe, expect, it } from "vitest";
import {
  BLE_FRAME_OVERHEAD,
  BLE_MAX_FRAME,
  BLE_MAX_PLAINTEXT,
  BLE_PROTOCOL_VERSION,
  BLE_TARGET_MTU,
  decodeNearbyPayload,
  encodeNearbyPayload,
  nearbyBlockFromError,
  nearbyFrameLength,
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

  it("frames v2 inside the MTU 517 budget at max name, note, and card counts", () => {
    expect(BLE_PROTOCOL_VERSION).toBe(2);
    expect(BLE_FRAME_OVERHEAD).toBe(1 + 65 + 12 + 16);
    expect(BLE_MAX_FRAME).toBe(BLE_TARGET_MTU - 3);
    expect(BLE_MAX_PLAINTEXT).toBe(420);
    const max: Presence = {
      userId: "12345678-1234-1234-1234-123456789abc",
      name: "N".repeat(24),
      note: "O".repeat(40),
      have: Array.from({ length: 12 }, (_, i) => card(`swsh12pt5gg-GG${String(i).padStart(2, "0")}`)),
      want: Array.from({ length: 12 }, (_, i) => card(`sv8pt5-${200 + i}`)),
      ts: 1_731_400_000_000,
    };
    const raw = encodeNearbyPayload(max);
    const bytes = new TextEncoder().encode(raw).length;
    expect(plaintextFitsTargetMtu(bytes)).toBe(true);
    expect(nearbyFrameLength(bytes)).toBe(bytes + 94);
    expect(nearbyFrameLength(bytes)).toBeLessThanOrEqual(BLE_MAX_FRAME);
    const back = decodeNearbyPayload(raw);
    expect(back?.name).toBe("N".repeat(24));
    expect(back?.note).toBe("O".repeat(40));
    expect(back?.have.length).toBeLessThanOrEqual(12);
    expect(back?.want.length).toBeLessThanOrEqual(12);
    expect((back?.have.length ?? 0) + (back?.want.length ?? 0)).toBeGreaterThan(0);
  });
});

describe("nearby radio errors", () => {
  it("maps location and bluetooth failures, including a code-only bridge error", () => {
    expect(nearbyBlockFromError({ code: "LOCATION_OFF", message: "Turn on Location" })).toBe("location");
    expect(nearbyBlockFromError({ code: "BLUETOOTH_OFF" })).toBe("bluetooth");
    expect(nearbyBlockFromError(new Error("LOCATION_OFF"))).toBe("location");
    expect(nearbyBlockFromError(new Error("Allow Bluetooth, then tap I’m looking."))).toBeNull();
  });
});
