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

  it("names the shop after check-in", () => {
    expect(checkInHint(true, "Wizard’s Loft")).toBe("You’re at Wizard’s Loft. Matches here will ping.");
    expect(checkInHint(true)).toBe("You’re here. Matches in this shop will ping.");
  });
});

describe("join and first-run copy", () => {
  it("echoes the site how-it-works on empty Have, with check-in as the room", () => {
    const text = `${HAVE_FIRST_RUN_TITLE} ${HAVE_FIRST_RUN_BODY} ${HAVE_FIRST_RUN_PRIVACY}`;
    expect(HAVE_FIRST_RUN_TITLE).toBe("Here. This room. This shop.");
    expect(HAVE_FIRST_RUN_BODY).toMatch(/Check in when you get here/);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/lists overlap/);
    expect(HAVE_FIRST_RUN_BODY).toMatch(/Then you talk/);
    expect(HAVE_FIRST_RUN_PRIVACY).toBe("Lists live on the phone. No password.");
    expect(text.split(/\s+/).length).toBeLessThan(70);
  });

  it("treats shop check-in as the real join", () => {
    expect(NEARBY_LEDE).toMatch(/Check in/);
    expect(NEARBY_LEDE).toMatch(/buzzes you|ping/i);
    expect(NEARBY_LEDE).toMatch(/Name and photo/);
    expect(NEARBY_LEDE).not.toMatch(/table code|QR/);
    expect(CHECKIN_CTA).toBe("I’m here");
    expect(PING_HERE).toBe("is here");
  });

  it("keeps location as a hint, not the room", () => {
    expect(locationHintCopy()).toMatch(/hint the shop/i);
    expect(locationHintCopy()).toMatch(/I’m here/);
    expect(locationHintCopy()).not.toMatch(/120/);
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
    expect(YOU_WHAT).toBe("Pokémon in this shop. Match here, then talk.");
    expect(PRIVACY_LISTS).toMatch(/live on the device/);
    expect(PRIVACY_PING).toBe("A ping when someone in this shop is a match.");
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

describe("Nearby leads with check-in", () => {
  it("heroes I’m here and has no table join", () => {
    const nearby = app.slice(app.indexOf("function NearbyPane"));
    expect(nearby.search(/Check in|I’m here|CHECKIN_CTA/)).toBeGreaterThan(-1);
    expect(nearby).not.toMatch(/optional-table|This table|Type their table code/);
    expect(app).toMatch(/getCurrentPosition/);
    expect(app).not.toMatch(/watchPosition/);
  });
});
