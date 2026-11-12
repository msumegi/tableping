import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHECKIN_CTA,
  checkInHint,
  COMPANY,
  HAVE_FIRST_RUN_BODY,
  HAVE_FIRST_RUN_PRIVACY,
  HAVE_FIRST_RUN_TITLE,
  HAVE_LEDE,
  HELP_MAIL,
  HERE_NOTE_LABEL,
  INSTALL_ANDROID,
  INSTALL_IPHONE,
  INSTALL_NO_ACCOUNT,
  locationHintCopy,
  LOCATION_OFF_HINT,
  LOCATION_ASK,
  OPEN_LOCATION_SETTINGS,
  PERMISSION_LOCATION,
  PERMISSION_NEARBY,
  OPEN_APP_SETTINGS,
  HERE_NOTE_HINT,
  HERE_NOTE_PLACEHOLDER,
  BLUETOOTH_OFF_HINT,
  TURN_ON_BLUETOOTH,
  LISTS_TOO_BIG,
  OLDER_APP_HINT,
  NEARBY_LEDE,
  PING_HERE,
  PRIVACY_FAN,
  PRIVACY_LISTS,
  PRIVACY_PING,
  SITE_APP_PAGE,
  SITE_HOME,
  WANT_LEDE,
  YOU_LEDE,
  YOU_WHAT,
} from "./copy";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");
const copySrc = readFileSync(join(root, "src/lib/copy.ts"), "utf8");

describe("check-in hint", () => {
  it("shows the quiet line when you have not checked in", () => {
    expect(checkInHint(false)).toBe("Your phone stays quiet. The app is off.");
  });

  it("says you are looking after check-in", () => {
    expect(checkInHint(true)).toMatch(/You’re looking/);
  });
});

describe("join and first-run copy", () => {
  it("echoes the site how-it-works on empty Have, with looking as the join", () => {
    const text = `${HAVE_FIRST_RUN_TITLE} ${HAVE_FIRST_RUN_BODY} ${HAVE_FIRST_RUN_PRIVACY}`;
    expect(HAVE_FIRST_RUN_TITLE).toBe("Here. Close by.");
    expect(HAVE_FIRST_RUN_BODY).toMatch(/I’m looking/);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/lists overlap/);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/Then you talk/);
    expect(HAVE_FIRST_RUN_PRIVACY).toMatch(/Bluetooth/);
    expect(text.split(/\s+/).length).toBeLessThan(80);
  });

  it("treats I’m looking as the real join", () => {
    expect(NEARBY_LEDE).toMatch(/I’m looking/);
    expect(NEARBY_LEDE).toMatch(/buzzes you|ping/i);
    expect(NEARBY_LEDE).toMatch(/I’m over here/);
    expect(NEARBY_LEDE).not.toMatch(/table code|QR/);
    expect(CHECKIN_CTA).toBe("I’m looking");
    expect(PING_HERE).toBe("is close by");
    expect(HERE_NOTE_LABEL).toBe("I’m over here");
  });

  it("uses location for close-by, not a shop list", () => {
    expect(locationHintCopy()).toBe("Bluetooth finds who is close in the room. Keep Bluetooth on.");
    expect(locationHintCopy()).not.toMatch(/history/i);
    expect(locationHintCopy()).not.toMatch(/hint the shop/i);
    expect(locationHintCopy()).not.toMatch(/break GPS|basements often/i);
  });

  it("tells Android 11 and older to turn Location on, without using GPS", () => {
    expect(LOCATION_OFF_HINT).toBe(
      "Turn on Location to find traders. Android 11 and older need Location on for Bluetooth to see nearby phones. TableTrade does not use your GPS position.",
    );
    expect(OPEN_LOCATION_SETTINGS).toBe("Open Location settings");
    expect(LOCATION_ASK).toMatch(/never reads your position/);
    expect(PERMISSION_LOCATION).toMatch(/Allow Location/);
    expect(PERMISSION_NEARBY).toMatch(/Nearby devices/);
    expect(OPEN_APP_SETTINGS).toBe("Open app settings");
    expect(HERE_NOTE_HINT).not.toMatch(/Red hoodie/);
    expect(HERE_NOTE_PLACEHOLDER).toMatch(/Red hoodie/);
    expect(BLUETOOTH_OFF_HINT).toMatch(/Turn Bluetooth on/);
    expect(TURN_ON_BLUETOOTH).toBe("Turn on Bluetooth");
    expect(LISTS_TOO_BIG).toMatch(/too big to send/);
    expect(OLDER_APP_HINT).toBe("Someone nearby has an older TableTrade. Ask them to update.");
    expect(app).toContain("OLDER_APP_HINT");
    expect(app).toContain("LISTS_TOO_BIG");
    expect(app).toContain("!isStandalonePwa() && !Capacitor.isNativePlatform()");
    expect(app).toContain("showInstall={!Capacitor.isNativePlatform()}");
    expect(HAVE_FIRST_RUN_PRIVACY).toMatch(/encrypted Bluetooth/);
    expect(PRIVACY_LISTS).toMatch(/encrypted Bluetooth/);
    expect(PRIVACY_LISTS).toMatch(/Anyone using TableTrade nearby can read them/);
    expect(PRIVACY_LISTS).not.toMatch(/Anyone looking nearby/);
    expect(app).toContain("OPEN_LOCATION_SETTINGS");
    expect(app).toContain("TURN_ON_BLUETOOTH");
    expect(app).toContain("openPhoneLocationSettings");
    expect(app).toContain("appStateChange");
  });

  it("does not offer a table code or QR", () => {
    expect(copySrc).not.toMatch(/table code|QR/i);
    expect(app).not.toMatch(/Table code|Scan their QR|optional-table/);
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
    expect(YOU_LEDE).toMatch(/Lists live on the phone/);
    expect(YOU_WHAT).toBe("Pokémon trades close by. Match, then talk.");
    expect(PRIVACY_LISTS).toMatch(/I’m looking/);
    expect(PRIVACY_PING).toMatch(/ping/i);
    expect(PRIVACY_FAN).toBe("TableTrade is an unofficial fan tool.");
  });

  it("points You at the company site", () => {
    expect(COMPANY).toBe("Range Road Technologies");
    expect(HELP_MAIL).toBe("help@rangeroadtech.com");
    expect(SITE_HOME).toBe("https://rangeroadtech.com/");
    expect(SITE_APP_PAGE).toContain("rangeroadtech.com/apps/tabletrade");
    expect(app).toContain("SITE_HOME");
    expect(app).toContain("HELP_MAIL");
    expect(app).toContain("BUILT_BY");
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

describe("Nearby leads with I’m looking", () => {
  it("heroes I’m looking and has no shop list or table join", () => {
    const nearby = app.slice(app.indexOf("function NearbyPane"));
    expect(nearby.search(/I’m looking|CHECKIN_CTA|onStartLooking/)).toBeGreaterThan(-1);
    expect(nearby).not.toMatch(/optional-table|This table|Type their table code/);
    expect(nearby).not.toMatch(/Search shops|Hint the shop|This shop’s name/);
    expect(app).toMatch(/startLooking/);
    expect(app).toMatch(/canUsePhoneNearby|startPhoneNearby/);
  });
});
