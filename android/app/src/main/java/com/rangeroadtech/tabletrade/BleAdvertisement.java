package com.rangeroadtech.tabletrade;

/**
 * Advertisement payload for v2. Six bytes: 'T','2' and a 4-byte random token.
 * The token rotates and is not derived from a user id, name, or card list.
 * Version 1 ads used 'T','T' plus a hash of the user id; those are ignored.
 */
public final class BleAdvertisement {
    private BleAdvertisement() {}

    public static byte[] manufacturerData(byte[] rotatingToken) {
        if (rotatingToken == null || rotatingToken.length != 4) {
            throw new IllegalArgumentException("rotating token");
        }
        byte[] mfg = new byte[6];
        mfg[0] = 'T';
        mfg[1] = '2';
        System.arraycopy(rotatingToken, 0, mfg, 2, 4);
        return mfg;
    }

    /** @return the 4-byte token, or null when this is not a v2 TableTrade ad */
    public static byte[] tokenFrom(byte[] mfg) {
        if (mfg == null || mfg.length < 6 || mfg[0] != 'T' || mfg[1] != '2') return null;
        byte[] token = new byte[4];
        System.arraycopy(mfg, 2, token, 0, 4);
        return token;
    }

    /** Version 1 ads start with 'TT'. They are not a peer we can read. */
    public static boolean isLegacy(byte[] mfg) {
        return mfg != null && mfg.length >= 2 && mfg[0] == 'T' && mfg[1] == 'T';
    }
}
