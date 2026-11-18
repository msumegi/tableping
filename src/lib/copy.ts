export function checkInHint(on: boolean): string {
  if (!on) return "";
  return "Keep the app open. You’ll get a ping if someone nearby is a match.";
}

export const HAVE_LEDE = "Cards you want to trade away.";

export const WANT_LEDE = "Cards you want.";

export const NEARBY_LEDE =
  "Press Check in when you’re at a shop or event. You’ll get a ping if your lists match someone nearby.";

export const YOU_LEDE = "Your lists stay on your phone. No account needed.";

export const YOU_SHARED =
  "When you check in, nearby traders get your name, how to find you, and your card lists.";

export const HAVE_FIRST_RUN_TITLE = "Get started.";

export const HAVE_FIRST_RUN_BODY =
  "Add a few cards you want to trade away and cards you want. At a shop or event, go to Nearby and press Check in. If your lists match someone nearby, both phones ping. Then meet up and trade.";

export const HAVE_FIRST_RUN_PRIVACY = "Your list is shared with nearby phones only when you check in.";

export const INSTALL_HEADING = "Add to Home Screen";

export const INSTALL_NO_ACCOUNT = "Your lists stay on this phone. You don’t need an account.";

export const INSTALL_IPHONE = "iPhone: Safari → Share → Add to Home Screen.";

export const INSTALL_ANDROID = "Android: Chrome menu → Add to Home screen or Install app.";

export const PRIVACY_LISTS =
  "Your lists stay on your phone until you check in. Then your name, your lists and your note go to other TableTrade phones nearby. A phone that is only listening cannot read that.";

export const PRIVACY_PING = "You’ll get a ping when someone nearby is a match.";

export const PRIVACY_FAN = "TableTrade is an unofficial fan tool.";

export const PING_HERE = "is nearby";

export const CHECKIN_CTA = "Check in";

export const LEAVE_LOOKING = "Done";

export const HERE_NOTE_LABEL = "How to find you";

export const HERE_NOTE_PLACEHOLDER = "Red hoodie, table 4";

export const HERE_NOTE_HINT = "Optional. So they can spot you in the room.";

export const HERE_NOTE_MAX = 40;

export const COMPANY = "Range Road Technologies";

export const SITE_HOME = "https://rangeroadtech.com/";

export const SITE_APP_PAGE = "https://rangeroadtech.com/apps/tabletrade/";

export const SITE_PRIVACY = "https://rangeroadtech.com/privacy/";

export const HELP_MAIL = "help@rangeroadtech.com";

export const AGE_TITLE = "How old are you?";

export const AGE_BODY = "You must be 13 or older to use TableTrade.";

export const AGE_YES = "I’m 13 or older";

export const AGE_NO = "I’m not";

export const AGE_BLOCKED = "TableTrade is for people 13 or older.";

export const RADIO_DOWN = "Turn Bluetooth on to check in.";

export const LOCATION_OFF_HINT =
  "Turn on Location to find traders. Android 11 and older need Location on for Bluetooth to see nearby phones. TableTrade does not use your GPS position.";

export const LOCATION_ASK =
  "Android will ask to use Location. TableTrade needs it only so Bluetooth can find nearby phones. It never reads your position.";

export const PERMISSION_LOCATION =
  "Allow Location so Bluetooth can find nearby phones. TableTrade does not use your GPS position.";

export const PERMISSION_NEARBY = "Allow Nearby devices, then tap Check in.";

export const OPEN_APP_SETTINGS = "Open app settings";

export const OPEN_LOCATION_SETTINGS = "Open Location settings";

export const BLUETOOTH_OFF_HINT = "Turn Bluetooth on to find traders.";

export const TURN_ON_BLUETOOTH = "Turn on Bluetooth";

export const LISTS_TOO_BIG =
  "These lists are too big to send over Bluetooth. Remove a few cards and try again.";

export const OLDER_APP_HINT = "Someone nearby has an older TableTrade. Ask them to update.";

export const HEAR_AGAIN = "Hear pings again";

export const REPORT_PEER = "Don’t show this person";

export const MATCH_PRINTING = "A match is the same card from the same set, not just the same name.";

export const SCAN_OFFLINE = "Card scanning needs internet. Go online, or type the name.";

export const SEARCH_SAVED_ONLY = "Showing cards on this phone. Full list is offline right now.";

export const TCGDEX_LICENSE_LABEL = "MIT licence";

export const CARD_DATA_CREDIT_BEFORE = "Card data from pokemontcg.io, and from TCGdex (";

export const CARD_DATA_CREDIT_AFTER = ")";

export const CARD_DATA_CREDIT = `${CARD_DATA_CREDIT_BEFORE}${TCGDEX_LICENSE_LABEL}${CARD_DATA_CREDIT_AFTER}`;

export const TCGDEX_LICENSE = "https://github.com/tcgdex/cards-database/blob/master/LICENSE";
