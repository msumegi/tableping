import { useRef, useState } from "react";
import { CardScanLoop } from "./CardScanLoop";
import { CardSearchPanel } from "./CardSearch";
import type { Card } from "./types";

export function AddCardSheet({
  target,
  existingIds,
  onClose,
  onPick,
  onPickKeepOpen,
}: {
  target: "have" | "want";
  existingIds: Set<string>;
  onClose: () => void;
  onPick: (card: Card) => void;
  onPickKeepOpen: (card: Card) => void;
}) {
  const [mode, setMode] = useState<"search" | "scan">("search");
  const streamPromiseRef = useRef<Promise<MediaStream> | null>(null);

  function openScan() {
    if (navigator.mediaDevices?.getUserMedia) {
      streamPromiseRef.current = navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } else {
      streamPromiseRef.current = Promise.reject(new Error("no camera"));
    }
    setMode("scan");
  }

  return (
    <div className="search-sheet" onClick={mode === "search" ? onClose : undefined}>
      <div className="sheet fullish" onClick={(e) => e.stopPropagation()}>
        {mode === "scan" ? (
          <CardScanLoop
            target={target}
            existingIds={existingIds}
            streamPromise={streamPromiseRef.current}
            onAdded={onPickKeepOpen}
            onDone={onClose}
          />
        ) : (
          <>
            <div className="grab" />
            <h2 className="panel-title">Add to {target === "have" ? "Have" : "Want"}</h2>
            <p className="lede">Scan a card, or type a name.</p>
            <button type="button" className="btn ember full" onClick={openScan}>
              Scan cards
            </button>
            <p className="hint" style={{ margin: "10px 0 8px" }}>
              Or type a name, or a name and set.
            </p>
            <CardSearchPanel onPick={onPick} autoFocus />
            <div className="sheet-actions">
              <button className="btn secondary full" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
