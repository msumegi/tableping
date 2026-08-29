import { describe, expect, it } from "vitest";
import { SAMPLE_CHARIZARD, SAMPLE_PIKACHU, searchLocalCatalog } from "./cards";
import { cameraDeniedMessage, initialScanState, scanReducer } from "./scanLoop";
import { decideScanMatch, parseCardOcr } from "./scanMatch";

describe("scan loop reducer", () => {
  it("match / confirm / add leaves the camera ready for the next card", () => {
    const parsed = parseCardOcr("BASIC\nPIKACHU 60 HP\n58/102");
    const decision = decideScanMatch(searchLocalCatalog(parsed.query!), parsed);

    let state = scanReducer(initialScanState, { type: "cameraReady" });
    expect(state.phase).toBe("live");

    state = scanReducer(state, { type: "readStart" });
    expect(state.phase).toBe("reading");

    state = scanReducer(state, { type: "readResult", ...decision });
    expect(state.phase).toBe("confirm");
    expect(state.chosen?.id).toBe(SAMPLE_PIKACHU.id);
    expect(state.chosen?.name).toBe("Pikachu");
    expect(state.chosen?.setName).toBeTruthy();

    state = scanReducer(state, { type: "added", card: state.chosen!, alreadyHad: false });
    expect(state.phase).toBe("live");
    expect(state.addedCount).toBe(1);
    expect(state.lastAddedId).toBe(SAMPLE_PIKACHU.id);
    expect(state.notice).toMatch(/Added Pikachu/i);

    state = scanReducer(state, { type: "readStart" });
    state = scanReducer(state, { type: "readResult", ...decision });
    expect(state.phase).toBe("live");
    expect(state.notice).toMatch(/next card/i);
    expect(state.addedCount).toBe(1);
  });

  it("shows a short list when the read is unsure, then adds the picked printing", () => {
    const parsed = parseCardOcr("PIKACHU 60 HP");
    const decision = decideScanMatch(searchLocalCatalog(parsed.query!), parsed);
    expect(decision.confidence).toBe("low");

    let state = scanReducer(initialScanState, { type: "cameraReady" });
    state = scanReducer(state, { type: "readStart" });
    state = scanReducer(state, { type: "readResult", ...decision });
    expect(state.phase).toBe("pick");
    expect(state.candidates.length).toBeGreaterThan(1);

    const pick = state.candidates[1] ?? state.candidates[0];
    state = scanReducer(state, { type: "added", card: pick, alreadyHad: false });
    expect(state.phase).toBe("live");
    expect(state.addedCount).toBe(1);
    expect(state.lastAddedId).toBe(pick.id);
  });

  it("does not increment when the card is already on the list", () => {
    let state = scanReducer(initialScanState, { type: "cameraReady" });
    state = scanReducer(state, { type: "added", card: SAMPLE_CHARIZARD, alreadyHad: true });
    expect(state.addedCount).toBe(0);
    expect(state.notice).toMatch(/Already on the list/i);
    expect(state.phase).toBe("live");
  });

  it("no-match keeps the loop open and leaves type-ahead available", () => {
    let state = scanReducer(initialScanState, { type: "cameraReady" });
    state = scanReducer(state, { type: "readStart" });
    state = scanReducer(state, { type: "readResult", candidates: [], confidence: "none" });
    expect(state.phase).toBe("live");
    expect(state.notice).toMatch(/type the name/i);

    state = scanReducer(state, { type: "showTypeahead" });
    expect(state.typeaheadOpen).toBe(true);
    expect(state.phase).toBe("live");
  });

  it("permission denied says so in plain language and opens type-ahead", () => {
    const state = scanReducer(initialScanState, { type: "permissionDenied" });
    expect(state.phase).toBe("denied");
    expect(state.typeaheadOpen).toBe(true);
    expect(state.notice).toBe(cameraDeniedMessage());
    expect(state.notice.toLowerCase()).toMatch(/camera permission denied|can't use the camera/);
  });

  it("Not this one falls back to the other printings or type-ahead", () => {
    let state = scanReducer(initialScanState, { type: "cameraReady" });
    state = scanReducer(state, {
      type: "readResult",
      confidence: "high",
      candidates: [SAMPLE_PIKACHU, SAMPLE_CHARIZARD],
    });
    expect(state.phase).toBe("confirm");
    state = scanReducer(state, { type: "notThis" });
    expect(state.phase).toBe("pick");
    expect(state.candidates.map((c) => c.id)).toEqual([SAMPLE_CHARIZARD.id]);

    state = scanReducer(state, { type: "choose", card: SAMPLE_CHARIZARD });
    expect(state.phase).toBe("confirm");
    state = scanReducer(state, { type: "notThis" });
    expect(state.phase).toBe("live");
    expect(state.typeaheadOpen).toBe(true);
  });
});
