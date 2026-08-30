import { describe, expect, it } from "vitest";
import { initialsFromName } from "./photo";

describe("profile initials", () => {
  it("uses a name you can call out", () => {
    expect(initialsFromName("Kai")).toBe("K");
    expect(initialsFromName("Matt Sumegi")).toBe("MS");
    expect(initialsFromName("")).toBe("T");
  });
});
