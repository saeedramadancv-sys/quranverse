# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this is

**QuranVerse** is a front-end web app for **transcribing and verifying Quranic
verses** with accurate right-to-left (RTL) Arabic rendering. A user picks a
surah/ayah, types or **dictates** a transcription, and the app scores it against
the reference text word-by-word (match / substitution / missing / extra) and
reports a Word Accuracy %. It is a University of Jordan graduation project.

The same `www/` folder is served three ways:
- as a plain website (`server.js` / GitHub Pages),
- as an installable **PWA** (manifest + service worker, offline-capable),
- wrapped as a native **Android app** via **Capacitor** (the `android/` project).

## Golden rules

- **No build step, no framework, no bundler.** Plain HTML/CSS/vanilla JS. Do not
  introduce React, TypeScript, a bundler, or npm runtime dependencies for the web
  app. The npm dependencies exist only for Capacitor/Android tooling.
- **`www/` is the single source of truth** for the app. The Android project and
  Pages deploy both come *from* `www/`. Never hand-edit generated web assets under
  `android/app/src/main/assets/` — edit `www/` and re-sync (`npx cap sync`).
- **Arabic-first & RTL.** `index.html` is `lang="ar" dir="rtl"`. UI copy is in
  Arabic. Preserve RTL correctness and the Quran-grade typeface (Amiri Quran) in
  any layout change.
- **Graceful degradation everywhere.** Every optional capability (backend, speech,
  mic, recitation audio, service worker) must fail into a message or a fallback —
  never a broken control. Manual typing must always work offline.

## Architecture

Each JS module is an **IIFE** that attaches a single global to `window`; there is
no module system. **Load order matters** and is fixed in `index.html` — a module
may only use globals defined by scripts loaded before it:

```
data.js → config.js → verify.js → api.js → recite.js → speech.js → recorder.js → stats.js → app.js
```

| File (`www/js/`) | Global      | Responsibility |
|------------------|-------------|----------------|
| `config.js`      | `APP_CONFIG`, `saveConfig()` | Runtime config: backend URL, `USE_BACKEND`, `PASS_THRESHOLD` (90), timeouts, reciter. Overridable at runtime from Settings, persisted to `localStorage` (`qv.*` keys). |
| `data.js`        | `QURAN_DATA` | Offline sample Quran dataset (Uthmani script, Tanzil.net). Fallback when the backend is unreachable. |
| `verify.js`      | `Verify`    | Arabic-aware verification engine: `normalizeWord`, `tokenize`, `align`, `verifyLocal`. Word-level Levenshtein alignment; diacritic/tatweel-insensitive; unifies alef/ya/ta-marbuta variants. |
| `api.js`         | `Api`       | REST layer over the partner backend with graceful fallback to `QURAN_DATA` / `verifyLocal`. Tracks `Api.lastSource` (`backend`/`local`) for the UI badge. `fetch` with an `AbortController` timeout. |
| `recite.js`      | `Recite`    | Streams reference recitation audio from a public per-ayah CDN (`everyayah.com`); URL derived from zero-padded surah/ayah. Network-only, degrades to a message. |
| `speech.js`      | `Speech`    | Arabic speech-to-text with two auto-selected backends: browser **Web Speech API** (`ar-SA`) on the web, and the native `@capacitor-community/speech-recognition` plugin inside the Android app (WebView has no Web Speech API). Both expose the same callback surface. |
| `recorder.js`    | `Recorder`  | Mic capture via `MediaRecorder` → decodes and re-encodes to a 16-bit PCM mono **WAV** Blob for playback/download. |
| `stats.js`       | `Stats`     | Local history + aggregate stats in `localStorage` (key `qv.history`, capped at 200). Audio blobs are **not** stored — only a `hasAudio` flag. CSV/JSON export. |
| `app.js`         | (controller)| UI controller. Caches DOM refs, wires events, drives init on `DOMContentLoaded`. Depends on all of the above. |

`css/styles.css` is RTL-first responsive styling with light/dark support (no CSS
framework). `index.html` holds all markup plus an inline bootstrap script that
stamps the version tag and registers the service worker last (so a SW failure can
never block the app).

### Data source & the backend contract

The app prefers the partner's REST backend when `USE_BACKEND` is true, and falls
back to local data/verification on any failure — so integration can proceed
incrementally. Expected contract (adjust `api.js` to match the real backend):

| Method | Endpoint            | Purpose |
|--------|---------------------|---------|
| GET    | `/surahs`           | List surahs |
| GET    | `/surahs/{n}/ayahs` | List ayahs of a surah |
| POST   | `/verify`           | Verify a transcription server-side |
| POST   | `/transcriptions`   | Store a verified transcription |

If the backend omits `accuracy`/`ops`, the app computes them locally via `Verify`.

## Development workflows

Run from the repo root (`package.json` scripts):

```bash
node server.js        # or: npm run serve — zero-dep static server for www/ on http://localhost:8123/
npm run sync          # cap sync — copy www/ into the Android project + update native deps
npm run open:android  # cap open android — open the Android project in Android Studio
npm run build:apk     # cd android && gradlew.bat assembleDebug (Windows)
```

Serve over HTTP, not `file://` — module scripts, fonts, and speech features need a
real origin (and speech needs a secure context: `https://` or `localhost`).
Windows helpers: `start.bat` (serve + open browser), `sync-app.bat` (`cap sync`).

**Android/APK:** the project is fully scaffolded but the `.apk` must be built with
Android Studio (needs the Android SDK + a JDK 17/21 — not newer). Full guide in
[`BUILD_ANDROID.md`](BUILD_ANDROID.md) (written in Arabic). App id
`jo.edu.ju.quranverse`; native code is a single `MainActivity extends BridgeActivity`.
On device, point the backend URL at the partner server's LAN IP, not `localhost`.

There is **no test suite, linter, or formatter** configured. The two Java files
under `android/app/src/*/java/com/getcapacitor/myapp/` are Capacitor scaffolding
examples, not real tests.

## Deploying

Pushing to `main` triggers `.github/workflows/pages.yml`, which publishes `www/`
to **GitHub Pages** (live at https://saeedramadancv-sys.github.io/quranverse/).

The service worker (`www/sw.js`) is **network-first with a cache fallback**, so a
deploy wins on a healthy connection without needing a version bump. Still: **when
you add or rename a file under `www/`, update the `CORE_ASSETS` list in `sw.js`**,
and bump `CACHE_VERSION` when you want old caches purged on activation.

## Conventions to follow

- Keep new browser modules in the IIFE-attaches-one-global style, and add them to
  **both** the `index.html` script order **and** `sw.js` `CORE_ASSETS`.
- Bump `APP_CONFIG.APP_VERSION` in `config.js` for a user-visible release (it shows
  in the footer).
- Persisted state uses `qv.`-prefixed `localStorage` keys (`qv.apiBaseUrl`,
  `qv.useBackend`, `qv.history`). Follow that prefix for new keys.
- Match the existing file-header comment style (a `/** … */` block explaining the
  module's role) and the surrounding code's naming and density.
- Arabic normalization/verification logic lives in `verify.js` only — reuse
  `Verify.normalizeWord`/`tokenize` rather than re-implementing text handling.

## Git & branching

Default branch is `main`. Commit with clear, descriptive messages; do not open a
pull request unless explicitly asked. When asked to push, use
`git push -u origin <branch>`.
