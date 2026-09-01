import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureVideoStill,
  facingLabelMatches,
  getFacingStream,
  mediaConstraintsForFacing,
  oppositeFacing,
  profileCameraDeniedMessage,
  videoConstraintsForFacing,
} from "./camera";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("profile vs card-scan camera facing", () => {
  it("asks the selfie camera for a face, and the rear camera for a card", () => {
    expect(videoConstraintsForFacing("user")).toEqual({ facingMode: { ideal: "user" } });
    expect(mediaConstraintsForFacing("user")).toEqual({
      video: { facingMode: { ideal: "user" } },
      audio: false,
    });
    expect(videoConstraintsForFacing("environment")).toEqual({ facingMode: { ideal: "environment" } });
    expect(oppositeFacing("user")).toBe("environment");
    expect(oppositeFacing("environment")).toBe("user");
  });

  it("matches Android-style front and back camera labels", () => {
    expect(facingLabelMatches("camera2 0, facing front", "user")).toBe(true);
    expect(facingLabelMatches("Front Camera", "user")).toBe(true);
    expect(facingLabelMatches("camera2 1, facing back", "environment")).toBe(true);
    expect(facingLabelMatches("Back Camera", "user")).toBe(false);
  });

  it("profile photo opens the selfie camera; card scan stays rear", () => {
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    const profile = readFileSync(join(root, "src/ProfilePhotoSheet.tsx"), "utf8");
    const add = readFileSync(join(root, "src/AddCardSheet.tsx"), "utf8");
    const loop = readFileSync(join(root, "src/CardScanLoop.tsx"), "utf8");

    expect(profile).toMatch(/useState<CameraFacing>\("user"\)/);
    expect(profile).toMatch(/getFacingStream\(facing\)/);
    expect(profile).not.toMatch(/capture="environment"/);
    expect(app).toMatch(/ProfilePhotoSheet/);
    expect(app).not.toMatch(/capture="environment"/);

    expect(add).toMatch(/facingMode: \{ ideal: "environment" \}/);
    expect(loop).toMatch(/facingMode: \{ ideal: "environment" \}/);
    expect(add).not.toMatch(/ideal: "user"/);
    expect(loop).not.toMatch(/ideal: "user"/);
  });
});

describe("getFacingStream", () => {
  it("requests facingMode user for a selfie", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream({ facingMode: "user" }));
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia, enumerateDevices: vi.fn() },
    });

    await getFacingStream("user");
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: "user" } },
      audio: false,
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("switches to a labeled front camera when the first stream is rear", async () => {
    const rear = fakeStream({ facingMode: "environment", deviceId: "rear" });
    const front = fakeStream({ facingMode: "user", deviceId: "front" });
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(rear)
      .mockResolvedValueOnce(front);
    const enumerateDevices = vi.fn().mockResolvedValue([
      { kind: "videoinput", deviceId: "rear", label: "camera2 1, facing back" },
      { kind: "videoinput", deviceId: "front", label: "camera2 0, facing front" },
    ]);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia, enumerateDevices } });

    const stream = await getFacingStream("user");
    expect(stream).toBe(front);
    expect(rear.getTracks()[0].stop).toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      video: { deviceId: { exact: "front" } },
      audio: false,
    });
  });
});

describe("profile camera copy and stills", () => {
  it("points people at the live site when the page is not secure", () => {
    vi.stubGlobal("window", { isSecureContext: false });
    expect(profileCameraDeniedMessage()).toMatch(/msumegi\.github\.io\/tableping/);
  });

  it("rejects a still when the video has no frame", async () => {
    const video = document.createElement("video");
    await expect(captureVideoStill(video)).rejects.toThrow(/not ready/i);
  });
});

function fakeStream(settings: { facingMode?: string; deviceId?: string }) {
  const track = { getSettings: () => settings, stop: vi.fn() };
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}
