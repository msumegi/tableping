import { describe, expect, it } from "vitest";
import { decodeNearbyPayload, encodeNearbyPayload } from "./bleNearby";
import type { Presence } from "../types";

const me: Presence = {
  userId: "u1",
  name: "Kai",
  note: "Red hoodie",
  have: [{ id: "base1-58", name: "Pikachu", image: "https://x/p.png", setName: "Base", number: "58" }],
  want: [{ id: "base1-4", name: "Charizard", image: "https://x/c.png", setName: "Base", number: "4" }],
  ts: 1,
};

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
  });
});
