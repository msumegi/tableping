import { describe, expect, it } from "vitest";
import {
  TCGDEX_ENGLISH_SETS,
  TCGDEX_MAPPED_SETS,
  TCGDEX_SET_MAP,
  collectorNumber,
  fromTcgdexBrief,
  tcgdexThumbUrl,
} from "./tcgdex";

describe("TCGdex set ids", () => {
  it("maps 177 of 221 English sets and skips the rest", () => {
    expect(TCGDEX_ENGLISH_SETS).toBe(221);
    expect(TCGDEX_MAPPED_SETS).toBe(177);
    expect(Object.keys(TCGDEX_SET_MAP)).toHaveLength(177);
    expect(TCGDEX_SET_MAP.base1).toEqual({ ptcg: "base1", name: "Base" });
    expect(TCGDEX_SET_MAP.base2).toEqual({ ptcg: "base2", name: "Jungle" });
    expect(TCGDEX_SET_MAP["sv03.5"]).toEqual({ ptcg: "sv3pt5", name: "151" });
    expect(TCGDEX_SET_MAP.swshp).toEqual({ ptcg: "swshp", name: "SWSH Black Star Promos" });
    expect(TCGDEX_SET_MAP.A1).toBeUndefined();
    expect(TCGDEX_SET_MAP.jumbo).toBeUndefined();
  });

  it("keeps pokemontcg.io ids for base, jungle, a modern set, a promo, and drops an unmapped set", () => {
    expect(collectorNumber("006")).toBe("6");
    expect(collectorNumber("SWSH050")).toBe("SWSH050");
    expect(tcgdexThumbUrl("https://assets.tcgdex.net/en/base/base1/4")).toBe(
      "https://assets.tcgdex.net/en/base/base1/4/low.webp",
    );

    expect(
      fromTcgdexBrief({
        id: "base1-4",
        localId: "4",
        name: "Charizard",
        image: "https://assets.tcgdex.net/en/base/base1/4",
        rarity: "Rare",
      }),
    ).toEqual({
      id: "base1-4",
      name: "Charizard",
      image: "https://assets.tcgdex.net/en/base/base1/4/low.webp",
      setName: "Base",
      number: "4",
      rarity: "Rare",
    });

    expect(
      fromTcgdexBrief({
        id: "base2-8",
        localId: "8",
        name: "Pidgeot",
        image: "https://assets.tcgdex.net/en/base/base2/8",
      }),
    ).toMatchObject({ id: "base2-8", name: "Pidgeot", number: "8", setName: "Jungle" });

    expect(
      fromTcgdexBrief({
        id: "sv03.5-006",
        localId: "006",
        name: "Charizard ex",
        image: "https://assets.tcgdex.net/en/sv/sv03.5/006",
      }),
    ).toMatchObject({ id: "sv3pt5-6", number: "6", setName: "151" });

    expect(
      fromTcgdexBrief({
        id: "swshp-SWSH050",
        localId: "SWSH050",
        name: "Charizard V",
        image: "https://assets.tcgdex.net/en/swsh/swshp/SWSH050",
      }),
    ).toMatchObject({ id: "swshp-SWSH050", number: "SWSH050", setName: "SWSH Black Star Promos" });

    expect(
      fromTcgdexBrief({
        id: "A1-035",
        localId: "035",
        name: "Charizard",
        image: "https://assets.tcgdex.net/en/tcgp/A1/035",
      }),
    ).toBeNull();
  });
});
