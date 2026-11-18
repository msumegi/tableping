import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Card } from "./types";
import { SEARCH_UNAVAILABLE } from "./lib/cards";
import { SEARCH_SAVED_ONLY } from "./lib/copy";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { searchCardList } = vi.hoisted(() => ({ searchCardList: vi.fn() }));

vi.mock("./lib/cards", async () => {
  const actual = await vi.importActual<typeof import("./lib/cards")>("./lib/cards");
  return { ...actual, searchCardList };
});

import { CardSearchPanel } from "./CardSearch";

const pikachu: Card = { id: "p", name: "Pikachu", image: "p.png", setName: "Base", number: "58" };
const charizard: Card = { id: "c", name: "Charizard", image: "c.png", setName: "Base", number: "4" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("CardSearchPanel", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    searchCardList.mockReset();
  });

  function render() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(createElement(CardSearchPanel, { onPick: () => {}, showChips: false }));
    });
    return host;
  }

  function typeQuery(node: HTMLElement, value: string) {
    const input = node.querySelector("input");
    if (!input) throw new Error("missing search box");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("clears stale cards when a search fails and ignores an older response", async () => {
    const node = render();
    const first = deferred<{ cards: Card[]; savedOnly: boolean }>();
    const second = deferred<{ cards: Card[]; savedOnly: boolean }>();
    searchCardList.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

    await act(async () => {
      typeQuery(node, "Pi");
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await act(async () => {
      typeQuery(node, "Pikachu");
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    await act(async () => {
      second.resolve({ cards: [charizard], savedOnly: false });
      await second.promise;
    });
    expect(node.textContent).toContain("Charizard");
    expect(node.textContent).not.toContain("Pikachu");

    await act(async () => {
      first.resolve({ cards: [pikachu], savedOnly: false });
      await first.promise;
    });
    expect(node.textContent).toContain("Charizard");
    expect(node.textContent).not.toContain("Pikachu");
    expect(node.textContent).not.toContain(SEARCH_SAVED_ONLY);

    const failed = deferred<{ cards: Card[]; savedOnly: boolean }>();
    searchCardList.mockImplementationOnce(() => failed.promise);
    await act(async () => {
      typeQuery(node, "Missing");
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await act(async () => {
      failed.reject(new Error("offline"));
      await failed.promise.catch(() => undefined);
    });
    expect(node.textContent).toContain(SEARCH_UNAVAILABLE);
    expect(node.querySelector(".status.error")?.getAttribute("role")).toBe("status");
    expect(node.textContent).not.toContain("Charizard");
    expect(node.textContent).not.toContain(SEARCH_SAVED_ONLY);
  });

  it("shows the saved-cards line only when the full list is unreachable", async () => {
    const node = render();
    const saved = deferred<{ cards: Card[]; savedOnly: boolean }>();
    searchCardList.mockImplementationOnce(() => saved.promise);
    await act(async () => {
      typeQuery(node, "Pikachu");
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await act(async () => {
      saved.resolve({ cards: [pikachu], savedOnly: true });
      await saved.promise;
    });
    const notice = node.querySelector(".hint");
    expect(notice?.textContent).toBe(SEARCH_SAVED_ONLY);
    expect(notice?.getAttribute("role")).toBe("status");
    expect(node.textContent).toContain("Pikachu");
    expect(node.querySelector(".status.error")).toBeNull();

    const live = deferred<{ cards: Card[]; savedOnly: boolean }>();
    searchCardList.mockImplementationOnce(() => live.promise);
    await act(async () => {
      typeQuery(node, "Charizard");
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(node.textContent).not.toContain(SEARCH_SAVED_ONLY);
    await act(async () => {
      live.resolve({ cards: [charizard], savedOnly: false });
      await live.promise;
    });
    expect(node.textContent).not.toContain(SEARCH_SAVED_ONLY);
    expect(node.textContent).toContain("Charizard");
  });
});
