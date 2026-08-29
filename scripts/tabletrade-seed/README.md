# TableTrade

Marketing site for **TableTrade** — *Trade here, now.*

A product of **Central Alberta Technologies**. Lead Developer **Matt Sumegi**.

This repo is the public marketing site only. It is **not** the web app.

| Page | Path |
| --- | --- |
| Home | `/` |
| About | `/about/` |

The About page uses `media/matt-sumegi.jpg` (Matt’s smiling headshot). Drop the real portrait there — do not generate a stand-in.

| | URL |
| --- | --- |
| **Marketing site (this repo)** | https://msumegi.github.io/tabletrade/ |
| **App PWA (separate repo)** | https://msumegi.github.io/tableping/ |

Pokémon and Pokémon card art belong to their owners. TableTrade is an unofficial fan tool.

## GitHub Pages

Static files live at the repo root (`index.html`). After the first push:

1. Repo **Settings → Pages**
2. **Build and deployment → Source:** GitHub Actions  
   (or **Deploy from a branch** → `main` → `/ (root)` if you prefer the simpler branch publish)
3. Wait for **Deploy GitHub Pages** to finish
4. Open https://msumegi.github.io/tabletrade/

The address bar should say **tabletrade**, not tableping. Dropping a path segment cannot land on the app.
