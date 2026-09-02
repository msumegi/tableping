export function checkInHint(on: boolean): string {
  if (!on) return "Your phone stays quiet. The app is off.";
  return "You’re looking. Matches close by will ping.";
}

export function locationHintCopy(): string {
  return "Location is only to see who is close. It is not stored as a history.";
}

export const HAVE_LEDE = "Cards you’d trade here, now.";

export const WANT_LEDE = "What you’re hunting.";

export const NEARBY_LEDE =
  "Tap I’m looking. A match close by buzzes you. Name, photo, and where you are.";

export const YOU_LEDE = "Lists live on the phone. No password.";

export const YOU_WHAT = "Pokémon trades close by. Match, then talk.";

export const YOU_PHOTO_HINT = "A face they can call out in the room.";

export const HAVE_FIRST_RUN_TITLE = "Here. Close by.";

export const HAVE_FIRST_RUN_BODY =
  "Add a few haves and wants. Tap I’m looking when you get here. If the lists overlap and you are close, both phones fire. Then you talk.";

export const HAVE_FIRST_RUN_PRIVACY = "Lists live on the phone. No password.";

export const INSTALL_HEADING = "Add to Home Screen";

export const INSTALL_NO_ACCOUNT = "No. Lists live on the phone. No password.";

export const INSTALL_IPHONE = "iPhone: Safari → Share → Add to Home Screen.";

export const INSTALL_ANDROID = "Android: Chrome menu → Add to Home screen or Install app.";

export const PRIVACY_LISTS = "Have-lists and want-lists live on the device.";

export const PRIVACY_PING = "A ping when someone close by is a match.";

export const PRIVACY_FAN = "TableTrade is an unofficial fan tool.";

export const PING_HERE = "is close by";

export const CHECKIN_CTA = "I’m looking";

export const LEAVE_LOOKING = "Done looking";

export const HERE_NOTE_LABEL = "I’m over here";

export const HERE_NOTE_HINT = "Red hoodie. Back table. Optional.";

export const HERE_NOTE_MAX = 40;

export const COMPANY = "Range Road Technologies";

export const BUILT_BY = "Built by Matthew Sumegi";

export const SITE_HOME = "https://rangeroadtech.com/";

export const SITE_APP_PAGE = "https://rangeroadtech.com/apps/tabletrade/";

export const SITE_PRIVACY = "https://rangeroadtech.com/privacy/";

export const HELP_MAIL = "help@rangeroadtech.com";
