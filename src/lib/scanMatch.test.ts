import { describe, expect, it } from "vitest";
import { SAMPLE_CHARIZARD, SAMPLE_PIKACHU, searchLocalCatalog } from "./cards";
import {
  collectorNumberKey,
  decideScanMatch,
  parseCardOcr,
  parseCollectorNumber,
  rankByCollectorNumber,
} from "./scanMatch";
import type { Card } from "../types";

function card(id: string, name: string, number: string): Card {
  return { id, name, image: "x", setName: "s", number };
}

describe("parseCardOcr", () => {
  it("reads a Base Set Pikachu name and collector number", () => {
    const parsed = parseCardOcr("BASIC\nPIKACHU 60 HP\nLightning\nGnaw 10\n58/102");
    expect(parsed.query?.toLowerCase()).toBe("pikachu");
    expect(parsed.number).toBe("58");
    expect(parsed.setSize).toBe("102");
    expect(parsed.speciesHit).toBe(true);
    expect(parsed.confidence).toBe("high");
  });

  it("reads Charizard plus a VMAX suffix", () => {
    const parsed = parseCardOcr("CHARIZARD VMAX\n300 HP\nFire\n20/192");
    expect(parsed.query?.toLowerCase()).toContain("charizard");
    expect(parsed.query).toMatch(/VMAX/i);
    expect(parsed.number).toBe("20");
  });

  it("fuzzy-matches common OCR typos", () => {
    const parsed = parseCardOcr("P1KACHU 60HP\n58/102");
    expect(parsed.query?.toLowerCase()).toBe("pikachu");
    expect(parsed.number).toBe("58");
  });

  it("keeps a Dark prefix when the species is clear", () => {
    const parsed = parseCardOcr("DARK CHARIZARD\nFire\n4/82");
    expect(parsed.query?.toLowerCase()).toContain("charizard");
    expect(parsed.query?.toLowerCase()).toContain("dark");
  });

  it("returns none when the frame has no card name", () => {
    const parsed = parseCardOcr("60 HP\nWEAKNESS\nRESISTANCE");
    expect(parsed.query).toBeNull();
    expect(parsed.confidence).toBe("none");
  });
});

describe("collector numbers", () => {
  it("parses slash numbers and promo-style ids", () => {
    expect(parseCollectorNumber("Pikachu\n58/102")).toEqual({ number: "58", setSize: "102" });
    expect(parseCollectorNumber("Promo SWSH015")?.number.toLowerCase()).toBe("swsh015");
  });

  it("treats 058 and 58 as the same printed number", () => {
    expect(collectorNumberKey("058")).toBe("58");
    expect(collectorNumberKey("SWSH015")).toBe("swsh015");
  });

  it("puts the matching number first", () => {
    const ranked = rankByCollectorNumber(
      [card("a", "Pikachu", "1"), card("b", "Pikachu", "58"), card("c", "Pikachu", "25")],
      "58",
    );
    expect(ranked[0].id).toBe("b");
  });
});

describe("decideScanMatch", () => {
  it("confirms when name + number point at one printing", () => {
    const parsed = parseCardOcr("PIKACHU\n58/102");
    const local = searchLocalCatalog(parsed.query!);
    const decision = decideScanMatch(local, parsed);
    expect(decision.confidence).toBe("high");
    expect(decision.candidates[0].id).toBe(SAMPLE_PIKACHU.id);
    expect(decision.candidates[0].name).toBe("Pikachu");
  });

  it("asks the user to pick when several printings match the name", () => {
    const parsed = parseCardOcr("PIKACHU 60 HP");
    const local = searchLocalCatalog(parsed.query!);
    const decision = decideScanMatch(local, parsed);
    expect(local.length).toBeGreaterThan(1);
    expect(decision.confidence).toBe("low");
    expect(decision.candidates.length).toBeGreaterThan(1);
    expect(decision.candidates.every((c) => c.name.toLowerCase().includes("pikachu"))).toBe(true);
  });

  it("returns none when the catalog has no hit", () => {
    const decision = decideScanMatch([], parseCardOcr("MISSINGNO\n1/1"));
    expect(decision.confidence).toBe("none");
    expect(decision.candidates).toEqual([]);
  });

  it("confirms a unique Charizard number from the local catalog", () => {
    const parsed = parseCardOcr("STAGE 2\nCHARIZARD 120 HP\n4/102");
    const decision = decideScanMatch(searchLocalCatalog(parsed.query!), parsed);
    expect(decision.confidence).toBe("high");
    expect(decision.candidates[0].id).toBe(SAMPLE_CHARIZARD.id);
  });
});
