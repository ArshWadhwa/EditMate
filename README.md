# EditMate

A browser-based photo editor that helps you recreate the look of an inspiration image.
Drop a reference photo and EditMate measures its light and colour, then **fits a recipe to
your photo**, instead of copying the reference's numbers. Every value stays editable.

**Features**

- **Adjust:** brightness, contrast, highlights, shadows, fade, warmth, tint, saturation, vibrance,
  vignette, grain, plus auto tone and auto white balance.
- **Inspire:** drop any reference photo and get a recipe fitted to your photo, with a match score
  and strength slider.
- **Crop & rotate:** free-form or locked ratios (including custom W:H), straighten dial, 90° turns,
  flip.
- **Cut out:** on-device AI background removal, then replace it with transparency, a colour, a
  photo or a blur.
- **Layers:** text (5 fonts, outline, shadow), shapes, and photos or logos, with move, resize,
  rotate, opacity and blend modes.
- **Presets:** 8 built-in looks, plus your own saved to MongoDB.
- **Export:** JPEG, PNG, WebP, AVIF or PDF, with quality and size options, always at full resolution.
- **Workflow:** before/after compare, histogram, unlimited undo/redo, keyboard shortcuts.
- **Any device:** phones, tablets and desktops (app-style layout with pinch-zoom below 1024 px).

Photos never leave the browser. The API only stores presets (names + slider values).

**Docs:** [ARCHITECTURE.md](ARCHITECTURE.md) explains how everything works, with code references,
design principles, a comparison with other editors and the stack rationale.
[GOOGLE_SIGN_IN.md](GOOGLE_SIGN_IN.md) is the proposal for optional Google sign-in.

---

## Getting started

### 1. Prerequisites

- **Node.js 20.19 or newer** (`node -v` to check). npm comes with it.
- A modern browser: Chrome, Edge, Firefox or Safari.
- *Optional:* a MongoDB database, only needed to **save your own presets**. Everything else works
  without it.

### 2. Install

```bash
cd editmate
npm install
```

This installs all three workspaces (`shared`, `server`, `client`) in one go.

### 3. Configure (optional)

```bash
cp server/.env.example server/.env
```

Then open `server/.env` and fill in `MONGODB_URI` if you have one (see
[Setting up MongoDB](#setting-up-mongodb)). You can leave it empty for now.

### 4. Run

```bash
npm run dev
```

This starts both servers:
- **Web app:** http://localhost:5173 (open this)
- **API:** http://localhost:4000

Drop a photo onto the page, or click **Choose a photo**.

### 5. Try saving presets without MongoDB (optional)

The API can run on a throwaway in-memory database, so you can test presets before setting up
MongoDB. Data is lost when it stops.

```bash
npm run dev:memory -w server   # terminal 1: API with in-memory MongoDB
```

```bash
npm run dev -w client          # terminal 2: web app
```

The first run downloads a MongoDB binary (about 100 MB, once).

---

## Setting up MongoDB

Presets are stored in MongoDB. The free tier of MongoDB Atlas is plenty.

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. **Database Access:** add a database user with a password.
3. **Network Access:** allow your IP (or `0.0.0.0/0` for testing only).
4. **Connect → Drivers:** copy the connection string, add a database name (`editmate`), and
   paste it into `server/.env`:

   ```bash
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/editmate
   ```

5. Restart `npm run dev`. The terminal prints `MongoDB connected`, and the **API** dot at the
   bottom of the left rail (desktop) turns green.

Using a local MongoDB instead? `MONGODB_URI=mongodb://localhost:27017/editmate`.

**How presets know they're yours** without a login: each browser gets an anonymous ID, and the
server only ever shows presets saved with that ID. Details and limits are in
[ARCHITECTURE.md §16.1](ARCHITECTURE.md#161-where-presets-are-saved-and-how-the-server-knows-theyre-yours).

---

## Configuration reference

### `server/.env`

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | API port. |
| `MONGODB_URI` | *empty* | Without it the API still runs and preset routes return `503`. |
| `CORS_ORIGIN` | `http://localhost:5173` | Origins allowed to call the API (comma-separated). Set to your site's URL in production. |

### `client/.env` (optional)

```bash
cp client/.env.example client/.env
```

| Variable | Default | Notes |
| --- | --- | --- |
| `VITE_API_URL` | *empty* | Leave empty in development (Vite forwards `/api` to `localhost:4000`). In production, set it when the API is on a different domain, e.g. `https://api.example.com` (without `/api`). |

There are no other keys or secrets. Background removal runs in the browser and needs no API key.

---

## Commands

Run from the `editmate/` folder.

| Command | What it does |
| --- | --- |
| `npm run dev` | API (auto-restarts on changes) + web app with hot reload |
| `npm run dev:memory -w server` | API only, on a temporary in-memory MongoDB |
| `npm run dev -w client` | Web app only |
| `npm test` | All tests: shared, API (real MongoDB in memory) and the image engine |
| `npm run build` | Production build of the web app into `client/dist` |
| `npm run preview -w client` | Serve the production build locally (also forwards `/api`) |
| `npm start -w server` | Run the API in production mode (no auto-restart) |

---

## Open it on your phone

Phone and computer must be on the same Wi-Fi.

```bash
npm run dev -w server            # terminal 1
```

```bash
npm run dev -w client -- --host  # terminal 2: also listens on your network
```

Vite prints a **Network** address such as `http://192.168.1.20:5173`. Open it on your phone. The
API is reached through the same address, so nothing else needs configuring.

> Phones only allow some features on HTTPS or `localhost`. Editing, export, layers and presets work
> over the network address. If background removal fails on the phone over plain HTTP, test it on a
> deployed (HTTPS) build.

---

## Deploying

EditMate is two pieces: a **static web app** (`client/dist`) and a **small Node API**.

1. **API** (e.g. Render, Railway, Fly.io or any Node host)
   - Root directory `editmate`, build command `npm install`, start command `npm start -w server`
   - Environment: `MONGODB_URI`, and `CORS_ORIGIN=https://your-app-domain`
2. **Web app** (e.g. Vercel, Netlify, Cloudflare Pages or any static host)
   - Build command `npm install && npm run build`, output directory `client/dist`
   - Environment: `VITE_API_URL=https://your-api-domain` (set **before** building; it's baked in)
3. Open the site. The rail's API dot should be green.

Serving both from one domain (with a reverse proxy sending `/api` to the Node server) also works;
then leave `VITE_API_URL` empty.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Presets say **"Set MONGODB_URI to save"** / yellow API dot | The API runs without a database. Add `MONGODB_URI` to `server/.env` and restart, or use `npm run dev:memory -w server`. |
| Presets say **"Start the API to save"** / red API dot | The API isn't running. Start it with `npm run dev` (or `npm run dev -w server`). |
| `MongoDB connection failed` in the terminal | Check the user/password in the URI and that your IP is allowed in Atlas → Network Access. |
| **Remove background** takes a while the first time | The AI model (about 40–80 MB) downloads once and is cached. Later runs take about 10 s on a laptop CPU. It needs internet the first time. |
| **AVIF** is greyed out in Export | This browser can't encode AVIF. Use WebP for small files with transparency. |
| JPEG/PDF export has a **white background** | Those formats can't store transparency. Use PNG or WebP. |
| `Port 5173 is in use` | Vite picks the next free port automatically; use the URL it prints. For the API, set another `PORT` in `server/.env` (and update `CORS_ORIGIN` if needed). |
| `npm install` fails with `Cannot read properties of null (reading 'edgesOut')` | A known npm 10 bug with Vite 8's optional peers. This project pins Vite 7 to avoid it, so don't upgrade Vite without checking. |
| Tests fail with an unsupported Node version | Use Node 20.19+ (`node -v`). |

---

## Project structure

```
editmate/
├─ shared/            slider definitions (ranges, defaults), used by client and server
├─ server/            Express 5 + Mongoose presets API, zod validation
│  ├─ src/            routes → middleware → controllers → services → models
│  ├─ scripts/        dev-memory.js (API on an in-memory MongoDB)
│  └─ test/
├─ client/            React 19 + Vite 7 + Tailwind 4
│  ├─ src/engine/     pure image code: pipeline, geometry, analysis, crop and layer math,
│  │                  compositing, segmentation adapter, PDF writer, render worker
│  ├─ src/state/      edit document, undo history, EditorProvider, assets, subject mask
│  ├─ src/features/   viewport, adjust, crop, background, layers, export, inspire,
│  │                  presets, controls, rail (desktop + mobile)
│  └─ test/
├─ design/            the original static design mockup
├─ ARCHITECTURE.md    how it all works, with code references
└─ GOOGLE_SIGN_IN.md  proposal for optional accounts
```

## API

All preset routes need an `X-Client-Id` header (the anonymous per-browser ID; the web app sends
it automatically).

| Method | Path | Body |
| --- | --- | --- |
| `GET` | `/api/health` | n/a |
| `GET` | `/api/presets` | n/a |
| `POST` | `/api/presets` | `{ name, adjustments, swatch?, source? }` |
| `PATCH` | `/api/presets/:id` | any of `name`, `adjustments`, `swatch` |
| `DELETE` | `/api/presets/:id` | n/a |

Preset names are unique per browser (case-insensitive); duplicates return `409`.

## Keyboard shortcuts

Press `?` in the app for the full list.

| Keys | Action |
| --- | --- |
| `⌘O` / `⌘E` | Open a photo / export (last used format) |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `A` `R` `B` `L` | Adjust, crop, background, layers |
| `T` | Add a text layer |
| hold `\` · `C` · `G` | Show the original · compare · grid |
| `↑` `↓` / `←` `→` | Pick an adjustment / nudge it (⇧ ×10) |
| `⌫` · `⌘D` · arrows | Delete · duplicate · nudge the selected layer |
| `↵` / `Esc` · `X` | Apply / cancel crop · swap crop orientation |

On Windows and Linux, use `Ctrl` instead of `⌘`.

## Licence note

Background removal uses [`@imgly/background-removal`](https://github.com/imgly/background-removal-js),
which is **AGPL-3.0**. That's fine for personal and open-source use; a closed commercial release needs
img.ly's commercial licence or a different provider. The integration is isolated in
`client/src/engine/segment.js`, so swapping it is a one-file change.

## Roadmap

- Optional Google sign-in to sync presets across devices ([proposal](GOOGLE_SIGN_IN.md))
- Tone curves, HSL mixer, local masks
- Batch editing, shareable look links
- Video: trimming, transitions, captions
