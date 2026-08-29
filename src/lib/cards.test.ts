import { afterEach, describe, expect, it, vi } from "vitest";
import {
  QUICK_SEARCHES,
  SEARCH_UNAVAILABLE,
  findCardsFromScan,
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
});
