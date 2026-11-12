package com.rangeroadtech.tabletrade;

/**
 * Advertisement payload for v2. Six bytes: 'T','2' and a 4-byte random token.
 * The token rotates and is not derived from a user id, name, or card list.
 * Version 1 ads used 'T','T' plus a hash of the user id; those are ignored.
 */
public final class BleAdvertisement {
    private BleAdvertisement() {}

    /** Service data: 'T','2' and a 4-byte rotating token. Not a Bluetooth company id. */
    public static byte[] serviceData(byte[] rotatingToken) {
        if (rotatingToken == null || rotatingToken.length != 4) {
            throw new IllegalArgumentException("rotating token");
        }
        byte[] data = new byte[6];
        data[0] = 'T';
        data[1] = '2';
        System.arraycopy(rotatingToken, 0, data, 2, 4);
        return data;
    }

    /** @return the 4-byte token, or null when this is not a v2 TableTrade service payload */
    public static byte[] tokenFromServiceData(byte[] data) {
        if (data == null || data.length < 6 || data[0] != 'T' || data[1] != '2') return null;
        byte[] token = new byte[4];
        System.arraycopy(data, 2, token, 0, 4);
        return token;
    }

    /** Version 1 ads used manufacturer data starting with 'TT'. */
    public static boolean isLegacy(byte[] manufacturerData) {
        return manufacturerData != null && manufacturerData.length >= 2
                && manufacturerData[0] == 'T' && manufacturerData[1] == 'T';
    }
}
