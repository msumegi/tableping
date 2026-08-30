export function shopHint(gpsOn: boolean, geoStatus: string): string {
  if (!gpsOn) {
    return geoStatus !== "Off" ? geoStatus : "Your phone stays quiet. The app is off.";
  }
  return geoStatus === "Off" ? "Ready to trade here." : geoStatus;
}

export function tableShareHint(tableOn: boolean): string {
  return tableOn
    ? "They type this code or scan the QR."
    : "Turn On, then they type this code or scan the QR.";
}

export function gpsOptionalHint(): string {
  return "Optional. Indoor shops and basements often break GPS.";
}

export const HAVE_FIRST_RUN_TITLE = "You’re at a table.";

export const HAVE_FIRST_RUN_BODY =
  "Add a few cards you’d trade. Join the same table with a four-character code or QR. When the lists match, both phones ping — then you talk in person.";

export const HAVE_FIRST_RUN_PRIVACY = "Lists stay on this phone. No account.";

export const INSTALL_HEADING = "Add to Home Screen";

export const INSTALL_NO_ACCOUNT = "No account needed.";

export const INSTALL_IPHONE = "iPhone: Safari Share → Add to Home Screen.";

export const INSTALL_ANDROID = "Android: Chrome menu → Add to Home screen.";

export const PRIVACY_LISTS = "Lists live on this phone.";

export const PRIVACY_PING = "A match ping is because you are at the same table.";

export const PRIVACY_FAN = "Unofficial fan tool.";
