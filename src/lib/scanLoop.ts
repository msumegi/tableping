import type { Card } from "../types";
import type { ScanConfidence } from "./scanMatch";

export type ScanPhase = "starting" | "live" | "reading" | "confirm" | "pick" | "denied" | "ocrfail";

export type ScanState = {
  phase: ScanPhase;
  candidates: Card[];
  chosen: Card | null;
  addedCount: number;
  lastAddedId: string | null;
  notice: string;
  typeaheadOpen: boolean;
};

export type ScanAction =
  | { type: "cameraReady" }
  | { type: "permissionDenied"; message?: string }
  | { type: "ocrUnavailable" }
  | { type: "readStart" }
  | {
      type: "readResult";
      candidates: Card[];
      confidence: ScanConfidence;
      error?: string;
    }
  | { type: "choose"; card: Card }
  | { type: "added"; card: Card; alreadyHad: boolean }
  | { type: "notThis" }
  | { type: "showTypeahead" }
  | { type: "hideTypeahead" };

export const initialScanState: ScanState = {
  phase: "starting",
  candidates: [],
  chosen: null,
  addedCount: 0,
  lastAddedId: null,
  notice: "Point at one card.",
  typeaheadOpen: false,
};

export function cameraDeniedMessage(): string {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "This page can't use the camera. Open TablePing at https://msumegi.github.io/tableping/.";
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
    return "This browser can't use the camera. Try Chrome on Android.";
  }
  return "Camera permission denied. You can still type a card name.";
}

export function scanReducer(state: ScanState, action: ScanAction): ScanState {
  switch (action.type) {
    case "cameraReady":
      if (state.phase === "denied" || state.phase === "ocrfail") return state;
      return {
        ...state,
        phase: state.phase === "reading" || state.phase === "confirm" || state.phase === "pick" ? state.phase : "live",
        notice: state.addedCount ? state.notice : "Point at one card, then tap Read.",
      };
    case "permissionDenied":
      return {
        ...state,
        phase: "denied",
        notice: action.message || cameraDeniedMessage(),
        typeaheadOpen: true,
      };
    case "ocrUnavailable":
      return {
        ...state,
        phase: "ocrfail",
        notice: "Can't read cards on this phone. Type the name instead.",
        typeaheadOpen: true,
      };
    case "readStart":
      if (state.phase === "denied" || state.phase === "ocrfail") return state;
      return { ...state, phase: "reading", notice: "Reading…" };
    case "readResult": {
      if (state.phase === "denied" || state.phase === "ocrfail") return state;
      if (action.confidence === "none" || !action.candidates.length) {
        return {
          ...state,
          phase: "live",
          candidates: [],
          chosen: null,
          notice:
            action.error ||
            "Couldn't read that card. Point at one card and tap Read, or type the name.",
        };
      }
      const top = action.candidates[0];
      if (top && top.id === state.lastAddedId) {
        return {
          ...state,
          phase: "live",
          candidates: [],
          chosen: null,
          notice: "Added. Flip to the next card.",
        };
      }
      if (action.confidence === "high") {
        return {
          ...state,
          phase: "confirm",
          candidates: action.candidates,
          chosen: top,
          notice: "Is this the card?",
        };
      }
      return {
        ...state,
        phase: "pick",
        candidates: action.candidates,
        chosen: null,
        notice: "Which printing?",
      };
    }
    case "choose":
      return {
        ...state,
        phase: "confirm",
        chosen: action.card,
        notice: "Is this the card?",
      };
    case "added": {
      const addedNotice = action.alreadyHad
        ? `Already on the list. Flip to the next card.`
        : `Added ${action.card.name}. Flip to the next card.`;
      const nextCount = action.alreadyHad ? state.addedCount : state.addedCount + 1;
      if (state.phase === "denied" || state.phase === "ocrfail") {
        return {
          ...state,
          chosen: null,
          candidates: [],
          addedCount: nextCount,
          lastAddedId: action.card.id,
          typeaheadOpen: true,
          notice: action.alreadyHad
            ? "Already on the list. Type another name, or tap Done."
            : `Added ${action.card.name}. Type another name, or tap Done.`,
        };
      }
      return {
        ...state,
        phase: "live",
        chosen: null,
        candidates: [],
        addedCount: nextCount,
        lastAddedId: action.card.id,
        typeaheadOpen: false,
        notice: addedNotice,
      };
    }
    case "notThis": {
      const rest = state.candidates.filter((c) => c.id !== state.chosen?.id);
      if (rest.length) {
        return {
          ...state,
          phase: "pick",
          candidates: rest,
          chosen: null,
          notice: "Which printing?",
          typeaheadOpen: false,
        };
      }
      return {
        ...state,
        phase: "live",
        chosen: null,
        candidates: [],
        typeaheadOpen: true,
        notice: "Type the name, or tap Read to try again.",
      };
    }
    case "showTypeahead":
      return { ...state, typeaheadOpen: true };
    case "hideTypeahead":
      return { ...state, typeaheadOpen: false };
    default:
      return state;
  }
}
