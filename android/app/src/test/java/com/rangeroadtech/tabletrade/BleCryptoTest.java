package com.rangeroadtech.tabletrade;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public class BleCryptoTest {
    @Test
    public void loopback_roundTripBothDirections() throws Exception {
        byte[] serverPlain = "{\"userId\":\"server\",\"name\":\"Ada\"}".getBytes(StandardCharsets.UTF_8);
        byte[] clientPlain = "{\"userId\":\"client\",\"name\":\"Kai\",\"note\":\"Red hoodie\"}".getBytes(StandardCharsets.UTF_8);

        BleCrypto.Ephemeral server = BleCrypto.generate();
        BleCrypto.Ephemeral client = BleCrypto.generate();
        byte[] hello = BleCrypto.handshake(server.publicKey());
        assertEquals(BleCrypto.HANDSHAKE_LEN, hello.length);
        assertEquals(BleCrypto.VERSION, hello[0] & 0xff);
        assertEquals(0x04, hello[1] & 0xff);
        byte[] serverPub = BleCrypto.serverPublicFromHandshake(hello);
        assertArrayEquals(server.publicKey(), serverPub);

        byte[] clientFrame = BleCrypto.sealClientToServer(client, serverPub, clientPlain);
        assertEquals(clientPlain.length + BleCrypto.OVERHEAD, clientFrame.length);
        assertEquals(BleCrypto.VERSION, clientFrame[0] & 0xff);

        BleCrypto.NonceWindow serverSeen = new BleCrypto.NonceWindow();
        BleCrypto.Opened opened = BleCrypto.openClientToServer(server, clientFrame, serverSeen);
        assertArrayEquals(clientPlain, opened.plaintext);

        byte[] reply = BleCrypto.sealServerToClient(server, opened.peerPublic, serverPlain);
        byte[] back = BleCrypto.openServerToClient(client, serverPub, reply, new BleCrypto.NonceWindow());
        assertArrayEquals(serverPlain, back);

        server.zeroize();
        client.zeroize();
        try {
            BleCrypto.sealClientToServer(client, serverPub, clientPlain);
            fail("discarded key still sealed");
        } catch (BleCrypto.Rejected e) {
            assertTrue(e.getMessage().contains("discarded"));
        }
    }

    @Test
    public void tamperedCiphertextFails() throws Exception {
        BleCrypto.Ephemeral server = BleCrypto.generate();
        BleCrypto.Ephemeral client = BleCrypto.generate();
        byte[] frame = BleCrypto.sealClientToServer(client, server.publicKey(), "hi".getBytes(StandardCharsets.UTF_8));
        frame[frame.length - 1] ^= 0x01;
        try {
            BleCrypto.openClientToServer(server, frame, new BleCrypto.NonceWindow());
            fail("tampered frame opened");
        } catch (BleCrypto.Rejected e) {
            assertEquals("authentication failed", e.getMessage());
        }
    }

    @Test
    public void wrongKeyFails() throws Exception {
        BleCrypto.Ephemeral server = BleCrypto.generate();
        BleCrypto.Ephemeral other = BleCrypto.generate();
        BleCrypto.Ephemeral client = BleCrypto.generate();
        byte[] frame = BleCrypto.sealClientToServer(client, server.publicKey(), "hi".getBytes(StandardCharsets.UTF_8));
        try {
            BleCrypto.openClientToServer(other, frame, new BleCrypto.NonceWindow());
            fail("wrong key opened");
        } catch (BleCrypto.Rejected e) {
            assertEquals("authentication failed", e.getMessage());
        }
    }

    @Test
    public void replayedNonceAndOldVersionFail() throws Exception {
        BleCrypto.Ephemeral server = BleCrypto.generate();
        BleCrypto.Ephemeral client = BleCrypto.generate();
        byte[] plain = "once".getBytes(StandardCharsets.UTF_8);
        byte[] frame = BleCrypto.sealClientToServer(client, server.publicKey(), plain);
        BleCrypto.NonceWindow seen = new BleCrypto.NonceWindow();
        assertArrayEquals(plain, BleCrypto.openClientToServer(server, frame, seen).plaintext);
        try {
            BleCrypto.openClientToServer(server, frame, seen);
            fail("replay opened");
        } catch (BleCrypto.Rejected e) {
            assertEquals("replayed nonce", e.getMessage());
        }

        byte[] old = frame.clone();
        old[0] = 1;
        try {
            BleCrypto.openClientToServer(server, old, new BleCrypto.NonceWindow());
            fail("version 1 opened");
        } catch (BleCrypto.Rejected e) {
            assertEquals("old or unknown protocol version", e.getMessage());
        }

        byte[] json = "{\"userId\":\"u\",\"name\":\"Kai\"}".getBytes(StandardCharsets.UTF_8);
        try {
            BleCrypto.openClientToServer(server, json, new BleCrypto.NonceWindow());
            fail("plaintext opened");
        } catch (BleCrypto.Rejected e) {
            assertEquals("unencrypted payload rejected", e.getMessage());
        }
        try {
            BleCrypto.serverPublicFromHandshake(json);
            fail("plaintext handshake accepted");
        } catch (BleCrypto.Rejected e) {
            assertEquals("unencrypted payload rejected", e.getMessage());
        }
    }

    @Test
    public void ceilingIsTwoKilobytesAndOneExtraByteIsRejected() throws Exception {
        assertEquals(94, BleCrypto.OVERHEAD);
        assertEquals(2048, BleCrypto.MAX_FRAME);
        assertEquals(1954, BleCrypto.MAX_PLAINTEXT);
        assertEquals(514, BleCrypto.SINGLE_PACKET);
        byte[] plain = new byte[BleCrypto.MAX_PLAINTEXT];
        Arrays.fill(plain, (byte) 'A');
        BleCrypto.Ephemeral server = BleCrypto.generate();
        BleCrypto.Ephemeral client = BleCrypto.generate();
        byte[] frame = BleCrypto.sealClientToServer(client, server.publicKey(), plain);
        assertEquals(BleCrypto.MAX_FRAME, frame.length);
        assertFalse(BleCrypto.frameFitsSinglePacket(frame.length, BleCrypto.TARGET_MTU));
        byte[] back = androidClientRead(frame, BleCrypto.TARGET_MTU);
        assertArrayEquals(frame, back);
        assertArrayEquals(plain, BleCrypto.openClientToServer(server, back, new BleCrypto.NonceWindow()).plaintext);
        try {
            BleCrypto.sealClientToServer(client, server.publicKey(), new byte[BleCrypto.MAX_PLAINTEXT + 1]);
            fail("oversize sealed");
        } catch (BleCrypto.Rejected e) {
            assertTrue(e.getMessage().contains("2 KB"));
        }
    }

    @Test
    public void maxCardListSurvivesMtu23_185_and517BothWays() throws Exception {
        String[] have = new String[12];
        String[] want = new String[12];
        for (int i = 0; i < 12; i++) {
            have[i] = String.format("swsh12pt5gg-GG%02d", i);
            want[i] = "sv8pt5-" + (200 + i);
        }
        StringBuilder json = new StringBuilder();
        json.append("{\"userId\":\"12345678-1234-1234-1234-123456789abc\",\"name\":\"")
                .append("N".repeat(24))
                .append("\",\"note\":\"")
                .append("O".repeat(40))
                .append("\",\"have\":[");
        for (int i = 0; i < have.length; i++) {
            if (i > 0) json.append(',');
            json.append('"').append(have[i]).append('"');
        }
        json.append("],\"want\":[");
        for (int i = 0; i < want.length; i++) {
            if (i > 0) json.append(',');
            json.append('"').append(want[i]).append('"');
        }
        json.append("],\"ts\":1731400000000}");
        byte[] plain = json.toString().getBytes(StandardCharsets.UTF_8);
        assertTrue(plain.length <= BleCrypto.MAX_PLAINTEXT);

        BleCrypto.Ephemeral server = BleCrypto.generate();
        BleCrypto.Ephemeral client = BleCrypto.generate();
        byte[] frame = BleCrypto.sealClientToServer(client, server.publicKey(), plain);
        assertTrue(frame.length > BleCrypto.SINGLE_PACKET);
        assertTrue(frame.length <= BleCrypto.MAX_FRAME);
        assertFalse(BleCrypto.frameFitsSinglePacket(frame.length, 517));
        assertFalse(BleCrypto.frameFitsSinglePacket(frame.length, 23));

        byte[] hello = BleCrypto.handshake(server.publicKey());
        assertEquals(BleCrypto.HANDSHAKE_LEN, hello.length);
        assertArrayEquals(hello, androidClientRead(hello, 23));
        byte[] reply = BleCrypto.sealServerToClient(server, client.publicKey(), plain);
        for (int mtu : new int[] { 23, 185, 517 }) {
            byte[] written = androidPreparedWrite(frame, mtu);
            assertArrayEquals(frame, written);
            String fromClient = new String(
                    BleCrypto.openClientToServer(server, written, new BleCrypto.NonceWindow()).plaintext,
                    StandardCharsets.UTF_8);
            byte[] read = androidClientRead(reply, mtu);
            assertArrayEquals(reply, read);
            String fromServer = new String(
                    BleCrypto.openServerToClient(client, server.publicKey(), read, new BleCrypto.NonceWindow()),
                    StandardCharsets.UTF_8);
            for (String text : new String[] { fromClient, fromServer }) {
                for (String id : have) assertTrue(text.contains("\"" + id + "\""));
                for (String id : want) assertTrue(text.contains("\"" + id + "\""));
                assertTrue(text.contains("N".repeat(24)));
                assertTrue(text.contains("O".repeat(40)));
            }
        }
        int exactMtu = 23;
        byte[] exact = new byte[(exactMtu - 1) * 3];
        java.util.Arrays.fill(exact, (byte) 7);
        assertArrayEquals(exact, androidClientRead(exact, exactMtu));
        byte[] shortFirst = new byte[100];
        assertTrue(stopAfterShortChunk(shortFirst, 23, 23 - 3).length < shortFirst.length);
        assertTrue(BleCrypto.isLegacyPayload("old or unknown protocol version"));
        assertTrue(BleCrypto.isLegacyPayload("unencrypted payload rejected"));
        assertFalse(BleCrypto.isLegacyPayload("authentication failed"));
        assertFalse(BleCrypto.isLegacyPayload("replayed nonce"));
    }

    /**
     * AOSP gatt_cl.cc keeps reading only while the response length is exactly MTU−1.
     * The server offers every remaining byte; the stack trims that to MTU−1.
     * A shorter first chunk ends the read.
     */
    private static byte[] androidClientRead(byte[] value, int mtu) {
        int full = mtu - 1;
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int offset = 0;
        while (true) {
            byte[] offered = BleCrypto.readResponse(value, offset);
            int len = Math.min(full, offered.length);
            if (len > 0) out.write(offered, 0, len);
            offset += len;
            if (len != full) break;
        }
        return out.toByteArray();
    }

    private static byte[] stopAfterShortChunk(byte[] value, int mtu, int serverSlice) {
        int full = mtu - 1;
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int offset = 0;
        int len = Math.min(serverSlice, Math.max(0, value.length - offset));
        if (len > 0) out.write(value, offset, len);
        if (len == full && offset + len < value.length) {
            throw new AssertionError("a short slice must not look full");
        }
        return out.toByteArray();
    }

    /** Prepared writes carry at most MTU−3 bytes of value. The server appends by offset. */
    private static byte[] androidPreparedWrite(byte[] value, int mtu) throws Exception {
        int chunk = Math.max(1, mtu - BleCrypto.ATT_HEADER);
        BleCrypto.WriteAssembler asm = new BleCrypto.WriteAssembler();
        int offset = 0;
        while (offset < value.length) {
            int len = Math.min(chunk, value.length - offset);
            asm.append(offset, Arrays.copyOfRange(value, offset, offset + len));
            offset += len;
        }
        return asm.finish();
    }

    @Test
    public void badPublicKeysAreRejectedWithoutACrash() throws Exception {
        BleCrypto.Ephemeral server = BleCrypto.generate();
        byte[] frame = new byte[BleCrypto.OVERHEAD];
        frame[0] = (byte) BleCrypto.VERSION;
        byte[] offCurve = new byte[65];
        offCurve[0] = 0x04;
        System.arraycopy(offCurve, 0, frame, 1, 65);
        try {
            BleCrypto.openClientToServer(server, frame, new BleCrypto.NonceWindow());
            fail("off-curve key opened");
        } catch (BleCrypto.Rejected e) {
            assertEquals("bad public key", e.getMessage());
        }
        byte[] tooBig = new byte[65];
        tooBig[0] = 0x04;
        Arrays.fill(tooBig, 1, 65, (byte) 0xff);
        System.arraycopy(tooBig, 0, frame, 1, 65);
        try {
            BleCrypto.openClientToServer(server, frame, new BleCrypto.NonceWindow());
            fail("oversized coordinate opened");
        } catch (BleCrypto.Rejected e) {
            assertEquals("bad public key", e.getMessage());
        } catch (RuntimeException e) {
            fail("runtime exception escaped: " + e);
        }
    }

    @Test
    public void swappedDirectionFails() throws Exception {
        BleCrypto.Ephemeral server = BleCrypto.generate();
        BleCrypto.Ephemeral client = BleCrypto.generate();
        byte[] serverPub = server.publicKey();
        byte[] frame = BleCrypto.sealClientToServer(client, serverPub, "x".getBytes(StandardCharsets.UTF_8));
        System.arraycopy(serverPub, 0, frame, 1, BleCrypto.PUB_LEN);
        try {
            BleCrypto.openServerToClient(client, serverPub, frame, new BleCrypto.NonceWindow());
            fail("client-to-server ciphertext accepted on the reply key");
        } catch (BleCrypto.Rejected e) {
            assertEquals("authentication failed", e.getMessage());
        }
    }

    @Test
    public void normalizeSecretPadsAndTrims() {
        byte[] shortSecret = new byte[] { 0x11, 0x22 };
        byte[] padded = BleCrypto.normalizeSecret(shortSecret);
        assertEquals(32, padded.length);
        assertEquals(0x11, padded[30]);
        assertEquals(0x22, padded[31]);
        byte[] wide = new byte[33];
        wide[0] = 0x00;
        wide[1] = 0x7f;
        wide[32] = 0x05;
        byte[] trimmed = BleCrypto.normalizeSecret(wide);
        assertEquals(32, trimmed.length);
        assertEquals(0x7f, trimmed[0]);
        assertEquals(0x05, trimmed[31]);
    }
}
