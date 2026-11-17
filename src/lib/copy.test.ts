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
  YOU_SHARED,
} from "./copy";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");
const copySrc = readFileSync(join(root, "src/lib/copy.ts"), "utf8");

describe("check-in hint", () => {
  it("has no standing line before check-in", () => {
    expect(checkInHint(false)).toBe("");
    expect(copySrc).not.toContain("The app is off");
    expect(copySrc).not.toContain("Keep Bluetooth on");
  });

  it("tells you to keep the app open after check-in", () => {
    expect(checkInHint(true)).toBe("Keep the app open. You’ll get a ping if someone nearby is a match.");
  });
});

describe("join and first-run copy", () => {
  it("explains Have in plain language and names Check in", () => {
    const text = `${HAVE_FIRST_RUN_TITLE} ${HAVE_FIRST_RUN_BODY} ${HAVE_FIRST_RUN_PRIVACY}`;
    expect(HAVE_FIRST_RUN_TITLE).toBe("Get started.");
    expect(HAVE_FIRST_RUN_BODY).toMatch(/press Check in/);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/both phones ping/);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/Then meet up and trade/);
    expect(HAVE_FIRST_RUN_PRIVACY).toBe("Your list is shared with nearby phones only when you check in.");
    expect(HAVE_FIRST_RUN_PRIVACY).not.toMatch(/encrypted|private|password/i);
    expect(text.split(/\s+/).length).toBeLessThan(80);
  });

  it("names the action Check in", () => {
    expect(NEARBY_LEDE).toBe(
      "Press Check in when you’re at a shop or event. You’ll get a ping if your lists match someone nearby.",
    );
    expect(NEARBY_LEDE).not.toMatch(/table code|QR/);
    expect(CHECKIN_CTA).toBe("Check in");
    expect(PING_HERE).toBe("is nearby");
    expect(HERE_NOTE_LABEL).toBe("How to find you");
    expect(copySrc).not.toMatch(/I’m looking|I'm looking/);
    expect(app).not.toMatch(/I’m looking|I'm looking/);
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
    expect(HERE_NOTE_PLACEHOLDER).toBe("Red hoodie, table 4");
    expect(BLUETOOTH_OFF_HINT).toMatch(/Turn Bluetooth on/);
    expect(TURN_ON_BLUETOOTH).toBe("Turn on Bluetooth");
    expect(LISTS_TOO_BIG).toMatch(/too big to send/);
    expect(OLDER_APP_HINT).toBe("Someone nearby has an older TableTrade. Ask them to update.");
    expect(app).toContain("OLDER_APP_HINT");
    expect(app).toContain("LISTS_TOO_BIG");
    expect(app).toContain("!isStandalonePwa() && !Capacitor.isNativePlatform()");
    expect(app).toContain("showInstall={!Capacitor.isNativePlatform()}");
    expect(HAVE_FIRST_RUN_PRIVACY).not.toMatch(/encrypted/);
    expect(PRIVACY_LISTS).not.toMatch(/encrypted|secure|private/i);
    expect(PRIVACY_LISTS).not.toMatch(/photo/i);
    expect(PRIVACY_LISTS).toMatch(/only listening cannot read/);
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
    expect(INSTALL_NO_ACCOUNT).toBe("Your lists stay on this phone. You don’t need an account.");
    expect(INSTALL_IPHONE).toMatch(/Safari/);
    expect(INSTALL_IPHONE).toMatch(/Share/);
    expect(INSTALL_IPHONE).toMatch(/Add to Home Screen/);
    expect(INSTALL_ANDROID).toMatch(/Chrome/);
    expect(INSTALL_ANDROID).toMatch(/Add to Home screen or Install app/);
  });

  it("echoes site privacy and strengths-only product lines", () => {
    expect(HAVE_LEDE).toBe("Cards you want to trade away.");
    expect(WANT_LEDE).toBe("Cards you want.");
    expect(YOU_LEDE).toBe("Your lists stay on your phone. No account needed.");
    expect(YOU_SHARED).toBe(
      "When you check in, nearby traders get your name, how to find you, and your card lists.",
    );
    expect(YOU_SHARED).not.toMatch(/Nothing else/);
    expect(PRIVACY_LISTS).toMatch(/until you check in/);
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
    expect(app).toContain("A product of {COMPANY}.");
    expect(app).not.toContain("BUILT_BY");
    expect(copySrc).not.toContain("BUILT_BY");
    expect(copySrc).not.toMatch(/Matthew|Sumegi/);
  });

  it("keeps player-facing copy free of Tinder and we-don’t-do lists", () => {
    const surface = `${copySrc}\n${app}`;
    expect(surface).not.toMatch(/Tinder/i);
    expect(surface).not.toMatch(/Magic/);
    expect(surface).not.toMatch(/One Piece/);
    expect(surface).not.toMatch(/Lootstack/i);
    expect(surface).not.toMatch(/marketplace/i);
    expect(YOU_SHARED).not.toMatch(/later meetup|not a/i);
  });
});

describe("Nearby leads with Check in", () => {
  it("hides the radar while a permission prompt is up and has no shop list", () => {
    const nearby = app.slice(app.indexOf("function NearbyPane"));
    expect(nearby).toMatch(/radioBlock \? null : \([\s\S]*nearby-hero/);
    expect(nearby).toContain("CHECKIN_CTA");
    expect(nearby).not.toContain("Trade here, now.");
    expect(nearby).not.toMatch(/optional-table|This table|Type their table code/);
    expect(nearby).not.toMatch(/Search shops|Hint the shop|This shop’s name/);
    expect(app).toMatch(/startLooking/);
    expect(app).toMatch(/canUsePhoneNearby|startPhoneNearby/);
  });
});

describe("primary buttons", () => {
  it("uses the primary button token, white text, and large bold type", () => {
    const css = readFileSync(join(root, "src/index.css"), "utf8");
    const btn = css.match(/\.btn \{[^}]+\}/)?.[0] ?? "";
    const ember = css.match(/\.btn\.ember \{[^}]+\}/)?.[0] ?? "";
    expect(css).toMatch(/--ember:\s*#ff6b35/);
    expect(css).toMatch(/--btn-primary:\s*#e85a24/);
    expect(css).toMatch(/--btn-primary-pressed:\s*#cf4d1c/);
    expect(btn).toMatch(/background:\s*var\(--btn-primary\)/);
    expect(btn).toMatch(/color:\s*#ffffff/);
    expect(btn).toMatch(/font-weight:\s*700/);
    expect(btn).toMatch(/font-size:\s*19px/);
    expect(btn).not.toMatch(/--ember|--electric|#f5d76e|#ff6b35|#1c1410/);
    expect(ember).toMatch(/background:\s*var\(--btn-primary\)/);
    expect(ember).toMatch(/color:\s*#ffffff/);
    expect(css).toMatch(/\.btn:hover\s*\{[^}]*background:\s*var\(--btn-primary\)/);
    expect(css).toMatch(/\.btn:active\s*\{[^}]*background:\s*var\(--btn-primary-pressed\)/);
    expect(css).toMatch(/\.btn:disabled\s*\{[^}]*background:\s*var\(--btn-primary\)/);
    expect(css).toMatch(/\.btn:disabled\s*\{[^}]*color:\s*#ffffff/);
  });
});
