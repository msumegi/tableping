export function checkInHint(on: boolean): string {
  if (!on) return "Your phone stays quiet. The app is off.";
  return "You’re looking. Keep the app open. Matches close by will ping.";
}

export function locationHintCopy(): string {
  return "Bluetooth finds who is close in the room. Keep Bluetooth on. This phone does not keep a history.";
}

export const HAVE_LEDE = "Cards you’d trade here, now.";

export const WANT_LEDE = "What you’re hunting.";

export const NEARBY_LEDE =
  "Tap I’m looking. A match close by buzzes you. Name, cards, optional I’m over here.";

export const YOU_LEDE = "Lists live on the phone until you look. No password.";

export const YOU_WHAT = "Pokémon trades close by. Match, then talk.";

export const YOU_PHOTO_HINT = "A face they can call out in the room. Optional. Not sent while looking.";

export const HAVE_FIRST_RUN_TITLE = "Here. Close by.";

export const HAVE_FIRST_RUN_BODY =
  "Add a few haves and wants. Tap I’m looking when you get here. If the lists overlap and you are close, both phones fire. Then you talk.";

export const HAVE_FIRST_RUN_PRIVACY = "No password. Looking uses Bluetooth to phones close by.";

export const INSTALL_HEADING = "Add to Home Screen";

export const INSTALL_NO_ACCOUNT = "No. Lists live on the phone. No password.";

export const INSTALL_IPHONE = "iPhone: Safari → Share → Add to Home Screen.";

export const INSTALL_ANDROID = "Android: Chrome menu → Add to Home screen or Install app.";

export const PRIVACY_LISTS =
  "Lists stay on the phone until you tap I’m looking. Then your name and those cards go over Bluetooth to phones close by.";

export const PRIVACY_PING = "A ping when someone close by is a match. Same room, not across town.";

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

export const AGE_TITLE = "How old are you?";

export const AGE_BODY = "You must be 13 or older to use TableTrade.";

export const AGE_YES = "I’m 13 or older";

export const AGE_NO = "I’m not";

export const AGE_BLOCKED = "TableTrade is for people 13 or older.";

export const RADIO_DOWN = "Looking needs Bluetooth on this phone.";

export const HEAR_AGAIN = "Hear pings again";

export const REPORT_PEER = "Don’t show this person";

export const MATCH_PRINTING = "Match is the same printing, not any card with that name.";
