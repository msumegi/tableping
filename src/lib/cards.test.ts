import { describe, expect, it } from "vitest";
import { rankSearchResults } from "./cards";
import type { Card } from "../types";

function card(id: string, name: string): Card {
  return { id, name, image: "x", setName: "s", number: "1" };
}

describe("search ranking", () => {
  it("puts exact Pokémon name printings ahead of named variants", () => {
    const ranked = rankSearchResults("Pikachu", [
      card("fut2020-1", "Pikachu on the Ball"),
      card("base1-58", "Pikachu"),
      card("cel25-6", "Flying Pikachu V"),
      card("basep-1", "Pikachu"),
    ]);
    expect(ranked.map((c) => c.name)).toEqual([
      "Pikachu",
      "Pikachu",
      "Pikachu on the Ball",
      "Flying Pikachu V",
    ]);
  });
});
