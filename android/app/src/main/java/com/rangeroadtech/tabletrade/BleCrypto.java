package com.rangeroadtech.tabletrade;

import java.math.BigInteger;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import java.security.interfaces.ECPublicKey;
import java.security.spec.ECParameterSpec;

/**
 * Phone-to-phone payload crypto for Bluetooth LE.
 * ECDH P-256, HKDF-SHA256, AES-256-GCM. APIs used here exist on API 24.
 * No X25519, no HexFormat, no java.util.Base64.
 *
 * Frame: version (1) || uncompressed public key (65) || nonce (12) || ciphertext||tag.
 * Handshake read: version (1) || server public key (65). No profile bytes.
 */
public final class BleCrypto {
    public static final int VERSION = 2;
    public static final int PUB_LEN = 65;
    public static final int NONCE_LEN = 12;
    public static final int TAG_LEN = 16;
    public static final int OVERHEAD = 1 + PUB_LEN + NONCE_LEN + TAG_LEN;
    public static final int TARGET_MTU = 517;
    public static final int ATT_HEADER = 3;
    /** One ATT packet at the MTU we ask for. Larger profiles are split across packets. */
    public static final int SINGLE_PACKET = TARGET_MTU - ATT_HEADER;
    /** Hard ceiling for one assembled frame, plaintext plus framing. */
    public static final int MAX_FRAME = 2048;
    public static final int MAX_PLAINTEXT = MAX_FRAME - OVERHEAD;
    public static final int HANDSHAKE_LEN = 1 + PUB_LEN;

    private static final byte[] SALT = utf8("tabletrade-ble-v2");
    private static final byte[] INFO_C2S = utf8("tabletrade-ble-v2-c2s");
    private static final byte[] INFO_S2C = utf8("tabletrade-ble-v2-s2c");
    private static final SecureRandom RANDOM = new SecureRandom();

    private BleCrypto() {}

    public static final class Rejected extends Exception {
        public Rejected(String message) {
            super(message);
        }
    }

    public static final class Opened {
        public final byte[] plaintext;
        public final byte[] peerPublic;

        Opened(byte[] plaintext, byte[] peerPublic) {
            this.plaintext = plaintext;
            this.peerPublic = peerPublic;
        }
    }

    /** Nonces accepted on this connection. A repeat of an accepted nonce is a replay. */
    public static final class NonceWindow {
        private byte[][] seen = new byte[4][];
        private int count;

        public synchronized boolean already(byte[] nonce) {
            for (int i = 0; i < count; i++) {
                if (Arrays.equals(seen[i], nonce)) return true;
            }
            return false;
        }

        public synchronized void remember(byte[] nonce) {
            if (count == seen.length) seen = Arrays.copyOf(seen, seen.length * 2);
            seen[count++] = nonce.clone();
        }
    }

    /**
     * Reassembles a long GATT write when the negotiated MTU is below the frame.
     * The Android stack delivers prepared-write chunks with an offset.
     */
    public static final class WriteAssembler {
        private byte[] buf = new byte[MAX_FRAME];
        private int len;
        private boolean bad;

        public void append(int offset, byte[] value) {
            if (bad || value == null || offset < 0) {
                bad = true;
                return;
            }
            int end = offset + value.length;
            if (end > MAX_FRAME) {
                bad = true;
                return;
            }
            System.arraycopy(value, 0, buf, offset, value.length);
            if (end > len) len = end;
        }

        public byte[] finish() throws Rejected {
            if (bad || len < OVERHEAD) throw new Rejected("truncated frame");
            byte[] out = Arrays.copyOf(buf, len);
            reset();
            return out;
        }

        public void reset() {
            if (buf != null) Arrays.fill(buf, (byte) 0);
            buf = new byte[MAX_FRAME];
            len = 0;
            bad = false;
        }
    }

    public static final class Ephemeral {
        private final KeyPair pair;
        private final byte[] publicUncompressed;
        private boolean destroyed;

        Ephemeral(KeyPair pair) {
            this.pair = pair;
            this.publicUncompressed = encodePublic((ECPublicKey) pair.getPublic());
        }

        public byte[] publicKey() {
            return publicUncompressed.clone();
        }

        public void zeroize() {
            if (destroyed) return;
            destroyed = true;
            PrivateKey pk = pair.getPrivate();
            if (pk instanceof javax.security.auth.Destroyable) {
                try {
                    ((javax.security.auth.Destroyable) pk).destroy();
                } catch (Exception ignored) {
                    /* provider may not support destroy; drop the reference anyway */
                }
            }
        }

        private void alive() throws Rejected {
            if (destroyed) throw new Rejected("key discarded");
        }
    }

    public static Ephemeral generate() {
        try {
            KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
            kpg.initialize(new ECGenParameterSpec("secp256r1"));
            return new Ephemeral(kpg.generateKeyPair());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("ECDH P-256 is not available", e);
        }
    }

    public static byte[] handshake(byte[] serverPublic) throws Rejected {
        requirePoint(serverPublic);
        byte[] out = new byte[HANDSHAKE_LEN];
        out[0] = (byte) VERSION;
        System.arraycopy(serverPublic, 0, out, 1, PUB_LEN);
        return out;
    }

    public static byte[] serverPublicFromHandshake(byte[] value) throws Rejected {
        if (value == null || value.length == 0) throw new Rejected("empty payload rejected");
        if (value[0] == '{') throw new Rejected("unencrypted payload rejected");
        if ((value[0] & 0xff) != VERSION) throw new Rejected("old or unknown protocol version");
        if (value.length != HANDSHAKE_LEN) throw new Rejected("truncated frame");
        byte[] pub = Arrays.copyOfRange(value, 1, 1 + PUB_LEN);
        requirePoint(pub);
        return pub;
    }

    public static byte[] sealClientToServer(Ephemeral client, byte[] serverPublic, byte[] plaintext) throws Rejected {
        client.alive();
        requirePoint(serverPublic);
        byte[] clientPublic = client.publicUncompressed;
        return seal(client, serverPublic, serverPublic, clientPublic, plaintext, INFO_C2S);
    }

    public static Opened openClientToServer(Ephemeral server, byte[] frame, NonceWindow seen) throws Rejected {
        server.alive();
        Parsed parsed = parse(frame);
        if (seen.already(parsed.nonce)) throw new Rejected("replayed nonce");
        byte[] serverPublic = server.publicUncompressed;
        byte[] key = directionKey(server, parsed.pub, serverPublic, parsed.pub, INFO_C2S);
        byte[] plain = aes(false, key, parsed.nonce, aad(serverPublic, parsed.pub), parsed.ciphertext);
        seen.remember(parsed.nonce);
        return new Opened(plain, parsed.pub);
    }

    public static byte[] sealServerToClient(Ephemeral server, byte[] clientPublic, byte[] plaintext) throws Rejected {
        server.alive();
        requirePoint(clientPublic);
        byte[] serverPublic = server.publicUncompressed;
        return seal(server, clientPublic, serverPublic, clientPublic, plaintext, INFO_S2C);
    }

    public static byte[] openServerToClient(Ephemeral client, byte[] expectedServerPublic, byte[] frame, NonceWindow seen) throws Rejected {
        client.alive();
        requirePoint(expectedServerPublic);
        Parsed parsed = parse(frame);
        if (!Arrays.equals(parsed.pub, expectedServerPublic)) throw new Rejected("public key mismatch");
        if (seen.already(parsed.nonce)) throw new Rejected("replayed nonce");
        byte[] clientPublic = client.publicUncompressed;
        byte[] key = directionKey(client, expectedServerPublic, expectedServerPublic, clientPublic, INFO_S2C);
        byte[] plain = aes(false, key, parsed.nonce, aad(expectedServerPublic, clientPublic), parsed.ciphertext);
        seen.remember(parsed.nonce);
        return plain;
    }

    /** One ATT read/write response chunk. mtu is the negotiated ATT MTU. */
    public static byte[] sliceForMtu(byte[] all, int offset, int mtu) {
        if (all == null || offset < 0 || offset >= all.length) return new byte[0];
        int att = mtu - ATT_HEADER;
        if (att < 1) att = 20;
        int n = Math.min(att, all.length - offset);
        return Arrays.copyOfRange(all, offset, offset + n);
    }

    /** Version 1 JSON and any other pre-v2 frame. Callers log these and do not retry. */
    public static boolean isLegacyPayload(String reason) {
        if (reason == null) return false;
        return reason.contains("old or unknown protocol version")
                || reason.contains("unencrypted payload rejected");
    }

    public static boolean frameFitsSinglePacket(int frameLen, int mtu) {
        return frameLen >= 0 && frameLen <= mtu - ATT_HEADER;
    }

    /** Left-pad or keep the low 32 bytes. Android and Java disagree on ECDH length. */
    static byte[] normalizeSecret(byte[] raw) {
        byte[] out = new byte[32];
        if (raw == null || raw.length == 0) return out;
        if (raw.length >= 32) {
            System.arraycopy(raw, raw.length - 32, out, 0, 32);
        } else {
            System.arraycopy(raw, 0, out, 32 - raw.length, raw.length);
        }
        return out;
    }

    private static byte[] seal(Ephemeral self, byte[] remotePublic, byte[] serverPublic, byte[] clientPublic, byte[] plaintext, byte[] label) throws Rejected {
        if (plaintext == null) throw new Rejected("empty payload rejected");
        if (plaintext.length > MAX_PLAINTEXT) throw new Rejected("payload exceeds 2 KB ceiling");
        byte[] nonce = new byte[NONCE_LEN];
        RANDOM.nextBytes(nonce);
        byte[] key = directionKey(self, remotePublic, serverPublic, clientPublic, label);
        byte[] ct = aes(true, key, nonce, aad(serverPublic, clientPublic), plaintext);
        byte[] speaker = label == INFO_C2S ? clientPublic : serverPublic;
        byte[] out = new byte[OVERHEAD - TAG_LEN + ct.length];
        out[0] = (byte) VERSION;
        System.arraycopy(speaker, 0, out, 1, PUB_LEN);
        System.arraycopy(nonce, 0, out, 1 + PUB_LEN, NONCE_LEN);
        System.arraycopy(ct, 0, out, 1 + PUB_LEN + NONCE_LEN, ct.length);
        return out;
    }

    private static byte[] directionKey(Ephemeral self, byte[] remotePublic, byte[] serverPublic, byte[] clientPublic, byte[] label) throws Rejected {
        byte[] secret = agree(self.pair.getPrivate(), paramsOf(self), remotePublic);
        try {
            return hkdf(secret, SALT, info(label, serverPublic, clientPublic), 32);
        } finally {
            wipe(secret);
        }
    }

    private static byte[] agree(PrivateKey mine, ECParameterSpec params, byte[] remoteUncompressed) throws Rejected {
        try {
            PublicKey remote = decodePublic(remoteUncompressed, params);
            javax.crypto.KeyAgreement ka = javax.crypto.KeyAgreement.getInstance("ECDH");
            ka.init(mine);
            ka.doPhase(remote, true);
            byte[] raw = ka.generateSecret();
            try {
                return normalizeSecret(raw);
            } finally {
                wipe(raw);
            }
        } catch (Rejected e) {
            throw e;
        } catch (GeneralSecurityException e) {
            throw new Rejected("key agreement failed");
        }
    }

    private static PublicKey decodePublic(byte[] uncompressed, ECParameterSpec params) throws Rejected {
        requirePoint(uncompressed);
        byte[] x = Arrays.copyOfRange(uncompressed, 1, 33);
        byte[] y = Arrays.copyOfRange(uncompressed, 33, 65);
        ECPoint w = new ECPoint(new BigInteger(1, x), new BigInteger(1, y));
        try {
            return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(w, params));
        } catch (GeneralSecurityException e) {
            throw new Rejected("bad public key");
        }
    }

    private static ECParameterSpec paramsOf(Ephemeral self) {
        return ((ECPublicKey) self.pair.getPublic()).getParams();
    }

    static byte[] encodePublic(ECPublicKey key) {
        ECPoint w = key.getW();
        byte[] out = new byte[PUB_LEN];
        out[0] = 0x04;
        System.arraycopy(fixed32(w.getAffineX()), 0, out, 1, 32);
        System.arraycopy(fixed32(w.getAffineY()), 0, out, 33, 32);
        return out;
    }

    private static byte[] fixed32(BigInteger v) {
        byte[] raw = v.toByteArray();
        byte[] out = new byte[32];
        int src = Math.max(0, raw.length - 32);
        int len = raw.length - src;
        System.arraycopy(raw, src, out, 32 - len, len);
        return out;
    }

    private static byte[] hkdf(byte[] ikm, byte[] salt, byte[] info, int length) throws Rejected {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(salt, "HmacSHA256"));
            byte[] prk = mac.doFinal(ikm);
            try {
                mac.init(new SecretKeySpec(prk, "HmacSHA256"));
                byte[] okm = new byte[length];
                byte[] prev = new byte[0];
                int pos = 0;
                int counter = 1;
                while (pos < length) {
                    mac.reset();
                    mac.update(prev);
                    mac.update(info);
                    mac.update((byte) counter);
                    prev = mac.doFinal();
                    int take = Math.min(prev.length, length - pos);
                    System.arraycopy(prev, 0, okm, pos, take);
                    pos += take;
                    counter++;
                }
                wipe(prev);
                return okm;
            } finally {
                wipe(prk);
            }
        } catch (GeneralSecurityException e) {
            throw new Rejected("hkdf failed");
        }
    }

    private static byte[] info(byte[] label, byte[] serverPublic, byte[] clientPublic) {
        byte[] out = new byte[label.length + PUB_LEN + PUB_LEN];
        System.arraycopy(label, 0, out, 0, label.length);
        System.arraycopy(serverPublic, 0, out, label.length, PUB_LEN);
        System.arraycopy(clientPublic, 0, out, label.length + PUB_LEN, PUB_LEN);
        return out;
    }

    private static byte[] aad(byte[] serverPublic, byte[] clientPublic) {
        byte[] out = new byte[1 + PUB_LEN + PUB_LEN];
        out[0] = (byte) VERSION;
        System.arraycopy(serverPublic, 0, out, 1, PUB_LEN);
        System.arraycopy(clientPublic, 0, out, 1 + PUB_LEN, PUB_LEN);
        return out;
    }

    private static byte[] aes(boolean encrypt, byte[] key, byte[] nonce, byte[] aad, byte[] input) throws Rejected {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    encrypt ? Cipher.ENCRYPT_MODE : Cipher.DECRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(128, nonce));
            cipher.updateAAD(aad);
            return cipher.doFinal(input);
        } catch (GeneralSecurityException e) {
            throw new Rejected("authentication failed");
        } finally {
            wipe(key);
        }
    }

    private static void requirePoint(byte[] pub) throws Rejected {
        if (pub == null || pub.length != PUB_LEN || pub[0] != 0x04) throw new Rejected("bad public key");
    }

    private static final class Parsed {
        final byte[] pub;
        final byte[] nonce;
        final byte[] ciphertext;

        Parsed(byte[] pub, byte[] nonce, byte[] ciphertext) {
            this.pub = pub;
            this.nonce = nonce;
            this.ciphertext = ciphertext;
        }
    }

    private static Parsed parse(byte[] frame) throws Rejected {
        if (frame == null || frame.length == 0) throw new Rejected("empty payload rejected");
        if (frame[0] == '{') throw new Rejected("unencrypted payload rejected");
        if ((frame[0] & 0xff) != VERSION) throw new Rejected("old or unknown protocol version");
        if (frame.length < OVERHEAD) throw new Rejected("truncated frame");
        byte[] pub = Arrays.copyOfRange(frame, 1, 1 + PUB_LEN);
        requirePoint(pub);
        byte[] nonce = Arrays.copyOfRange(frame, 1 + PUB_LEN, 1 + PUB_LEN + NONCE_LEN);
        byte[] ct = Arrays.copyOfRange(frame, 1 + PUB_LEN + NONCE_LEN, frame.length);
        return new Parsed(pub, nonce, ct);
    }

    private static byte[] utf8(String s) {
        return s.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    private static void wipe(byte[] b) {
        if (b != null) Arrays.fill(b, (byte) 0);
    }
}
