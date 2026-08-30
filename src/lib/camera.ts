export type CameraFacing = "user" | "environment";

export function videoConstraintsForFacing(facing: CameraFacing): MediaTrackConstraints {
  return { facingMode: { ideal: facing } };
}

export function mediaConstraintsForFacing(facing: CameraFacing): MediaStreamConstraints {
  return { video: videoConstraintsForFacing(facing), audio: false };
}

export function oppositeFacing(facing: CameraFacing): CameraFacing {
  return facing === "user" ? "environment" : "user";
}

export function facingLabelMatches(label: string, facing: CameraFacing): boolean {
  const text = label.toLowerCase();
  if (facing === "user") return /front|user|face|selfie/.test(text);
  return /back|rear|environment|world/.test(text);
}

export function profileCameraDeniedMessage(): string {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "This page can't use the camera. Open TableTrade at https://msumegi.github.io/tableping/.";
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
    return "This browser can't use the camera. Try Chrome on Android.";
  }
  return "Camera permission denied. You can still choose a photo from the library.";
}

export async function getFacingStream(facing: CameraFacing): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("no camera");
  }
  const stream = await navigator.mediaDevices.getUserMedia(mediaConstraintsForFacing(facing));
  const track = stream.getVideoTracks()[0];
  if (track?.getSettings?.()?.facingMode === facing) return stream;

  const devices = (await navigator.mediaDevices.enumerateDevices?.()) ?? [];
  const match = devices.find(
    (device) => device.kind === "videoinput" && device.deviceId && facingLabelMatches(device.label, facing),
  );
  if (!match) return stream;

  stream.getTracks().forEach((t) => t.stop());
  return navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: match.deviceId } },
    audio: false,
  });
}

export function captureVideoStill(video: HTMLVideoElement, mime = "image/jpeg", quality = 0.92): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) {
    return Promise.reject(new Error("Camera is not ready."));
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not take that photo."));
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not take that photo."));
    }, mime, quality);
  });
}
