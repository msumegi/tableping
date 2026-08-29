# TablePing

Pokémon Trading Card Game have-lists, want-lists, and **in-the-room trade pings**.

If you and someone else at the same card shop are both using TablePing, you get a ping when:

- they want a card you have, or
- they have a card you want, or
- both.

This is **not** a city-wide dating-radius app. v1 looks about a **shop / room** away (~120 meters) or at people who share a **table code / QR** at the same table. There is no meetup scheduler.

Pokémon only. No Magic. No One Piece.

Built for **Matthew** to try on an Android phone.

Share the product: **[tableping/welcome](https://msumegi.github.io/tableping/welcome/)** — *Trade here, now.* Static marketing page. The live PWA stays at the site root.

---

## Try it on Android (no developer tools)

TablePing is a small phone website you can install like an app (a PWA). Use **Chrome** on Android.

### 1. Open it

After this repo is on GitHub and Pages is on, open:

**https://msumegi.github.io/tableping/**

Marketing / landing page (share this with shops and friends):

**https://msumegi.github.io/tableping/welcome/**

If that link 404s, turn on GitHub Pages once (takes about a minute):

1. On a computer, open the repo: https://github.com/msumegi/tableping
2. **Settings** → **Pages**
3. Under **Build and deployment**, set **Source** to **GitHub Actions**
4. If the first deploy has not run yet, open the **Actions** tab and wait for **Deploy GitHub Pages** to finish (or tap **Run workflow**)
5. Reload https://msumegi.github.io/tableping/ on the phone

### 2. Put it on the home screen

1. Open the link in **Chrome** (not Instagram in-app browser, not Samsung Internet if install is greyed out)
2. Tap the **three dots** (top right)
3. Tap **Add to Home screen** or **Install app**
4. Tap **Install** / **Add**
5. Open **TablePing** from the home screen like any other app

### 3. Tap through the first session

1. Open **You** and set your display name
2. Open **Have** → **Add a Pokémon card** → scan a card or search `Pikachu` → confirm a printing
3. Open **Want** → scan or search `Charizard` → confirm a printing
4. Open **Nearby** → tap **Try a demo ping**
5. You should see a full-screen ping that **Kai (demo)** is at your table, with a card you can give and a card you can get

That’s the whole v1 loop: lists, add a card (type or scan), nearby/demo ping.

**Scan a stack of cards:** Have or Want → **Add a Pokémon card** → **Scan cards**. The camera stays open. Point at **one** card, confirm the match, flip to the next. Tap **Done** when you are finished. If the read is unsure, pick from a short list or type the name without leaving the loop. If the camera is blocked, TablePing says so and search still works.

Binder-page photos are not in this version (sleeves and glare make a whole page unreliable). Search-to-add is still there: typing `pik` still shows Pikachu, and `umbreon evolving skies` matches the set too.

Camera is also used to scan another TablePing user’s table QR.

---

## Two people at the same shop

Do this when you are actually standing at the same table. City-wide matching is out of scope.

**Easiest indoors (GPS is often wrong inside shops):**

1. Both people add have/want cards
2. One person taps **Nearby** → **Show my QR**
3. The other taps **Scan their QR** and points at the first phone
4. If the lists overlap, both can get a ping (the scanner sees it immediately)

**Table code:** one person turns **Share a table code** on and reads the four characters. The other types it under **Join table code**.

**Shop-scale GPS:** both turn **I’m at the shop** on and accept location. TablePing uses ~76 m cells and ignores anything farther than ~120 m. It will **not** match someone across town.

If you are testing alone, you do not need a second phone: use **Try a demo ping**.

---

## What this is not (on purpose)

- Not Utopia Market
- Not Magic, One Piece, or a multi-game marketplace
- Not a ~25 mile radius
- Not a meetup / calendar product
- No accounts, no passwords, no API keys required

---

## For someone running it on a computer

Need Node.js 20+.

```bash
npm install
npm test
npm run dev
```

Then:

- On the same computer: open the URL Vite prints (usually http://localhost:5173)
- On an Android phone on the **same Wi‑Fi**: open `http://YOUR-COMPUTER-LAN-IP:5173` in Chrome. Chrome may warn that the connection is not HTTPS; for a home test that’s expected. Location and camera are more reliable on the GitHub Pages HTTPS site.

Production build:

```bash
npm run build
npm run preview
```

---

## How v1 is built

| Piece | Choice | Why |
| --- | --- | --- |
| App | React + Vite **PWA** | Installable from Chrome on Android without the Play Store or Expo build machines |
| Cards | [Pokémon TCG API](https://docs.pokemontcg.io) (no key, CORS enabled) plus a local list of popular names | Type a name or a name+set (`umbreon evolving skies`); no secrets in the repo |
| Card scan | One-card camera loop + on-device OCR, then the same catalog search | Log 20–200 cards without retyping names; confirm before add |
| Lists | `localStorage` on the device | No account |
| Demo ping | Local complementary trainer named Kai | One tester can see a ping |
| Same-table QR | QR encodes have/want | Works in a shop even when GPS is junk |
| Live nearby | Shop-scale [geohash](https://en.wikipedia.org/wiki/Geohash) + optional table code over a public MQTT demo broker | Automatic ping when two phones are actually close |

Live nearby uses HiveMQ’s **public** MQTT broker as a v1 convenience so there is no server to host and **no secrets to commit**. Treat it as a demo radio, not a private backend. Names and card ids of people who tap “I’m at the shop” can be seen on that channel. Turn it off when you leave the table. QR exchange does not use the broker.

---

## Privacy / no secrets

- Do not put API keys in this repo. v1 does not need any.
- Optional later: a Pokémon TCG API key would belong in an environment variable, never in git.
- Card images load from `images.pokemontcg.io`. If the live catalog is down, search still returns a local set of well-known cards instead of a browser fetch error.

---

## License

Personal project. Pokémon and Pokémon card art belong to their owners. TablePing is an unofficial fan tool.
