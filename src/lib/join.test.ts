import { describe, expect, it } from "vitest";
import { pageJoinUrl, readJoinCodeFromUrl, stripJoinParams, tableJoinUrl } from "./join";

describe("table join URLs", () => {
  it("writes a join query on the GitHub Pages app path", () => {
    expect(tableJoinUrl("https://msumegi.github.io/tableping/", "k7m2")).toBe(
      "https://msumegi.github.io/tableping/?join=K7M2",
    );
  });

  it("replaces an existing join param and drops the hash", () => {
    expect(tableJoinUrl("https://msumegi.github.io/tableping/?join=OLD#x", "AB3D")).toBe(
      "https://msumegi.github.io/tableping/?join=AB3D",
    );
  });

  it("builds from origin + pathname", () => {
    expect(pageJoinUrl("ab3d", { origin: "https://msumegi.github.io", pathname: "/tableping/" })).toBe(
      "https://msumegi.github.io/tableping/?join=AB3D",
    );
  });

  it("reads join, t, code, and table query keys", () => {
    expect(readJoinCodeFromUrl("https://msumegi.github.io/tableping/?join=K7M2")).toBe("K7M2");
    expect(readJoinCodeFromUrl("https://msumegi.github.io/tableping/?t=ab3d")).toBe("AB3D");
    expect(readJoinCodeFromUrl("https://msumegi.github.io/tableping/?code=WXYZ")).toBe("WXYZ");
    expect(readJoinCodeFromUrl("https://msumegi.github.io/tableping/?table=pl9q")).toBe("PL9Q");
  });

  it("reads hash-style join deep links", () => {
    expect(readJoinCodeFromUrl("https://msumegi.github.io/tableping/#join=K7M2")).toBe("K7M2");
    expect(readJoinCodeFromUrl("https://msumegi.github.io/tableping/#/join/AB3D")).toBe("AB3D");
  });

  it("ignores short or empty codes", () => {
    expect(readJoinCodeFromUrl("https://msumegi.github.io/tableping/")).toBeNull();
    expect(readJoinCodeFromUrl("https://msumegi.github.io/tableping/?join=AB")).toBeNull();
  });

  it("strips join params after consume", () => {
    expect(stripJoinParams("https://msumegi.github.io/tableping/?join=K7M2&x=1")).toBe(
      "/tableping/?x=1",
    );
  });
});
