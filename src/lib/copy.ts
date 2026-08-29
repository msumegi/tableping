export function shopHint(gpsOn: boolean, geoStatus: string): string {
  if (!gpsOn) {
    return geoStatus !== "Off" ? geoStatus : "Your phone stays quiet. The app is off.";
  }
  return geoStatus === "Off" ? "Ready to trade here." : geoStatus;
}
