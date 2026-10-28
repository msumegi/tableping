export function checkInHint(on: boolean): string {
  if (!on) return "You are not looking, so this phone stays quiet.";
  return "You’re looking. Keep the app open. Matches close by will ping.";
}

export function locationHintCopy(): string {
  return "Bluetooth finds who is close in the room. Keep Bluetooth on. This phone does not keep a history.";
}

export const HAVE_LEDE = "These are the cards you would trade with someone here.";

export const WANT_LEDE = "These are the cards you want to find.";

export const NEARBY_LEDE =
  "Tap I’m looking. If someone close by is a match, your phone buzzes you with their name, their cards, and an optional I’m over here note.";

export const YOU_LEDE = "Your lists stay on this phone until you start looking. There is no password.";

export const YOU_WHAT = "TableTrade finds Pokémon card trades with people close by. You match, then you talk.";

export const YOU_PHOTO_HINT = "A face they can spot in the room. Optional. Not sent while looking.";

export const HAVE_FIRST_RUN_TITLE = "Trade with someone in the room.";

export const HAVE_FIRST_RUN_BODY =
  "Add a few haves and wants. Tap I’m looking when you get here. If the lists overlap and you are close, both phones fire. Then you talk.";

export const HAVE_FIRST_RUN_PRIVACY = "There is no password. Looking uses Bluetooth between phones that are close by.";

export const INSTALL_HEADING = "Add TableTrade to your home screen";

export const INSTALL_NO_ACCOUNT = "There is no account. Your lists stay on this phone.";

export const INSTALL_IPHONE = "On iPhone, open this page in Safari, tap Share, then Add to Home Screen.";

export const INSTALL_ANDROID = "On Android, open this page in Chrome, tap the menu, then Add to Home screen or Install app.";

export const PRIVACY_LISTS =
  "Lists stay on the phone until you tap I’m looking. Then your name and those cards go over Bluetooth to phones close by.";

export const PRIVACY_PING = "You get a ping when someone in the same room is a match, not someone across town.";

export const PRIVACY_FAN = "TableTrade is an unofficial fan tool.";

export const PING_HERE = "is close by";

export const CHECKIN_CTA = "I’m looking";

export const LEAVE_LOOKING = "Done looking";

export const HERE_NOTE_LABEL = "I’m over here";

export const HERE_NOTE_HINT = "For example, a red hoodie at the back table. Optional.";

export const HERE_NOTE_MAX = 40;

export const COMPANY = "Range Road Technologies";

export const SITE_HOME = "https://rangeroadtech.com/";

export const SITE_APP_PAGE = "https://rangeroadtech.com/apps/tabletrade/?from=app";

export const SITE_PRIVACY = "https://rangeroadtech.com/privacy/";

export const HELP_MAIL = "help@rangeroadtech.com";

export const APP_TAGLINE = "Pokémon card trades with someone close by.";

export const AGE_TITLE = "How old are you?";

export const AGE_BODY = "You must be 13 or older to use TableTrade.";

export const AGE_YES = "I’m 13 or older";

export const AGE_NO = "I’m not";

export const AGE_BLOCKED = "TableTrade is for people 13 or older.";

export const RADIO_DOWN = "Looking needs Bluetooth on this phone.";

export const HEAR_AGAIN = "Hear pings again";

export const REPORT_PEER = "Don’t show this person";

export const MATCH_PRINTING = "A match is the same printing, not any card with that name.";
