# Bluetooth encryption in TableTrade

TableTrade 1.0.1 sends a trade profile from one phone to another over Bluetooth Low Energy. That profile is encrypted on the way. Version 1 sent it in the clear. Version 2 does not, and it will not fall back to the clear.

## What is in the profile

The profile is a user id, a display name (up to 24 characters), an optional note (up to 40 characters), up to 12 card ids you have, up to 12 card ids you want, and a timestamp. Photos stay on the phone. They are not in this payload.

## How a connection is encrypted

Each connection makes a fresh key. There is no password built into the app.

1. The phone that waits (the GATT server) makes a one-time P-256 key and lets the other phone read only the public half.
2. The phone that connects makes its own one-time key. It writes one package: a version byte (`2`), its public key, a random 12-byte nonce, and the profile encrypted with AES-256-GCM.
3. Both phones turn the shared secret into keys with HKDF-SHA256. The salt is the protocol string `tabletrade-ble-v2`. The HKDF info is a direction label plus both public keys. Each direction has its own key.
4. The waiting phone sends its profile back the same way. The connecting phone reads that package and decrypts it.
5. The extra data checked by AES-GCM is the version byte and both public keys. A package tied to a different key does not decrypt.
6. Private keys and the shared secret are wiped when the exchange finishes.

Public keys are the raw 65-byte uncompressed point (`0x04`, then X, then Y). Each phone rebuilds the other phone's key with `KeyFactory` and `ECPublicKeySpec`. That is so a Galaxy S8+ and a newer Galaxy Z Fold agree, instead of depending on each provider's certificate encoding.

A package that is not version 2, or that is still JSON in the clear, is rejected and logged. Nothing is shown as a match. An old phone and a new phone simply do not match.

## Advertisements

The advertisement is six bytes: the letters `T` and `2`, then four random bytes. Those four bytes change when you start looking, and again every two minutes. They are not your user id, your name, or your cards. Scan responses are not given a name or a profile. Version 1 ads, which carried a hash of the user id, are ignored.

The advertisement still shows that a TableTrade phone is nearby. That is metadata, and this encryption does not hide it.

## Size

The phones ask for ATT MTU 517. One packet can carry 514 bytes (517 minus the 3-byte ATT header).

The encrypted package is:

| Piece | Bytes |
| --- | --- |
| Version | 1 |
| Public key | 65 |
| Nonce | 12 |
| AES-GCM tag | 16 |
| Overhead | 94 |

One MTU 517 packet holds 514 bytes. A full profile does not have to fit in that one packet. The same split used for a small MTU carries any larger frame: reads come back in chunks of MTU − 3, and long writes are put back together before they are decrypted.

The hard ceiling is **2 KB** (2048 bytes) for the whole frame. That leaves 1954 bytes for the profile. A UUID, a 24-character name, a 40-character note, and 12 have ids plus 12 want ids fit in that, including long card ids, and every one of those ids is sent. TableTrade does not drop cards to make the frame smaller. If a profile is somehow bigger than 2 KB, looking does not start a shortened copy. The phone says the lists are too big to send.

A version 1 phone is not a match. Its advertisement is ignored, the app logs that once, and it does not keep connecting. Nearby can show “Someone nearby has an older TableTrade. Ask them to update.” A plaintext or version 1 write is rejected the same way, without a retry loop.

## What this protects against

- A passive Bluetooth sniffer who records the air between the two phones.
- A nearby device that reads the characteristic and expects the profile in the clear.

## What this does not protect against

- An active man-in-the-middle during the key exchange. The exchange is not authenticated. Someone who can sit in the middle of the Bluetooth connection at that moment can substitute their own key.
- Anyone running TableTrade, or a modified copy. The profile is meant for any nearby person who is looking. Encryption stops outsiders from reading it off the air. It does not hide it from another person using the app.
- Metadata. The advertisement still shows that a TableTrade phone is nearby.
- The profile on the receiving phone after it has been decrypted. That phone has the name and the card ids in the clear, which is what makes the ping work.

## Android 9 through Android 11

The crypto uses only APIs that exist from API 24 through API 28: `KeyPairGenerator` `"EC"` with `secp256r1`, `KeyAgreement` `"ECDH"`, `Cipher` `"AES/GCM/NoPadding"` with a 128-bit tag, and HKDF built from `Mac` `"HmacSHA256"`. There is no X25519 and no `HexFormat`. The shared secret is normalized to 32 bytes, because older Android and newer Java do not always return the same length. Phones below API 33 use the older `writeCharacteristic` call. API 33 and newer use the newer call.

On Android 11 and older (API 30 and below), including the Galaxy S8+ on Android 9, Bluetooth scan silently finds nobody when the system Location toggle is off. TableTrade checks that toggle before it scans. If Location is off, it does not scan, and it asks you to turn Location on. It does not read your GPS position. Android 12 and newer use a `neverForLocation` scan and skip that check. Bluetooth off is the same idea: a message and a button that asks the system to turn Bluetooth on, after the connect permission on Android 12 and newer.

## The old match radio

The unused MQTT match radio publishes the profile in the clear. A production build refuses every broker URL, so a release build cannot send that profile.

## Play Data safety

Suggested answer for “Is all of the user data collected by your app encrypted in transit?”: **Yes**.

Suggested note:

User data sent between phones over Bluetooth (display name, note, card ids, and user id) is encrypted in transit with AES-256-GCM. Each connection uses a fresh ECDH P-256 key. TableTrade does not fall back to plaintext. This does not claim the key exchange is authenticated against an active man-in-the-middle. Anyone running TableTrade nearby can read the profile, because that is the point of looking.
