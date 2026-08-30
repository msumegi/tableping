import { useEffect, useRef, useState } from "react";
import { YOU_PHOTO_HINT } from "./lib/copy";
import {
  captureVideoStill,
  getFacingStream,
  oppositeFacing,
  profileCameraDeniedMessage,
  type CameraFacing,
} from "./lib/camera";

export function ProfilePhotoSheet({
  onClose,
  onPhoto,
}: {
  onClose: () => void;
  onPhoto: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<CameraFacing>("user");
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(YOU_PHOTO_HINT);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setReady(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      try {
        const stream = await getFacingStream(facing);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setReady(true);
        setErr(YOU_PHOTO_HINT);
      } catch {
        if (!cancelled) {
          setReady(false);
          setErr(profileCameraDeniedMessage());
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  async function takePhoto() {
    const video = videoRef.current;
    if (!video) return;
    try {
      const blob = await captureVideoStill(video);
      onPhoto(new File([blob], "profile.jpg", { type: blob.type || "image/jpeg" }));
    } catch {
      setErr("Could not take that photo.");
    }
  }

  const errorish = /can't use the camera|permission denied|Could not take/i.test(err);

  return (
    <div className="qr-sheet" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2 className="panel-title">Your photo</h2>
        <div className="video-wrap selfie-wrap">
          <video
            ref={videoRef}
            className={facing === "user" ? "mirror" : undefined}
            playsInline
            muted
            autoPlay
          />
          <button
            className="chip selfie-flip"
            disabled={!ready}
            onClick={() => setFacing((current) => oppositeFacing(current))}
          >
            Flip camera
          </button>
        </div>
        <p className={errorish ? "status error" : "hint"}>{err}</p>
        <div className="sheet-actions">
          <button className="btn ember full" disabled={!ready} onClick={() => void takePhoto()}>
            Take photo
          </button>
        </div>
        <div className="sheet-actions">
          <label className="btn secondary full photo-pick">
            Choose from library
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onPhoto(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="sheet-actions">
          <button className="btn secondary full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
