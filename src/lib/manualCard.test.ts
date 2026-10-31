import { describe, expect, it } from "vitest";
import { manualCard } from "./manualCard";

describe("manual card", () => {
  it("stores an English name, set, and number without a catalog id", () => {
    const card = manualCard("Pikachu", "Base Set", "58");
    expect(card).toMatchObject({
      id: "manual:pikachu-base-set-58",
      name: "Pikachu",
      setName: "Base Set",
      number: "58",
      image: "",
    });
    expect(manualCard("  ", "Base", "1")).toBeNull();
  });
});