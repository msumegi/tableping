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
    expect(checkInHint(true)).toBe("You’re looking. Matches close by will ping.");
  });
});

describe("join and first-run copy", () => {
  it("echoes the site how-it-works on empty Have, with looking as the join", () => {
    const text = `${HAVE_FIRST_RUN_TITLE} ${HAVE_FIRST_RUN_BODY} ${HAVE_FIRST_RUN_PRIVACY}`;
    expect(HAVE_FIRST_RUN_TITLE).toBe("Here. Close by.");
    expect(HAVE_FIRST_RUN_BODY).toMatch(/I’m looking/);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/lists overlap/);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/Then you talk/);
    expect(HAVE_FIRST_RUN_PRIVACY).toBe("Lists live on the phone. No password.");
    expect(text.split(/\s+/).length).toBeLessThan(80);
  });

  it("treats I’m looking as the real join", () => {
    expect(NEARBY_LEDE).toMatch(/I’m looking/);
    expect(NEARBY_LEDE).toMatch(/buzzes you|ping/i);
    expect(NEARBY_LEDE).toMatch(/Name, photo/);
    expect(NEARBY_LEDE).not.toMatch(/table code|QR/);
    expect(CHECKIN_CTA).toBe("I’m looking");
    expect(PING_HERE).toBe("is close by");
    expect(HERE_NOTE_LABEL).toBe("I’m over here");
  });

  it("uses location for close-by, not a shop list", () => {
    expect(locationHintCopy()).toMatch(/close/i);
    expect(locationHintCopy()).not.toMatch(/hint the shop/i);
    expect(locationHintCopy()).not.toMatch(/break GPS|basements often/i);
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
    expect(YOU_LEDE).toBe("Lists live on the phone. No password.");
    expect(YOU_WHAT).toBe("Pokémon trades close by. Match, then talk.");
    expect(PRIVACY_LISTS).toMatch(/live on the device/);
    expect(PRIVACY_PING).toBe("A ping when someone close by is a match.");
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
    expect(app).toMatch(/getCurrentPosition/);
    expect(app).toMatch(/watchPosition/);
  });
});
