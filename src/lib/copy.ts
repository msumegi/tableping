export function checkInHint(on: boolean, shopName?: string): string {
  if (!on) return "Your phone stays quiet. The app is off.";
  return shopName ? `You’re at ${shopName}. Matches here will ping.` : "You’re here. Matches in this shop will ping.";
}

export function locationHintCopy(): string {
  return "Location can hint the shop. You tap I’m here.";
}

export const HAVE_LEDE = "Cards you’d trade here, now.";

export const WANT_LEDE = "What you’re hunting.";

export const NEARBY_LEDE = "Check in. A match in this shop buzzes you. Name and photo. Find them in the room.";

export const YOU_LEDE = "Lists live on the phone. No password.";

export const YOU_WHAT = "Pokémon in this shop. Match here, then talk.";

export const YOU_PHOTO_HINT = "A face they can call out in the room.";

export const HAVE_FIRST_RUN_TITLE = "Here. This room. This shop.";

export const HAVE_FIRST_RUN_BODY =
  "Add a few haves and wants. Check in when you get here. If the lists overlap, both phones fire. Then you talk.";

export const HAVE_FIRST_RUN_PRIVACY = "Lists live on the phone. No password.";

export const INSTALL_HEADING = "Add to Home Screen";

export const INSTALL_NO_ACCOUNT = "No. Lists live on the phone. No password.";

export const INSTALL_IPHONE = "iPhone: Safari → Share → Add to Home Screen.";

export const INSTALL_ANDROID = "Android: Chrome menu → Add to Home screen or Install app.";

export const PRIVACY_LISTS = "Have-lists and want-lists live on the device.";

export const PRIVACY_PING = "A ping when someone in this shop is a match.";

export const PRIVACY_FAN = "TableTrade is an unofficial fan tool.";

export const PING_HERE = "is here";

export const CHECKIN_CTA = "I’m here";

export const LEAVE_SHOP = "Leave";

export const COMPANY = "Range Road Technologies";

export const BUILT_BY = "Built by Matthew Sumegi";

export const SITE_HOME = "https://rangeroadtech.com/";

export const SITE_APP_PAGE = "https://rangeroadtech.com/apps/tabletrade/";

export const SITE_PRIVACY = "https://rangeroadtech.com/privacy/";

export const HELP_MAIL = "help@rangeroadtech.com";
