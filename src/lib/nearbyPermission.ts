import { PERMISSION_LOCATION, PERMISSION_NEARBY } from "./copy";
import type { NearbyBlock } from "./bleNearby";

export type PermissionUi = {
  looking: boolean;
  hint: string;
  block: NearbyBlock | null;
  requests: number;
};

export function permissionSentence(needsLocation: boolean): string {
  return needsLocation ? PERMISSION_LOCATION : PERMISSION_NEARBY;
}

/** One I'm looking tap may ask the system once. */
export function tapLooking(state: PermissionUi): PermissionUi {
  return { ...state, looking: false, hint: "Turning looking on…", requests: state.requests + 1 };
}

/** A denial parks looking. It does not ask again. */
export function permissionDenied(
  state: PermissionUi,
  opts: { blocked: boolean; needsLocation: boolean },
): PermissionUi {
  return {
    looking: false,
    hint: permissionSentence(opts.needsLocation),
    block: opts.blocked ? "settings" : "permission",
    requests: state.requests,
  };
}

/**
 * Coming back from the dialog or from app settings rechecks only.
 * A granted permission clears the message. Looking stays off until I'm looking is tapped.
 */
export function resumePermission(state: PermissionUi, granted: boolean): PermissionUi {
  if (state.block !== "permission" && state.block !== "settings") return state;
  if (granted) return { ...state, looking: false, hint: "", block: null };
  return { ...state, looking: false, requests: state.requests };
}
