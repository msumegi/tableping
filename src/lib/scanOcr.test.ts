import { describe, expect, it } from "vitest";
import { coverCropSource } from "./scanOcr";

describe("coverCropSource", () => {
  it("maps a centered overlay on a cover-fitted frame back to source pixels", () => {
    const srcW = 1920;
    const srcH = 1080;
    const elW = 390;
    const elH = 520;
    const crop = coverCropSource(srcW, srcH, elW, elH, { x: 0.19, y: 0.12, w: 0.62, h: 0.76 });
    expect(crop.sw).toBeGreaterThan(100);
    expect(crop.sh).toBeGreaterThan(100);
    expect(crop.sx + crop.sw).toBeLessThanOrEqual(srcW + 1);
    expect(crop.sy + crop.sh).toBeLessThanOrEqual(srcH + 1);
  });

  it("handles a missing video frame without throwing", () => {
    expect(coverCropSource(0, 0, 390, 520, { x: 0, y: 0, w: 1, h: 1 })).toEqual({
      sx: 0,
      sy: 0,
      sw: 0,
      sh: 0,
    });
  });
});
