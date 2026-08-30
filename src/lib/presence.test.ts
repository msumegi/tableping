import { describe, expect, it } from "vitest";
import { geoTopic, shopTopic, tableTopic } from "./presence";

describe("presence topics", () => {
  it("puts check-in on a shop channel, not a geo cell", () => {
    expect(shopTopic("wizards-loft-red-deer")).toBe("tableping/v1/shop/wizards-loft-red-deer");
    expect(tableTopic("AB12")).toBe("tableping/v1/table/AB12");
    expect(geoTopic("c3nfk3x")).toBe("tableping/v1/geo/c3nfk3x");
    expect(shopTopic("wizards-loft-red-deer")).not.toMatch(/\/geo\//);
  });
});
