export function shopHint(gpsOn: boolean, geoStatus: string): string {
  if (!gpsOn) {
    return geoStatus !== "Off" ? geoStatus : "Your phone stays quiet. The app is off.";
  }
  return geoStatus === "Off" ? "Ready to trade here." : geoStatus;
}

export function tableShareHint(tableOn: boolean): string {
  return tableOn
    ? "They type this code or scan the QR. That is the join."
    : "One phone shows a table code or QR. Turn On.";
}

export function gpsOptionalHint(): string {
  return "Optional. Indoor shops and basements often break GPS. Use the code or QR.";
}

export const HAVE_LEDE = "Cards you’d trade here, now.";

export const WANT_LEDE = "What you’re hunting.";

export const NEARBY_LEDE = "A four-character table code or QR. That is the join.";

export const YOU_LEDE = "Lists live on the phone. No password.";

export const YOU_WHAT = "Pokémon at this table. Match here, then talk.";

export const HAVE_FIRST_RUN_TITLE = "Here. This room. This table.";

export const HAVE_FIRST_RUN_BODY =
  "Add a few haves and wants. One phone shows a table code or QR. The other types it or scans. If the lists overlap, both phones fire. Then you talk.";

export const HAVE_FIRST_RUN_PRIVACY = "Lists live on the phone. No password.";

export const INSTALL_HEADING = "Add to Home Screen";

export const INSTALL_NO_ACCOUNT = "No. Lists live on the phone. No password.";

export const INSTALL_IPHONE = "iPhone: Safari → Share → Add to Home Screen.";

export const INSTALL_ANDROID = "Android: Chrome menu → Add to Home screen or Install app.";

export const PRIVACY_LISTS = "Have-lists and want-lists live on the device.";

export const PRIVACY_PING = "A ping when someone at this table is a match.";

export const PRIVACY_FAN = "TableTrade is an unofficial fan tool.";

export const QR_SHEET_LEDE = "They scan this QR or type the code. That is the join.";
