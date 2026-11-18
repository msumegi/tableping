import { describe, expect, it } from "vitest";
import { geoTopic, mqttBrokerUrl } from "./presence";

describe("presence topics", () => {
  it("puts looking on a geo cell", () => {
    expect(geoTopic("c3nfk3x")).toBe("tableping/v2/geo/c3nfk3x");
  });

  it("refuses the public HiveMQ demo broker", () => {
    expect(mqttBrokerUrl()).toBeNull();
  });

  it("refuses every broker in a production build, including a private one", () => {
    expect(mqttBrokerUrl({ prod: true, url: "mqtts://radio.example:8883" })).toBeNull();
    expect(mqttBrokerUrl({ prod: false, url: "mqtt://broker.hivemq.com:1883" })).toBeNull();
    expect(mqttBrokerUrl({ prod: false, url: "mqtts://radio.example:8883" })).toBe("mqtts://radio.example:8883");
  });
});
