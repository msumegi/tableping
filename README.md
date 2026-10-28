# TableTrade

Pokémon Trading Card Game have-lists, want-lists, and **close-by trade pings**.

If you and someone else close by are both using TableTrade, you get a ping when:

- they want a card you have, or
- they have a card you want, or
- both.

Two people **tap I’m looking**. Matches close by ping, with a name, photo, and an optional I’m over here line so you can find them in the room. There is no shop list, no table code, no QR join, and no meetup scheduler.

Pokémon only. No Magic. No One Piece.

Built for **Matthew** to try on an Android phone.

Share **TableTrade**: **[tableping/welcome](https://msumegi.github.io/tableping/welcome/)** — *Trade here, now.* Static marketing page. The live app stays at the site root (`/tableping/`).

---

## Install on two Android phones

Close-by needs the **Android app** and **Bluetooth on both phones**. Website and iPhone: demo ping only. On the public site, I’m looking stays off. The demo is a local dev build: `npm run dev`, then **See a demo ping now**.

The install file is `tabletrade.apk`. Download the **tabletrade-apk** artifact from the **Sideload APK** workflow. It is signed so a normal phone can install it once unknown apps are allowed.

### 1. Download the APK

1. Sign in to GitHub
2. Open **Actions** → **[Sideload APK](https://github.com/msumegi/tableping/actions/workflows/apk.yml)**
3. Open the latest green run (a branch run is enough before merge; `main` after)
4. Download the **tabletrade-apk** artifact
5. Unzip it. You get `tabletrade.apk`

### 2. Allow unknown apps and install

On each phone:

1. Copy `tabletrade.apk` onto the phone (USB, Drive, or a file share)
2. Settings → Apps → special app access → **Install unknown apps**
3. Allow it for the app that opens the file (Files, Chrome, or Drive)
4. Tap `tabletrade.apk` → **Install**
5. Open **TableTrade**

Do that on both phones. A later Play Store install needs this copy removed first. The signatures differ.

### 3. Playtest the ping

1. Turn **Bluetooth** on on both phones
2. **You** → set a display name. A photo helps
3. Add have and want cards that overlap
4. Both open **Nearby** and tap **I’m looking**
5. Allow Bluetooth when the phone asks. On Android 11 and older it may ask for location too. That permission is only so the phone can scan Bluetooth
6. Optional: type **I’m over here** (red hoodie, back table)
7. Keep the app open, in the same room. If the lists overlap, both phones fire
8. Find them by name, photo, and that line. Then you talk
9. Tap **Done looking** when you walk out

Alone, with no second phone: on a computer, `npm run dev`, then **See a demo ping now**. **Kai (demo)** shows up, with a card you can give and a card you can get.

**Scan a stack of cards:** Have or Want → **Add a Pokémon card** → **Scan cards**. The camera stays open. Point at **one** card, confirm the match, flip to the next. Tap **Done** when you are finished. If the read is unsure, pick from a short list or type the name without leaving the loop. If the camera is blocked, TableTrade says so and search still works.

Binder-page photos are not in this version (sleeves and glare make a whole page unreliable). Search-to-add is still there: typing `pik` still shows Pikachu, and `umbreon evolving skies` matches the set too.

---

## Website and iPhone

Same screens. Demo ping only (`npm run dev` on a computer). I’m looking stays off here, so use the APK when you want a real ping.

**https://msumegi.github.io/tableping/**

**https://msumegi.github.io/tableping/welcome/**

Home screen, if you want the site as an icon:

- **Android Chrome:** three dots → **Add to Home screen** or **Install app**
- **iPhone Safari:** Share → **Add to Home Screen**

If the link 404s, turn on GitHub Pages once:

1. On a computer, open the repo: https://github.com/msumegi/tableping
2. **Settings** → **Pages**
3. Under **Build and deployment**, set **Source** to **GitHub Actions**
4. If the first deploy has not run yet, open the **Actions** tab and wait for **Deploy GitHub Pages** to finish (or tap **Run workflow**)
5. Reload https://msumegi.github.io/tableping/

---

## What it is

- Pokémon trades, in the room, right now
- A ping when the lists overlap and both phones are looking
- A name, a photo, and an optional I’m over here line
- Lists stay on the phone. Match, then talk

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
- On an Android phone on the **same Wi‑Fi**: open `http://YOUR-COMPUTER-LAN-IP:5173` in Chrome. Chrome may warn that the connection is not HTTPS; for a home test that’s expected. The camera is more reliable on the GitHub Pages HTTPS site. Close-by still needs the Android app on both phones.

Production build:

```bash
npm run build
npm run preview
```

---

## How v1 is built

| Piece | Choice | Why |
| --- | --- | --- |
| App | React + Vite, Android app via Capacitor, plus the website PWA | Sideload the APK to playtest. The site needs no store install |
| Cards | [Pokémon TCG API](https://docs.pokemontcg.io) (no key, CORS enabled) plus a local list of popular names | Type a name or a name+set (`umbreon evolving skies`); no secrets in the repo |
| Card scan | One-card camera loop + on-device OCR, then the same catalog search | Log 20–200 cards without retyping names; confirm before add |
| Lists | `localStorage` on the device | No account |
| Demo ping | Local complementary trainer named Kai | One tester can see a ping. Dev build only |
| Close-by check-in | Bluetooth, native Android plugin only | Both phones run the app, Bluetooth on, and tap I’m looking. Website and iPhone do not |

While you are looking, your name and card ids go phone to phone over Bluetooth. Tap **Done looking** when you walk out.

---

## Privacy / no secrets

- Do not put API keys in this repo. v1 does not need any.
- Optional later: a Pokémon TCG API key would belong in an environment variable, never in git.
- Card images load from `images.pokemontcg.io`. If the live catalog is down, search still returns a local set of well-known cards instead of a browser fetch error.

---

## License

Personal project. Pokémon and Pokémon card art belong to their owners. TableTrade is an unofficial fan tool.
