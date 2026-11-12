package com.rangeroadtech.tabletrade;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Before this gate, NearbyPlugin started a scan whenever Bluetooth was on and
 * the permission was granted. On API 30 and older that scan silently returns
 * nobody when the system Location toggle is off. The gate rejects that case
 * with LOCATION_OFF and does not start. API 31+ skips the location toggle.
 */
public class NearbyStartGateTest {
    @Test
    public void api28And30BlockWhenLocationIsOff() {
        assertTrue(NearbyStartGate.needsSystemLocation(28));
        assertTrue(NearbyStartGate.needsSystemLocation(30));
        assertEquals(NearbyStartGate.LOCATION_OFF, NearbyStartGate.blockCode(28, true, false));
        assertEquals(NearbyStartGate.LOCATION_OFF, NearbyStartGate.blockCode(30, true, false));
        assertNull(NearbyStartGate.blockCode(28, true, true));
        assertNull(NearbyStartGate.blockCode(24, true, true));
    }

    @Test
    public void api31SkipsLocationToggle() {
        assertFalse(NearbyStartGate.needsSystemLocation(31));
        assertFalse(NearbyStartGate.needsSystemLocation(34));
        assertNull(NearbyStartGate.blockCode(31, true, false));
        assertNull(NearbyStartGate.blockCode(33, true, false));
    }

    @Test
    public void bluetoothOffWinsOnEveryApi() {
        assertEquals(NearbyStartGate.BLUETOOTH_OFF, NearbyStartGate.blockCode(28, false, true));
        assertEquals(NearbyStartGate.BLUETOOTH_OFF, NearbyStartGate.blockCode(31, false, false));
        assertTrue(NearbyStartGate.messageFor(NearbyStartGate.BLUETOOTH_OFF).contains("Turn Bluetooth on"));
        assertEquals(4_000L, NearbyRetry.backoffMs(1));
        assertEquals(8_000L, NearbyRetry.backoffMs(2));
        assertEquals(16_000L, NearbyRetry.backoffMs(3));
        assertEquals(60_000L, NearbyRetry.backoffMs(4));
        assertEquals(60_000L, NearbyRetry.backoffMs(9));
        assertTrue(NearbyStartGate.shouldRequestPermission(false, false, false));
        assertTrue(NearbyStartGate.shouldRequestPermission(false, true, true));
        assertFalse(NearbyStartGate.shouldRequestPermission(false, true, false));
        assertFalse(NearbyStartGate.shouldRequestPermission(true, true, false));
        String location = NearbyStartGate.messageFor(NearbyStartGate.LOCATION_OFF);
        assertTrue(location.contains("does not use your GPS position"));
        assertTrue(location.contains("Android 11 and older"));
    }

    @Test
    public void advertisementIsServiceDataNotACompanyId() {
        byte[] token = new byte[] { 9, 8, 7, 6 };
        byte[] data = BleAdvertisement.serviceData(token);
        assertEquals(6, data.length);
        assertEquals('T', data[0]);
        assertEquals('2', data[1]);
        assertArrayEquals(token, BleAdvertisement.tokenFromServiceData(data));

        byte[] v1 = new byte[] { 'T', 'T', 1, 2, 3, 4 };
        assertNull(BleAdvertisement.tokenFromServiceData(v1));
        assertTrue(BleAdvertisement.isLegacy(v1));
        assertFalse(BleAdvertisement.isLegacy(data));

        String userId = "12345678-1234-1234-1234-123456789abc";
        byte[] legacy = legacyUserHash(userId);
        byte[] legacyAd = new byte[] { 'T', 'T', legacy[0], legacy[1], legacy[2], legacy[3] };
        assertNull(BleAdvertisement.tokenFromServiceData(legacyAd));
        assertTrue(BleAdvertisement.isLegacy(legacyAd));
        assertFalse(new String(data).contains(userId));
    }

    /** The v1 advertisement mixed a 4-byte xor of the user id into the manufacturer data. */
    private static byte[] legacyUserHash(String userId) {
        byte[] out = new byte[4];
        byte[] raw = userId.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        for (int i = 0; i < raw.length; i++) out[i % 4] ^= raw[i];
        return out;
    }
}
