import { beforeEach, describe, expect, it } from "vitest";
import { loadSettings } from "./storage";

const SETTINGS = "tableping.settings.v1";

describe("settings upgrade", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("deletes a stored profile photo and does not keep the field", () => {
    localStorage.setItem(
      SETTINGS,
      JSON.stringify({
        displayName: "Kai",
        userId: "u-1",
        photo: "data:image/jpeg;base64,abc",
        lookingNote: "Red hoodie, table 4",
      }),
    );
    const settings = loadSettings();
    expect(settings.displayName).toBe("Kai");
    expect(settings.lookingNote).toBe("Red hoodie, table 4");
    expect(settings).not.toHaveProperty("photo");
    const saved = JSON.parse(localStorage.getItem(SETTINGS) || "{}") as { photo?: unknown };
    expect(saved.photo).toBeUndefined();
    expect(JSON.stringify(saved)).not.toMatch(/photo/);
  });
});
