import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  gpsOptionalHint,
  HAVE_FIRST_RUN_BODY,
  HAVE_FIRST_RUN_PRIVACY,
  HAVE_FIRST_RUN_TITLE,
  HAVE_LEDE,
  INSTALL_ANDROID,
  INSTALL_IPHONE,
  INSTALL_NO_ACCOUNT,
  NEARBY_LEDE,
  PRIVACY_FAN,
  PRIVACY_LISTS,
  PRIVACY_PING,
  shopHint,
  tableShareHint,
  WANT_LEDE,
  YOU_LEDE,
  YOU_WHAT,
} from "./copy";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");
const copySrc = readFileSync(join(root, "src/lib/copy.ts"), "utf8");

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
  it("echoes the site how-it-works on empty Have", () => {
    const text = `${HAVE_FIRST_RUN_TITLE} ${HAVE_FIRST_RUN_BODY} ${HAVE_FIRST_RUN_PRIVACY}`;
    expect(HAVE_FIRST_RUN_TITLE).toBe("Here. This room. This table.");
    expect(HAVE_FIRST_RUN_BODY).toMatch(/table code or QR/);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/lists overlap/);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/Then you talk/);
    expect(HAVE_FIRST_RUN_PRIVACY).toBe("Lists live on the phone. No password.");
    expect(text.split(/\s+/).length).toBeLessThan(70);
  });

  it("treats table code and QR as the real join", () => {
    expect(NEARBY_LEDE).toMatch(/four-character table code or QR/);
    expect(NEARBY_LEDE).toMatch(/That is the join/);
    expect(tableShareHint(true)).toMatch(/code or scan the QR/);
    expect(tableShareHint(false)).toMatch(/table code or QR/);
    expect(tableShareHint(false)).not.toMatch(/backup|GPS/i);
  });

  it("demotes GPS as optional and imperfect, without a 120 m claim", () => {
    expect(gpsOptionalHint()).toMatch(/optional/i);
    expect(gpsOptionalHint()).toMatch(/Indoor shops and basements often break GPS/);
    expect(gpsOptionalHint()).toMatch(/Use the code or QR/);
    expect(gpsOptionalHint()).not.toMatch(/120/);
  });

  it("echoes the site FAQ for install and account", () => {
    expect(INSTALL_NO_ACCOUNT).toBe("No. Lists live on the phone. No password.");
    expect(INSTALL_IPHONE).toMatch(/Safari/);
    expect(INSTALL_IPHONE).toMatch(/Share/);
    expect(INSTALL_IPHONE).toMatch(/Add to Home Screen/);
    expect(INSTALL_ANDROID).toMatch(/Chrome/);
    expect(INSTALL_ANDROID).toMatch(/Add to Home screen or Install app/);
  });

  it("echoes site privacy and strengths-only product lines", () => {
    expect(HAVE_LEDE).toBe("Cards you’d trade here, now.");
    expect(WANT_LEDE).toBe("What you’re hunting.");
    expect(YOU_LEDE).toBe("Lists live on the phone. No password.");
    expect(YOU_WHAT).toBe("Pokémon at this table. Match here, then talk.");
    expect(PRIVACY_LISTS).toMatch(/live on the device/);
    expect(PRIVACY_PING).toBe("A ping when someone at this table is a match.");
    expect(PRIVACY_FAN).toBe("TableTrade is an unofficial fan tool.");
  });

  it("keeps player-facing copy free of Tinder and we-don’t-do lists", () => {
    const surface = `${copySrc}\n${app}`;
    expect(surface).not.toMatch(/Tinder/i);
    expect(surface).not.toMatch(/Magic/);
    expect(surface).not.toMatch(/One Piece/);
    expect(surface).not.toMatch(/Lootstack/i);
    expect(surface).not.toMatch(/marketplace/i);
    expect(YOU_WHAT).not.toMatch(/later meetup|not a/i);
  });
});
