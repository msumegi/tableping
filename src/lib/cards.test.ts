import { afterEach, describe, expect, it, vi } from "vitest";
import {
  QUICK_SEARCHES,
  SEARCH_UNAVAILABLE,
  findCardsFromScan,
  parseCatalogQuery,
  rankSearchResults,
  searchCards,
  searchLocalCatalog,
} from "./cards";
import type { Card } from "../types";

function card(id: string, name: string): Card {
  return { id, name, image: "x", setName: "s", number: "1" };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
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

  it("puts the matching set first when the query includes a set name", () => {
    const ranked = rankSearchResults("umbreon evolving skies", [
      { id: "neo2-13", name: "Umbreon", image: "x", setName: "Neo Discovery", number: "13" },
      { id: "swsh7-95", name: "Umbreon VMAX", image: "x", setName: "Evolving Skies", number: "95" },
      { id: "hgss3-10", name: "Umbreon", image: "x", setName: "HS—Undaunted", number: "10" },
    ]);
    expect(ranked[0].id).toBe("swsh7-95");
    expect(ranked[0].setName).toBe("Evolving Skies");
  });
});

describe("parseCatalogQuery", () => {
  it("splits a Pokémon name from a following set phrase", () => {
    expect(parseCatalogQuery("umbreon evolving skies")).toEqual({
      name: "umbreon",
      set: "evolving skies",
    });
    expect(parseCatalogQuery("Charizard VMAX Evolving Skies")).toEqual({
      name: "Charizard VMAX",
      set: "Evolving Skies",
    });
    expect(parseCatalogQuery("Pikachu")).toEqual({ name: "Pikachu" });
  });
});

describe("searchCards", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns [] for an empty or short query without calling the catalog", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchCards("")).toEqual([]);
    expect(await searchCards(" ")).toEqual([]);
    expect(await searchCards("P")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps Pokémon TCG API results into the app card shape", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: "base1-58",
            name: "Pikachu",
            number: "58",
            set: { name: "Base" },
            images: { small: "https://images.pokemontcg.io/base1/58.png" },
          },
          {
            id: "xy1-1",
            name: "Venusaur-EX",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const cards = await searchCards("Pikachu");
    expect(fetchMock).toHaveBeenCalled();
    expect(JSON.stringify(fetchMock.mock.calls)).toContain("api.pokemontcg.io/v2/cards");
    expect(JSON.stringify(fetchMock.mock.calls)).toContain("name");
    expect(cards).toEqual([
      {
        id: "base1-58",
        name: "Pikachu",
        image: "https://images.pokemontcg.io/base1/58.png",
        setName: "Base",
        number: "58",
      },
    ]);
  });

  it("queries name and set when the typed text includes a set", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: "swsh7-95",
            name: "Umbreon VMAX",
            number: "95",
            set: { name: "Evolving Skies" },
            images: { small: "https://images.pokemontcg.io/swsh7/95.png" },
          },
          {
            id: "neo2-13",
            name: "Umbreon",
            number: "13",
            set: { name: "Neo Discovery" },
            images: { small: "https://images.pokemontcg.io/neo2/13.png" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const cards = await searchCards("umbreon evolving skies");
    const called = JSON.stringify(fetchMock.mock.calls);
    expect(called).toContain("api.pokemontcg.io/v2/cards");
    expect(called).toContain("set.name");
    expect(cards[0]).toMatchObject({
      id: "swsh7-95",
      name: "Umbreon VMAX",
      setName: "Evolving Skies",
    });
    expect(cards.every((c) => c.setName.toLowerCase().includes("evolving"))).toBe(true);
  });

  it("falls back to the local catalog when the API network-fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const cards = await searchCards("Pikachu");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.some((c) => c.name === "Pikachu")).toBe(true);
    expect(cards.every((c) => c.id && c.name && c.image && "setName" in c && "number" in c)).toBe(
      true,
    );
  });

  it("falls back to the local catalog when the API returns HTTP 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "boom" }, 500)));
    const cards = await searchCards("Charizard");
    expect(cards.some((c) => c.name === "Charizard")).toBe(true);
  });

  it("findCardsFromScan ranks a number hit first and falls back locally", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("number:")) {
        return jsonResponse({
          data: [
            {
              id: "base1-58",
              name: "Pikachu",
              number: "58",
              set: { name: "Base" },
              images: { small: "https://images.pokemontcg.io/base1/58.png" },
            },
          ],
        });
      }
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const cards = await findCardsFromScan("Pikachu", "58");
    expect(JSON.stringify(fetchMock.mock.calls)).toContain("number");
    expect(cards[0]).toMatchObject({ id: "base1-58", name: "Pikachu", number: "58" });
  });

  it("findCardsFromScan uses the local catalog when the API is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const cards = await findCardsFromScan("Charizard", "4");
    expect(cards[0].name).toBe("Charizard");
    expect(cards[0].number).toBe("4");
  });

  it("never surfaces the browser Failed to fetch text when API and local miss", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(searchCards("zzzxqwy")).rejects.toThrow(SEARCH_UNAVAILABLE);
    await expect(searchCards("zzzxqwy")).rejects.not.toThrow(/Failed to fetch/);
  });
});

describe("local catalog", () => {
  it("covers the quick-search Pokémon names", () => {
    for (const name of QUICK_SEARCHES) {
      const hits = searchLocalCatalog(name);
      expect(hits.length, name).toBeGreaterThan(0);
      expect(
        hits.some((c) => c.name.toLowerCase() === name.toLowerCase()),
        `${name} exact printing`,
      ).toBe(true);
    }
  });

  it("matches a set name in the query, not only the Pokémon name", () => {
    const hits = searchLocalCatalog("umbreon evolving skies");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].setName.toLowerCase()).toContain("evolving skies");
    expect(hits[0].name.toLowerCase()).toContain("umbreon");
  });

  it("includes Charizard and Pikachu in the quick chips", () => {
    expect(QUICK_SEARCHES).toContain("Charizard");
    expect(QUICK_SEARCHES).toContain("Pikachu");
    expect(QUICK_SEARCHES.slice(0, 2).sort()).toEqual(["Charizard", "Pikachu"]);
  });
});
