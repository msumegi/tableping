import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { CardSearchPanel } from "./CardSearch";
import { findCardsFromScan, hydrateSetName } from "./lib/cards";
import { cameraDeniedMessage, initialScanState, scanReducer } from "./lib/scanLoop";
import { decideScanMatch, parseCardOcr } from "./lib/scanMatch";
import { captureCardFrame, getOcrWorker, readCardImage, stopOcrWorker } from "./lib/scanOcr";
import type { Card } from "./types";

export function CardScanLoop({
  target,
  existingIds,
  streamPromise,
  onAdded,
  onDone,
}: {
  target: "have" | "want";
  existingIds: Set<string>;
  streamPromise: Promise<MediaStream> | null;
  onAdded: (card: Card) => void;
  onDone: () => void;
}) {
  const [state, dispatch] = useReducer(scanReducer, initialScanState);
  const [ocrReady, setOcrReady] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readingLock = useRef(false);
  const onAddedRef = useRef(onAdded);
  onAddedRef.current = onAdded;
  const existingRef = useRef(existingIds);
  existingRef.current = existingIds;

  const attachStream = useCallback(async (stream: MediaStream) => {
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    await video.play();
    setVideoReady(true);
    dispatch({ type: "cameraReady" });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const pending =
          streamPromise ??
          navigator.mediaDevices?.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
        if (!pending) throw new Error("no camera");
        const stream = await pending;
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        await attachStream(stream);
      } catch {
        if (!cancelled) dispatch({ type: "permissionDenied", message: cameraDeniedMessage() });
      }
    }

    async function startOcr() {
      try {
        await getOcrWorker();
        if (!cancelled) setOcrReady(true);
      } catch {
        if (!cancelled) dispatch({ type: "ocrUnavailable" });
      }
    }

    void startCamera();
    void startOcr();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void stopOcrWorker();
    };
  }, [attachStream, streamPromise]);

  const readOnce = useCallback(async () => {
    if (readingLock.current) return;
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame || video.readyState < 2 || !video.videoWidth) return;
    readingLock.current = true;
    dispatch({ type: "readStart" });
    try {
      const canvas = captureCardFrame(video, frame);
      const text = await readCardImage(canvas);
      const parsed = parseCardOcr(text);
      if (!parsed.query) {
        dispatch({ type: "readResult", candidates: [], confidence: "none" });
        return;
      }
      try {
        const cards = await findCardsFromScan(parsed.query, parsed.number);
        dispatch({ type: "readResult", ...decideScanMatch(cards, parsed) });
      } catch {
        dispatch({
          type: "readResult",
          candidates: [],
          confidence: "none",
          error: "Couldn't reach the card catalog. Type the name, or try Read again.",
        });
      }
    } catch {
      dispatch({
        type: "readResult",
        candidates: [],
        confidence: "none",
        error: "Couldn't read that card. Try again, or type the name.",
      });
    } finally {
      readingLock.current = false;
    }
  }, []);

  useEffect(() => {
    if (state.phase !== "denied" && state.phase !== "ocrfail") return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "live") return;
    if (!ocrReady || !videoReady) return;
    if (state.typeaheadOpen) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const delay = state.lastAddedId ? 1500 : 900;
    const t = window.setTimeout(() => void readOnce(), delay);
    return () => window.clearTimeout(t);
  }, [state.phase, state.lastAddedId, state.notice, state.typeaheadOpen, ocrReady, videoReady, readOnce]);

  async function addCard(card: Card) {
    const hydrated = await hydrateSetName(card);
    const alreadyHad = existingRef.current.has(hydrated.id);
    onAddedRef.current(hydrated);
    dispatch({ type: "added", card: hydrated, alreadyHad });
  }

  const showCamera = state.phase !== "denied" && state.phase !== "ocrfail";
  const listLabel = target === "have" ? "Have" : "Want";

  return (
    <div className="scan-loop">
      <div className="grab" />
      <h2 className="panel-title">Scan to {listLabel}</h2>
      <p className="lede">One card. Confirm, then flip.</p>
      {showCamera ? (
        <div className={`scan-video-wrap${state.phase === "confirm" || state.phase === "pick" || state.typeaheadOpen ? " compact" : ""}`}>
          <video ref={videoRef} playsInline muted autoPlay />
          <div ref={frameRef} className="scan-frame" aria-hidden>
            <span className="scan-frame-label">Fit one card</span>
          </div>
        </div>
      ) : null}
      <p className={state.phase === "denied" || state.phase === "ocrfail" ? "status error" : "hint"}>
        {state.phase === "starting" && !state.notice.startsWith("Camera")
          ? ocrReady
            ? "Starting the camera…"
            : "Getting the reader ready…"
          : state.notice}
      </p>
      {state.addedCount ? (
        <p className="hint">
          Added {state.addedCount} this round.
        </p>
      ) : null}

      {state.phase === "confirm" && state.chosen ? (
        <div className="scan-confirm">
          <img src={state.chosen.image} alt={state.chosen.name} />
          <div>
            <div className="name">{state.chosen.name}</div>
            <div className="meta">
              {state.chosen.setName} {state.chosen.number && `· ${state.chosen.number}`}
            </div>
            <div className="scan-confirm-actions">
              <button className="btn ember" onClick={() => void addCard(state.chosen!)}>
                Confirm
              </button>
              <button className="btn secondary" onClick={() => dispatch({ type: "notThis" })}>
                Not this one
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {state.phase === "pick" ? (
        <div className="card-grid">
          {state.candidates.map((card) => (
            <button key={card.id} className="card-tile" onClick={() => void addCard(card)}>
              <img src={card.image} alt={card.name} />
              <figcaption>
                <div className="name">{card.name}</div>
                <div className="meta">
                  {card.setName} {card.number && `· ${card.number}`}
                </div>
              </figcaption>
            </button>
          ))}
        </div>
      ) : null}

      {state.typeaheadOpen || state.phase === "denied" || state.phase === "ocrfail" ? (
        <CardSearchPanel
          onPick={(card) => void addCard(card)}
          showChips
          autoFocus={state.phase === "denied" || state.phase === "ocrfail"}
          placeholder="Umbreon Evolving Skies, Pikachu…"
        />
      ) : null}

      <div className="sheet-actions scan-actions">
        {state.phase === "live" || state.phase === "reading" ? (
          <button
            className="btn full"
            disabled={state.phase === "reading" || !ocrReady}
            onClick={() => void readOnce()}
          >
            {state.phase === "reading" ? "Reading…" : "Read this card"}
          </button>
        ) : null}
        {!state.typeaheadOpen && state.phase !== "denied" && state.phase !== "ocrfail" ? (
          <button className="btn secondary full" onClick={() => dispatch({ type: "showTypeahead" })}>
            Type a name
          </button>
        ) : null}
        <button className={state.addedCount ? "btn ember full" : "btn secondary full"} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
