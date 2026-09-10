import { describe, expect, it } from "vitest";
import { geoTopic, mqttBrokerUrl } from "./presence";

describe("presence topics", () => {
  it("puts looking on a geo cell", () => {
    expect(geoTopic("c3nfk3x")).toBe("tableping/v2/geo/c3nfk3x");
  });

  it("refuses the public HiveMQ demo broker", () => {
    expect(mqttBrokerUrl()).toBeNull();
  });
});
