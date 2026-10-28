import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { PLAY_STORE_URL } from "./invite";

describe("install invite", () => {
  it("keeps the Play Store placeholder in one constant and draws the QR locally", async () => {
    expect(PLAY_STORE_URL).toBe("https://play.google.com/store/apps/details?id=com.rangeroadtech.tabletrade");
    const url = await QRCode.toDataURL(PLAY_STORE_URL, { width: 128, margin: 1 });
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
