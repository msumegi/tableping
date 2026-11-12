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
    public void maxPlaintextFitsMtu517AndOneExtraDoesNot() throws Exception {
        assertEquals(94, BleCrypto.OVERHEAD);
        assertEquals(514, BleCrypto.MAX_FRAME);
        assertEquals(420, BleCrypto.MAX_PLAINTEXT);
        byte[] plain = new byte[BleCrypto.MAX_PLAINTEXT];
        Arrays.fill(plain, (byte) 'A');
        BleCrypto.Ephemeral server = BleCrypto.generate();
        BleCrypto.Ephemeral client = BleCrypto.generate();
        byte[] frame = BleCrypto.sealClientToServer(client, server.publicKey(), plain);
        assertEquals(BleCrypto.MAX_FRAME, frame.length);
        assertTrue(BleCrypto.frameFitsSinglePacket(frame.length, BleCrypto.TARGET_MTU));
        assertFalse(BleCrypto.frameFitsSinglePacket(frame.length, 185));
        assertArrayEquals(plain, BleCrypto.openClientToServer(server, frame, new BleCrypto.NonceWindow()).plaintext);
        try {
            BleCrypto.sealClientToServer(client, server.publicKey(), new byte[BleCrypto.MAX_PLAINTEXT + 1]);
            fail("oversize sealed");
        } catch (BleCrypto.Rejected e) {
            assertTrue(e.getMessage().contains("MTU 517"));
        }
    }

    @Test
    public void lowMtuChunksReassembleThenDecrypt() throws Exception {
        BleCrypto.Ephemeral server = BleCrypto.generate();
        BleCrypto.Ephemeral client = BleCrypto.generate();
        byte[] plain = "profile-across-small-mtu".getBytes(StandardCharsets.UTF_8);
        byte[] frame = BleCrypto.sealClientToServer(client, server.publicKey(), plain);
        assertFalse(BleCrypto.frameFitsSinglePacket(frame.length, 23));

        BleCrypto.WriteAssembler asm = new BleCrypto.WriteAssembler();
        int offset = 0;
        int chunk = 23 - BleCrypto.ATT_HEADER;
        while (offset < frame.length) {
            int n = Math.min(chunk, frame.length - offset);
            asm.append(offset, Arrays.copyOfRange(frame, offset, offset + n));
            offset += n;
        }
        byte[] joined = asm.finish();
        assertArrayEquals(frame, joined);
        assertArrayEquals(plain, BleCrypto.openClientToServer(server, joined, new BleCrypto.NonceWindow()).plaintext);

        byte[] hello = BleCrypto.handshake(server.publicKey());
        byte[] rebuilt = new byte[hello.length];
        int at = 0;
        while (at < hello.length) {
            byte[] slice = BleCrypto.sliceForMtu(hello, at, 23);
            assertTrue(slice.length <= 20);
            System.arraycopy(slice, 0, rebuilt, at, slice.length);
            at += slice.length;
        }
        assertArrayEquals(hello, rebuilt);
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
