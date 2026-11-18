import { createElement } from "react";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CardImage } from "./CardImage";

describe("CardImage", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  function render(src: string | undefined, name: string) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(createElement(CardImage, { src, name }));
    });
    return host;
  }

  it("shows icon G, with the card name for screen readers, when the picture is missing", () => {
    const node = render("", "Pikachu");
    const tile = node.querySelector(".card-fallback");
    const logo = node.querySelector(".card-fallback-logo");
    expect(tile?.getAttribute("aria-label")).toBe("Pikachu");
    expect(logo?.getAttribute("src") || "").toMatch(/icon-g-foreground/);
    expect(logo?.getAttribute("alt")).toBe("");
  });

  it("swaps a failed picture for icon G instead of a broken image", () => {
    const node = render("https://images.example/missing.png", "Charizard");
    const picture = node.querySelector("img");
    expect(picture?.getAttribute("alt")).toBe("Charizard");
    act(() => {
      picture?.dispatchEvent(new Event("error"));
    });
    const tile = node.querySelector(".card-fallback");
    expect(tile?.getAttribute("aria-label")).toBe("Charizard");
    expect(node.querySelector(".card-fallback-logo")).toBeTruthy();
  });
});
