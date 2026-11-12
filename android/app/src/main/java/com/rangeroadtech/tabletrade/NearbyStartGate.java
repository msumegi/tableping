package com.rangeroadtech.tabletrade;

/**
 * Whether a looking session is allowed to touch the radio.
 * On API 30 and older, Bluetooth scan uses the location feature: if the system
 * Location toggle is off, scan returns no devices and never reports an error.
 * API 31+ uses a neverForLocation scan and does not need that toggle.
 */
public final class NearbyStartGate {
    public static final String LOCATION_OFF = "LOCATION_OFF";
    public static final String BLUETOOTH_OFF = "BLUETOOTH_OFF";

    public static final String LOCATION_OFF_MESSAGE =
            "Turn on Location to find traders. Android 11 and older need Location on for Bluetooth to see nearby phones. TableTrade does not use your GPS position.";
    public static final String BLUETOOTH_OFF_MESSAGE =
            "Turn Bluetooth on to find traders. Looking talks to phones close by over Bluetooth.";

    private NearbyStartGate() {}

    public static boolean needsSystemLocation(int sdkInt) {
        return sdkInt <= 30;
    }

    /** @return a reject code, or null when scanning may start */
    public static String blockCode(int sdkInt, boolean bluetoothOn, boolean locationOn) {
        if (!bluetoothOn) return BLUETOOTH_OFF;
        if (needsSystemLocation(sdkInt) && !locationOn) return LOCATION_OFF;
        return null;
    }

    public static String messageFor(String code) {
        if (LOCATION_OFF.equals(code)) return LOCATION_OFF_MESSAGE;
        if (BLUETOOTH_OFF.equals(code)) return BLUETOOTH_OFF_MESSAGE;
        return "Looking needs Bluetooth on this phone.";
    }
}
