import { describe, expect, it } from "vitest";
import {
  gpsOptionalHint,
  HAVE_FIRST_RUN_BODY,
  HAVE_FIRST_RUN_PRIVACY,
  HAVE_FIRST_RUN_TITLE,
  INSTALL_ANDROID,
  INSTALL_IPHONE,
  INSTALL_NO_ACCOUNT,
  PRIVACY_FAN,
  PRIVACY_LISTS,
  PRIVACY_PING,
  shopHint,
  tableShareHint,
} from "./copy";

describe("shop toggle hint", () => {
  it("shows the quiet line when the shop toggle is off", () => {
    expect(shopHint(false, "Off")).toBe("Your phone stays quiet. The app is off.");
  });

  it("keeps a location error visible after the toggle drops off", () => {
    expect(shopHint(false, "Location permission denied.")).toBe("Location permission denied.");
  });

  it("shows one ready line when the shop toggle is on", () => {
    expect(shopHint(true, "Off")).toBe("Ready to trade here.");
    expect(shopHint(true, "Ready to trade here.")).toBe("Ready to trade here.");
    expect(shopHint(true, "Looking around this shop…")).toBe("Looking around this shop…");
  });
});

describe("join and first-run copy", () => {
  it("explains the table in one short Have-list first-run", () => {
    const text = `${HAVE_FIRST_RUN_TITLE} ${HAVE_FIRST_RUN_BODY} ${HAVE_FIRST_RUN_PRIVACY}`;
    expect(HAVE_FIRST_RUN_TITLE).toMatch(/table/i);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/four-character code or QR/i);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/talk in person/i);
    expect(HAVE_FIRST_RUN_PRIVACY).toMatch(/no account/i);
    expect(text.split(/\s+/).length).toBeLessThan(70);
  });

  it("treats table code and QR as the way to join", () => {
    expect(tableShareHint(true)).toMatch(/code or scan the QR/i);
    expect(tableShareHint(false)).toMatch(/Turn On/i);
    expect(tableShareHint(false)).toMatch(/code or scan the QR/i);
    expect(tableShareHint(false)).not.toMatch(/backup|GPS/i);
  });

  it("demotes GPS as optional and imperfect", () => {
    expect(gpsOptionalHint()).toMatch(/optional/i);
    expect(gpsOptionalHint()).toMatch(/indoor|basement/i);
    expect(gpsOptionalHint()).not.toMatch(/120/);
  });

  it("covers iPhone and Android install, with no account", () => {
    expect(INSTALL_NO_ACCOUNT).toMatch(/no account/i);
    expect(INSTALL_IPHONE).toMatch(/Safari Share/i);
    expect(INSTALL_IPHONE).toMatch(/Add to Home Screen/i);
    expect(INSTALL_ANDROID).toMatch(/Chrome/i);
    expect(INSTALL_ANDROID).toMatch(/Add to Home screen/i);
  });

  it("states list, ping, and unofficial privacy lines", () => {
    expect(PRIVACY_LISTS).toMatch(/this phone/i);
    expect(PRIVACY_PING).toMatch(/same table/i);
    expect(PRIVACY_FAN).toMatch(/unofficial fan tool/i);
  });
});
