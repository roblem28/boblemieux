# Performance Review
_Method: static analysis of the existing production build (`.next/`, build id `uwoenwXtJfN17TPXZoO7v`) + `curl` against the local prod server on :4321. **No real Lighthouse run** — every "LCP/CLS/TBT" figure below is a static estimate derived from measured bytes and the render path, not a lab measurement. Transfer sizes are gzip (`Accept-Encoding: gzip`) unless marked "raw". Image bytes are raw — JPEG does not recompress._

---

## Headline

The site ships **zero server-rendered markup**. `src/pages/_app.js:29` gates the whole app behind a `useEffect` mount flag, so every one of the 33 pre-rendered HTML files contains `<div id="__next"></div>` followed by an inert JSON blob. The homepage is 83,247 raw bytes of which **81,393 (97.8%) is `__NEXT_DATA__`** and **0 bytes are rendered DOM**. Everything downstream — LCP, image discovery, dynamic-chunk discovery, CLS — inherits that.

The reported 128.7 s static-generation time is **not** a content-layer problem. Measured directly: `getStaticPaths()` = 47 ms, all 27 `getStaticProps()` calls = **189 ms total** (7 ms/page), and all 33 output HTML files were written within a **0.362 s window**. See P2 below for the real cause.

---

## Bundle breakdown

### Entry / shared (loaded on every Next route)

| Chunk | Raw bytes | Gzip (measured over HTTP) | Attributed to |
|---|---:|---:|---|
| `chunks/framework-b9fffb5537caa07c.js` | 182,717 | 57,829 | react + react-dom 19 |
| `chunks/main-20b1642ae7cdde7d.js` | 121,500 | 35,131 | Next.js 15.5 client runtime |
| `css/4b33ce3e55d8ddf1.css` | 121,665 | 18,448 | Tailwind v4 **+ maplibre-gl.css** (see below) |
| `chunks/pages/_app-0af999a550d3672f.js` | 12,036 | 4,325 | `_app.js` + styled-jsx |
| `chunks/webpack-94e0818eaddbcb2f.js` | 5,773 | 2,924 | webpack runtime |
| `chunks/pages/[[...slug]]-*.js` | 10,174 | 3,244 | catch-all page + registry |
| **Modern-browser subtotal** | **453,865** | **121,901** | |
| `chunks/polyfills-42372ed130431b0a.js` | 112,594 | 39,627 | `nomodule` — legacy browsers only, not on the modern path |

### Lazy chunks

| Chunk | Raw bytes | Gzip | Attributed to | Loaded by |
|---|---:|---:|---|---|
| `chunks/5e1d2776.ce06ecad9358a094.js` | 785,545 | 208,013 | **maplibre-gl 4.7.1** (130 `maplibre` string hits) | `WeatherMap` only — **correctly code-split** |
| `chunks/4611.21528f35156c0db5.js` | 227,960 | 48,022 | **react-syntax-highlighter Prism themes** — 70 webpack modules, 350 `code[class*="language-"]` selectors, i.e. ~70 full colour themes | `PostLayout` **and** `ProjectLayout` — i.e. all 7 blog posts + all 11 project pages |
| `chunks/3603-d3be82761614071b.js` | 21,565 | 7,026 | markdown-to-jsx + refractor core | PostLayout / ProjectLayout / project routes |
| `chunks/4573.b4d30adbab2d63e8.js` | 18,847 | 7,127 | WeatherMap component + deps | `/projects/weather` |
| `chunks/9256-8b39bf7fd527fc11.js` | 19,835 | — | weather route shared | `/projects/weather` |
| `css/e393a1ce6c03d7ce.css` | 6,042 | 1,561 | `WeatherMap.module.css` | `/projects/weather` |

**Verdict on the two suspects:**

- `maplibre-gl` **JS is correctly split** (785 KB raw sits in an async chunk reached only via `next/dynamic` in `src/pages/projects/weather.tsx:8`). Good.
- `maplibre-gl` **CSS is not.** `src/pages/_app.js:7` imports it globally, putting **64,602 of the 121,665 raw bytes (53%)** of the site-wide render-blocking stylesheet into every page. Measured by stripping the 136 `.maplibregl-*` rule blocks and re-compressing: 18,336 → 9,258 gz (**−9,078 gz, −64,602 raw**); brotli 15,147 → 8,006.
- `react-syntax-highlighter` **is** imported via `PrismLight` and registers only 2 grammars — that part is right. But `src/utils/highlighted-markdown.tsx:5` does `import { funky } from 'react-syntax-highlighter/dist/cjs/styles/prism'`, which pulls the **entire theme barrel**: 70 modules, 227,960 raw / 48,022 gz, of which only `funky` (~3 KB) is used.

---

## Image inventory

`public/` total: **2,523,730 bytes**. `public/images/` alone: **2,086,484 bytes across 18 files**. There is **not a single `.webp` or `.avif` anywhere in the repo**, and **`next/image` is used zero times** (`grep -rn "next/image" src/` → no hits).

| File | Bytes | Format | Dimensions | bytes/px | Issue |
|---|---:|---|---|---:|---|
| `public/images/marley1.jpg` | 293,084 | JPEG baseline | 1320×1378 | 0.161 | Baseline (not progressive), no WebP/AVIF. Rendered as a feed/gallery thumb. |
| `public/images/bp-whiting.jpg` | 291,647 | JPEG baseline | 1118×692 | **0.377** | Worst density on the site — ~4× over-quality for a photo. |
| `public/images/bob.jpg` | 291,209 | JPEG baseline | 800×1200 | 0.303 | Site avatar / `socialImage`; appears on `/`, `/info`, `/work`, and every project route. Over-quality. |
| `public/images/moontwin.jpg` | 261,094 | JPEG baseline | 1248×735 | 0.285 | Over-quality. |
| `public/images/earthtwin.jpg` | 215,365 | JPEG baseline | 1448×725 | 0.205 | Over-quality. |
| `public/images/harvard-nw.jpg` | 125,106 | JPEG baseline | 1400×798 | 0.112 | OK density, oversized for card display. |
| `public/images/bg3.jpg` | 106,691 | JPEG progressive | 1517×1409 | 0.050 | Full-viewport `background-image`; **eager, above-the-fold, LCP candidate**. |
| `public/images/exotwin.jpg` | 103,253 | JPEG baseline | 1378×818 | 0.092 | |
| `public/images/cpchem-cedar-bayou.jpg` | 71,734 | JPEG baseline | 801×447 | 0.200 | Over-quality for its size. |
| `public/images/integra.jpg` | 67,780 | JPEG baseline | 697×593 | 0.164 | Over-quality. |
| `public/images/bg2.jpg` | 66,333 | JPEG progressive | 1517×1409 | 0.031 | Background; eager. |
| `public/images/about.jpg` | 41,801 | JPEG progressive | 620×930 | 0.072 | |
| `public/images/bg1.jpg` | 39,616 | JPEG progressive | 1518×1409 | 0.019 | `DEFAULT_BACKGROUND` in `BaseLayout:12` — loads on every page with no `backgroundImage` set. |
| `public/images/gallery-2.jpg` | 37,865 | JPEG progressive | 640×427 | 0.139 | |
| `public/images/gallery-3.jpg` | 29,005 | JPEG progressive | 640×426 | 0.106 | |
| `public/images/gallery-1.jpg` | 26,055 | JPEG progressive | 640×427 | 0.095 | |
| `public/images/gallery-4.jpg` | 18,351 | JPEG progressive | 640×426 | 0.067 | |
| `public/images/favicon.svg` | 495 | SVG | — | — | Fine. |

Cross-cutting image issues:

- **No WebP/AVIF variants, no `srcset`, no `sizes`.** A 1320×1378 JPEG is served byte-for-byte to a 320 px-wide phone slot.
- **No intrinsic dimensions.** `src/components/molecules/ImageBlock/index.tsx:11` renders `<img … src={url} alt={altText} loading="lazy" decoding="async" />` — `loading` and `decoding` **are** set (good), but there is **no `width`/`height` and no `aspect-ratio`**, so every image is a CLS source until it decodes.
- `src/components/atoms/BackgroundImage/index.tsx:22` uses an inline `style={{ backgroundImage: url(...) }}` on a `fixed inset-0` div. CSS backgrounds are **invisible to the browser preload scanner**, and because `_app` renders nothing server-side the URL only exists inside `__NEXT_DATA__` — so the largest above-the-fold paint starts downloading only after hydration.

---

## Route weight ranking

Gzip for HTML/JS/CSS, raw for images. "Post-hydration" = chunks discovered only after React mounts, because nothing SSRs. Polyfills (39,627 gz, `nomodule`) excluded.

| Rank | Route | HTML | JS (entry) | CSS | Post-hydration JS | Images | **Total** | Est. LCP risk |
|---:|---|---:|---:|---:|---:|---:|---:|---|
| 1 | `/` | 14,393 | 103,453 | 18,448 | — | 1,379,325 | **1,515,619** | **Severe** |
| 2 | `/tech-projects/` | 4,431 | 103,453 | 18,448 | — | 1,377,140 | **1,503,472** | **Severe** |
| 3 | `/info/` | 7,691 | 103,453 | 18,448 | — | 954,662 | **1,084,254** | High |
| 4 | `/work/` | 5,699 | 103,453 | 18,448 | — | 954,662 | **1,082,262** | High |
| 5 | `/projects/spending/` | 1,594 | 103,453 | 18,448 | **546,616** (iframe CDN) | 331,320 | **1,001,431** | **Severe** |
| 6 | `/projects/fec/` | 1,592 | 103,453 | 18,448 | **324,400** (iframe CDN) | 331,320 | **779,213** | High |
| 7 | `/work/integra/` | 3,539 | 103,453 | 18,448 | 61,687 | 591,281 | **778,408** | High |
| 8 | `/projects/` | 3,797 | 103,453 | 18,448 | — | 584,788 | **710,486** | High |
| 9 | `/projects/weather/` | 1,616 | 121,994 | 20,009 | 215,140 (maplibre) | 331,320 | **690,079** | High |
| 10 | `/blog/` | 13,921 | 103,453 | 18,448 | 61,311 | 333,505 | **530,638** | Medium |
| 11 | `/blog/post-two/` | 7,875 | 103,453 | 18,448 | 61,311 | 333,505 | **524,592** | Medium |

Third-party bytes pulled by the iframed static apps (measured live against the CDNs):

| URL | Raw | Gzip |
|---|---:|---:|
| `cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js` | 881,727 | **316,241** |
| `unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js` | 803,086 | 211,132 |
| `cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` | 603,445 | 149,872 |
| `unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css` | 65,534 | 9,239 |
| `cdn.jsdelivr.net/npm/topojson-client@3` | 7,169 | 2,587 |

---

## Render-blocking audit (`curl -s http://localhost:4321/`)

`<head>` contains, in order:

1. `<link rel="preload" as="style" href="/_next/static/css/4b33ce3e55d8ddf1.css">` then `<link rel="stylesheet" …>` — **one render-blocking stylesheet, 121,665 raw / 18,448 gz**, 53% of it maplibre.
2. `<script defer nomodule src=polyfills>`, then five `defer` scripts (webpack, framework, main, `_app`, `[[...slug]]`) plus `_buildManifest` / `_ssgManifest`. **No synchronous scripts** — that part is clean.
3. An inline `<style id="__jsx-…">` with the theme CSS variables. Fine.
4. **No `<link rel="preconnect">`, no `<link rel="preload">` for fonts, no image preload.**

The font strategy is the worst part of the head:

`src/css/main.css:1` is `@import url('https://fonts.googleapis.com/css2?family=Azeret+Mono:…&family=DM+Mono:…&display=swap') layer(base);` — and Tailwind v4 **preserves it verbatim as the first statement of the compiled bundle** (`head -c 400` of `4b33ce3e55d8ddf1.css` confirms it). That creates a four-hop critical chain across three origins with zero connection warm-up:

```
HTML → /_next/static/css/*.css (18,448 gz) → fonts.googleapis.com/css2 (new TLS conn)
     → fonts.gstatic.com/*.woff2 × 8 faces (new TLS conn)
```

`display=swap` is set (good — no FOIT), but 2 families × 4 variants each = **8 woff2 files** for a site whose theme only ever selects one family (`content/data/style.json:13` = `"DM Mono"`). Half the font payload is for `Azeret Mono`, which is unreachable without a theme edit.

Third-party origins on Next routes: none beyond Google Fonts. Third-party origins inside the iframed static apps: `unpkg.com`, `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`.

---

## Static asset pages (outside the Next pipeline)

| File | Raw | Gzip | Inline JS | Inline CSS | External |
|---|---:|---:|---:|---:|---|
| `public/games/voxelcraft/index.html` | 263,309 | 87,855 | 222,894 | 35,365 | none |
| `public/comics/gas-station-gummies.html` | 51,973 | 12,079 | 7,320 | 10,487 | Google Fonts (Bangers + Comic Neue, **has** preconnect) |
| `public/widgets/mindmap-3d.html` | 26,514 | 8,136 | 24,812 | 1,046 | **three.js r128 from cdnjs, 603,445 raw / 149,872 gz, sync `<script>`** |
| `public/games/cheeseburgler.html` | 13,834 | 4,633 | 9,553 | 2,960 | Google Fonts (no preconnect) |
| `public/projects/fec/index.html` | 17,640 | 3,141 | 0 | 0 | `xlsx.full.min.js` (881,727 raw), `./app.js` 22,157, `./style.css` 5,444 |
| `public/projects/spending/index.html` | 4,246 | 1,594 | 0 | 0 | maplibre js+css, `topojson-client@3`, `xlsx.full.min.js`, `./app.js` 21,025, `./style.css` 4,376 |
| `public/wire/index.html` | 6,310 | 2,991 | 0 | 1,005 | 12 outbound links only — clean, no JS |

Notes:

- `voxelcraft/index.html` is 222,894 bytes of **unminified inline JS** (5,995 lines, mean line length 44 chars — source formatting intact). No base64 blobs. Gzip handles transfer well (87,855), so the real cost is parse/compile time.
- `mindmap-3d.html:32` loads three.js r128 with a **plain synchronous `<script>`** — 149,872 gz blocks the parser before the 24,812-byte inline scene script at line 33 can run. r128 is ~5 years old.
- `fec/index.html:290` and `spending/index.html:102` both load **`xlsx.full.min.js` (316,241 gz) eagerly on page load**, but `XLSX` is only referenced inside export handlers (`fec/app.js:504–516`, `spending/app.js:474`).
- `spending/index.html` loads **maplibre-gl 4.7.1 from unpkg (211,132 gz)** while the Next app already bundles the identical version at 208,013 gz. Two copies of one library on one site.
- `topojson-client@3` is an **unpinned floating major**, and none of the CDN tags carry `integrity`/SRI.

---

## Netlify config

`netlify.toml` has `[build]`, three `[[redirects]]`, and `[[plugins]] @netlify/plugin-nextjs`. There is **no `[[headers]]` block at all**.

- **`_next/static/*` is fine without config** — the plugin (and `next start`, verified: `Cache-Control: public, max-age=31536000, immutable`) already sets immutable caching on content-hashed assets.
- **`public/*` is not fine.** Verified: `GET /images/bob.jpg` → `Cache-Control: public, max-age=0`. The plugin's default for `public/` assets is revalidate-always, so all **2.08 MB of `public/images`** plus the 277 KB of `public/games` costs a conditional round-trip on every navigation.
- **Compression is not a concern** — Netlify negotiates gzip/brotli automatically (main CSS: 15,147 br vs 18,448 gz).
- HTML is served `Cache-Control: s-maxage=31536000` with an ETag — correct for SSG.

---

## Findings

### [P0] The app renders nothing on the server — all 33 pre-rendered pages ship an empty `<div id="__next">`

- **Where:** `src/pages/_app.js:29` (`{isMounted ? <Component {...pageProps} /> : null}`), set by the `useEffect` at `src/pages/_app.js:16`
- **Problem:** `isMounted` is `false` during both SSG and first client render, so `next build` writes HTML with zero DOM. Measured on `/`: 83,247 raw bytes total, `<div id="__next"></div>` at offset 1,601, `__NEXT_DATA__` starting at 1,631 and running **81,393 bytes (97.8% of the document)**. Consequences, all measured or directly implied:
  1. **LCP cannot begin** until webpack + framework + main + `_app` + page JS (**453,865 raw / 121,901 gz**) is downloaded, parsed, executed and hydrated, and then a `useEffect` fires a state update forcing a second render pass.
  2. **No image is discoverable by the preload scanner.** The homepage's 1,379,325 bytes of images exist only as strings inside a JSON `<script>`. `bg3.jpg` (106,691 B, full-viewport background) and `bob.jpg` (291,209 B) — the two LCP candidates — start downloading only after hydration completes.
  3. **No dynamic chunk is discoverable either.** `"dynamicIds"` is absent from every generated HTML file (checked `index`, `blog/post-two`, `info`, `projects/weather`), so Next emits no preload for the `next/dynamic` chunks. On a blog post that means `4611 + 3603 + 3576 + 8129 + 2720` = **61,311 gz** is fetched in a *second* waterfall hop after hydration rather than in parallel with the entry bundle.
  4. **CLS is effectively 1.0** — the viewport goes from blank to fully populated in one frame.
  5. Non-JS crawlers and social scrapers see an empty body.
- **Fix:** Delete the `isMounted` gate and render `<Component {...pageProps} />` unconditionally. The only client-dependent work in the effect is `document.body.setAttribute('data-theme', …)`; move that to a `_document.tsx` that renders `<body data-theme={…}>`, or keep the `useEffect` for the side-effect while rendering children unconditionally.
- **Est. saving:** Restores server-rendered HTML on all 33 pages. Turns LCP from "hydration-gated plus an extra RTT for the image" into a preload-scanner-discoverable paint — realistically **1.5–3 s off mobile LCP**, and CLS from ~1.0 to whatever the missing `width`/`height` leaves behind. Also removes the second chunk waterfall on the 18 blog/project routes.
- **Confidence:** high

### [P1] `maplibre-gl.css` is in the global stylesheet — 64,602 raw bytes of render-blocking CSS on all 33 pages for a library used on 1

- **Where:** `src/pages/_app.js:7` (`import 'maplibre-gl/dist/maplibre-gl.css'`)
- **Problem:** The single render-blocking stylesheet is 121,665 raw / 18,448 gz. Rule-block analysis shows **136 `.maplibregl-*` rule blocks totalling 64,602 bytes — 53.1% of the file**. Stripping them and recompressing: 18,336 → 9,258 gz (**−9,078 gz**), brotli 15,147 → 8,006 (**−7,141 br**). Only `/projects/weather` renders a map, and its `WeatherMap.module.css` is *already* correctly split into its own 6,042-byte route CSS file — so the mechanism for doing this right is present and working.
- **Fix:** Move the import out of `_app.js`. Either put `import 'maplibre-gl/dist/maplibre-gl.css'` at the top of `src/components/projects/WeatherMap/WeatherMap.tsx` (webpack folds it into the existing `e393a1ce…css` route chunk), or inject it from `weather.tsx` via `next/dynamic`.
- **Est. saving:** −64,602 raw / −9,078 gz off the critical render-blocking path of **32 of 33 routes**. Roughly halves the blocking CSS.
- **Confidence:** high

### [P1] `react-syntax-highlighter` ships all ~70 Prism themes to use one — 227,960 raw / 48,022 gz on 18 routes

- **Where:** `src/utils/highlighted-markdown.tsx:5` — `import { funky } from 'react-syntax-highlighter/dist/cjs/styles/prism'`
- **Problem:** The barrel `dist/cjs/styles/prism` re-exports every theme. Chunk `4611.21528f35156c0db5.js` contains **70 webpack modules** and **350 `code[class*="language-"]` selectors** (5 per theme × 70) = 227,960 raw / **48,022 gz**. Only `funky` (~3 KB) is referenced. `.next/react-loadable-manifest.json` confirms this chunk is a dependency of **both** `./layouts/PostLayout` and `./layouts/ProjectLayout` — i.e. all 7 blog posts and all 11 project pages. The `PrismLight` + `registerLanguage` half of the file (lines 2–8) is done correctly; only the theme import is wrong.
- **Fix:** `import funky from 'react-syntax-highlighter/dist/esm/styles/prism/funky';` — a deep path resolving to a single module.
- **Est. saving:** ~**−225,000 raw / −45,000 gz** on 18 of 33 routes. On `/blog/post-two/` that is 45 KB of a 61 KB post-hydration chunk payload — a 73% cut, from a one-line change.
- **Confidence:** high

### [P1] Remote Google Fonts `@import` at the top of the compiled CSS creates a 3-origin critical chain with no `preconnect`

- **Where:** `src/css/main.css:1`; emitted verbatim as the first statement of `.next/static/css/4b33ce3e55d8ddf1.css`
- **Problem:** The chain is `HTML → /_next/static/css (18,448 gz) → fonts.googleapis.com/css2 → fonts.gstatic.com woff2 × 8`. A CSS `@import` cannot start until the parent sheet has downloaded *and* parsed, so the font-CSS request is serialised behind the full 18.4 KB, then a fresh TLS handshake to `googleapis`, then another to `gstatic`. At a 150 ms RTT that is **~600–900 ms of pure connection setup** before the first glyph byte moves. There is no `<link rel="preconnect">` anywhere in `<head>`. Additionally **two** families are requested (`Azeret Mono`, `DM Mono`) at 4 variants each = 8 files, but `content/data/style.json:13` selects only `"DM Mono"`. (`display=swap` *is* set, so no FOIT — that part is right.)
- **Fix:** Replace the `@import` with `next/font/google`, which self-hosts the woff2 into `/_next/static/media` and eliminates both extra origins outright. At minimum, add `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` plus a real `<link rel="stylesheet">` in `_document`, and drop the unused `Azeret Mono` family.
- **Est. saving:** Removes 2 DNS+TLS handshakes and one serialised RTT from the critical path (**~400–800 ms** on mobile); dropping `Azeret Mono` halves font bytes (4 woff2 instead of 8, roughly **−60 KB**).
- **Confidence:** high

### [P1] 2.08 MB of unoptimised JPEGs — no `next/image`, no WebP/AVIF, no `srcset`

- **Where:** `public/images/` (18 files, 2,086,484 B); `src/components/molecules/ImageBlock/index.tsx:11`; `src/components/atoms/BackgroundImage/index.tsx:22`
- **Problem:** `grep -rn "next/image" src/` returns **zero hits**, and there is not one `.webp`/`.avif` in the repo. `next.config.js` has no `images` block, so even the built-in optimiser is unconfigured. The homepage alone references **1,379,325 raw image bytes**; `/tech-projects/` references 1,377,140. Density is the giveaway: `bp-whiting.jpg` is **0.377 bytes/px** (1118×692, 291,647 B) and `bob.jpg` is 0.303 — a well-tuned photographic JPEG lands near 0.08–0.12, and the site's own progressive files prove it (`bg1.jpg` = 0.019, `bg3.jpg` = 0.050). Eight of the eighteen files are **baseline**, not progressive. Full-resolution 1320×1378 originals are served to every viewport with no `srcset`/`sizes`.
- **Fix:** Route `ImageBlock` through `next/image` (automatic WebP/AVIF negotiation, `srcset`, intrinsic sizing), or pre-generate `.webp`/`.avif` siblings and use `<picture>`. Independently, re-encode the 8 baseline JPEGs as progressive at quality ~78.
- **Est. saving:** Re-encoding alone (matching the site's own 0.10 bytes/px baseline) takes `public/images` from 2,086,484 to roughly **700,000 B — about −1.4 MB**. WebP at equivalent quality would take it under 500 KB (**−1.6 MB**). On `/` that is **~1.0 MB off a 1.52 MB page.**
- **Confidence:** high

### [P1] `xlsx.full.min.js` (316,241 gz) loaded eagerly on two routes for an export button

- **Where:** `public/projects/fec/index.html:290`, `public/projects/spending/index.html:102`
- **Problem:** 881,727 raw / **316,241 gz** — measured live from jsdelivr — is fetched on every load of `/projects/fec/` and `/projects/spending/`. Every reference to the library is inside export handlers (`public/projects/fec/app.js:504,506,514,515,516` and `public/projects/spending/app.js:474`); nothing touches `XLSX` at init. It is also a parser-blocking classic `<script>` (no `defer`/`async`) sitting immediately before `./app.js`, so it delays the app's own bootstrap.
- **Fix:** Inject the `<script>` on first click of the export control and `await` its `onload`; at minimum add `defer`. Also add SRI hashes to all CDN tags and pin `topojson-client@3` to an exact version.
- **Est. saving:** **−316,241 gz** on both routes for the great majority of visitors who never export. Takes `/projects/spending/` from 1,001,431 to ~685,000 and `/projects/fec/` from 779,213 to ~463,000.
- **Confidence:** high

### [P1] `/projects/spending/` loads a second, third-party copy of maplibre-gl

- **Where:** `public/projects/spending/index.html:7` (CSS) and `:100` (JS), via `unpkg.com`
- **Problem:** 803,086 raw / **211,132 gz** of JS plus 65,534 raw / 9,239 gz of CSS pulled from `unpkg.com`, when the exact same `maplibre-gl@4.7.1` is already bundled in the Next app at `.next/static/chunks/5e1d2776.*.js` (785,545 raw / 208,013 gz) and its CSS is already in the global stylesheet (see the maplibre-CSS finding above). Two copies of one library on one site, one from a third-party origin with no SRI and an extra TLS handshake. Together with `xlsx`, this route's iframe pulls **546,616 gz from two external CDNs**.
- **Fix:** Serve maplibre from `/_next/` or copy the dist into `public/vendor/` — same bytes, same origin, cacheable under your own headers, no third-party handshake. Better still, port the widget into the Next component tree so it shares the already-split chunk.
- **Est. saving:** ~**−220,000 gz** of duplicate download plus 2 cross-origin handshakes, once the shared chunk is reused.
- **Confidence:** med (the "reuse the existing chunk" figure assumes the widget can be ported; the same-origin fix is unconditional)

### [P1] No `[[headers]]` in `netlify.toml` — 2.08 MB of images revalidate on every navigation

- **Where:** `netlify.toml` (whole file — no `[[headers]]` block exists)
- **Problem:** Verified against the running prod server: `/images/bob.jpg` → `Cache-Control: public, max-age=0`, while `/_next/static/chunks/framework-*.js` → `public, max-age=31536000, immutable`. The plugin gets hashed assets right on its own, but everything in `public/` (2,523,730 B: images 2,086,484, games 277,329, projects 75,073, comics 52,011, widgets 26,523, wire 6,310) is left on revalidate-always. Every internal navigation costs a conditional request per image — cheap in bytes (304), expensive in round-trips on mobile.
- **Fix:** Add a `[[headers]]` block for `/images/*`, `/games/*`, `/comics/*`, `/widgets/*`, `/projects/*` with `Cache-Control = "public, max-age=604800, stale-while-revalidate=86400"`. Only go `immutable` once filenames carry a content hash. Compression needs no config — Netlify negotiates brotli automatically.
- **Confidence:** high

### [P2] The 128.7 s "Generating static pages" is build-host I/O, not the content layer

- **Where:** `src/utils/content.ts`, `src/utils/static-props-resolvers.ts`, `src/utils/data-utils.ts` — investigated and **exonerated**
- **Problem / evidence:** I loaded the compiled `.next/server/pages/[[...slug]].js` and timed the real functions:
  - `require()` of the page bundle: **239 ms**
  - `getStaticPaths()`: **47 ms** (27 paths)
  - **All 27 `getStaticProps()` calls: 189 ms total**; slowest page `/blog` at 13 ms, `/` at 9 ms
  - All 33 output `.html` files in `.next/server/pages/` were written inside a **0.362 s window** (13:30:19.119 → 13:30:19.481)

  So actual page generation is ~11 ms/page, not 10 s/page. The theoretically suspicious patterns are all present in `content.ts` — `allContent()` re-runs `glob.sync` + `readFileSync` over the whole tree on *every* `getStaticProps` call (line 106), then `resolveReferences` inlines the reference graph in place (line 113), then `deepClone`s each object via `JSON.parse(JSON.stringify())` (line 115), which duplicates every referenced subtree once per referring object. They are cheap here only because the entire `content/` tree is **108,667 bytes across 30 files**. They are a scaling hazard, not a current cost.

  The real cause is filesystem throughput on this build host. The repo lives on **OneDrive-synced storage** (`C:\Users\roble\OneDrive\Documents\GitHub\boblemieux`) with Defender real-time scanning. `du -sh node_modules` **did not complete within a 120 s timeout**. Next's static-generation phase spawns a `jest-worker` pool, each worker resolving and `require`-ing the server bundle and its **813 traced files** (`[[...slug]].js.nft.json`), and the file-tracing pass itself walks `node_modules`. That traversal is what burns the ~129 s.
- **Fix:** Move the working clone off the OneDrive-synced path (e.g. `C:\dev\boblemieux`), or exclude `node_modules` and `.next` from both OneDrive sync and Defender real-time scanning. Netlify CI is unaffected — this is a local-machine problem. Separately, and independently of build time, memoise `allContent()` in a module-scope variable so it runs once per build process rather than once per page.
- **Est. saving:** Build time from ~129 s toward the ~5–10 s the actual work needs. Memoising `allContent()` saves ~180 ms today but converts an O(pages × content) walk into O(content).
- **Confidence:** high on the diagnosis (the 0.362 s write window and the 189 ms total `getStaticProps` are direct measurements); med on the precise 129 s attribution, since re-running the build was out of scope.

### [P2] `ImageBlock` sets `loading`/`decoding` but no `width`/`height` — residual CLS

- **Where:** `src/components/molecules/ImageBlock/index.tsx:11`
- **Problem:** `loading="lazy"` and `decoding="async"` are both correctly set. But there is no `width`, no `height`, and no `aspect-ratio` class, so the browser reserves zero space until the image decodes. With images ranging 640×426 to 1320×1378 in the same feeds, each one shifts everything below it. This is masked today by the P0 (the whole page pops in at once) — it is what you are left with *after* fixing P0.
- **Fix:** Ship intrinsic dimensions. The cleanest route is `next/image`, which reads them at build time; otherwise add the model fields and pass `width`/`height` through.
- **Est. saving:** Removes per-image layout shift; on image-dense routes (`/`, `/tech-projects/`, `/projects/`) this is the difference between a passing and a failing CLS.
- **Confidence:** high

### [P2] `voxelcraft/index.html` ships 222,894 bytes of unminified inline JS

- **Where:** `public/games/voxelcraft/index.html` (263,309 raw / 87,855 gz)
- **Problem:** 5,995 lines at a mean of 44 chars/line — full source formatting, comments and identifiers intact — plus 35,365 bytes of inline CSS. Gzip handles the transfer acceptably (87,855), so the real cost is **parse + compile**: ~223 KB of JS to compile before the game starts, on what is most likely a phone. Being inline, it also cannot be cached separately from the HTML.
- **Fix:** Minify the inline script as a build step, or extract it to a separate cacheable `.js` file.
- **Est. saving:** ~110 KB raw off parse (roughly 50–150 ms of compile on a mid-tier phone); extraction makes the JS independently cacheable.
- **Confidence:** med

### [P2] `mindmap-3d.html` blocks the parser on a 149,872 gz synchronous `<script>` for three.js r128

- **Where:** `public/widgets/mindmap-3d.html:32`
- **Problem:** `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>` with **no `defer`/`async`** — 603,445 raw / 149,872 gz from a third origin, blocking the parser before the 24,812-byte inline scene script at line 33 is reached. r128 is roughly 5 years stale. No `preconnect` to cdnjs, no SRI.
- **Fix:** Add `defer` to both scripts (they are already at the bottom, so ordering is preserved), add `<link rel="preconnect" href="https://cdnjs.cloudflare.com">`, add an `integrity` hash, and pin/upgrade the version.
- **Est. saving:** Unblocks the parser for the duration of a 149,872-byte cross-origin fetch — **~300–600 ms** of blocked main thread on mobile.
- **Confidence:** high

### [P2] `polyfills-*.js` is 39,627 gz for browsers that cannot run the site anyway

- **Where:** `.next/static/chunks/polyfills-42372ed130431b0a.js` (112,594 raw / 39,627 gz)
- **Problem:** Served as `<script defer nomodule>`, so modern browsers correctly skip it — this is **not** on the modern critical path, and I excluded it from the route table. Flagged only so it is not mistaken for shared weight when reading the Next build output, where it inflates the reported "First Load JS".
- **Fix:** None required. Optionally raise the `browserslist` floor to drop it from the build entirely.
- **Confidence:** high

---

## Lighthouse-style summary (static estimates — **not** a Lighthouse run)

Modelled at "Slow 4G" (~1.6 Mbps effective, 150 ms RTT) on a mid-tier phone (~4× CPU slowdown), derived arithmetically from the measured byte counts and the render path above. Treat these as a ranking, not as scores.

| Route | Est. LCP | Est. CLS | Est. TBT | Dominant cause |
|---|---|---|---|---|
| `/` | **4.0–5.5 s** | **~1.0** | 400–700 ms | Empty SSR shell + 1.38 MB of hydration-gated images |
| `/tech-projects/` | **4.0–5.5 s** | ~1.0 | 400–700 ms | Same, 1.38 MB images |
| `/projects/spending/` | **4.5–6.0 s** | ~1.0 | **800–1200 ms** | Empty shell + 546 KB gz of CDN JS in the iframe (xlsx + maplibre) |
| `/info/`, `/work/` | 3.5–4.5 s | ~1.0 | 400–700 ms | Empty shell + 955 KB images |
| `/projects/fec/` | 3.5–4.5 s | ~1.0 | **700–1000 ms** | Empty shell + 316 KB gz xlsx |
| `/projects/weather/` | 3.5–4.5 s | ~1.0 | **900–1400 ms** | 208 KB gz maplibre parse + WebGL init |
| `/work/integra/`, `/projects/` | 3.0–4.0 s | ~1.0 | 450–750 ms | Empty shell + 585 KB images + 61 KB Prism themes |
| `/blog/`, `/blog/post-*` | 2.5–3.5 s | ~1.0 | 450–750 ms | Empty shell + second-waterfall Prism chunk |
| `/wire/` (static) | **0.4–0.8 s** | ~0 | ~0 | 2,991 gz, zero JS — the fastest page on the site by two orders of magnitude |

**CLS is ~1.0 across every Next route for a single reason:** nothing is server-rendered, so the viewport stays empty until hydration and then fills in one frame. Fixing P0 collapses that to whatever the missing `width`/`height` on `ImageBlock` leaves behind.

### Priority order by measured impact

1. **P0** — remove the `isMounted` gate (`_app.js:29`). Unblocks LCP, image preload-scanning, dynamic-chunk preloading, and CLS on all 33 pages at once. Nothing else matters as much.
2. **P1** — image pipeline: −1.4 MB raw across the site, −1.0 MB on `/` alone. Biggest byte win.
3. **P1** — `xlsx` on demand: −316 KB gz on two routes.
4. **P1** — Prism theme deep-import (one line): −45 KB gz on 18 routes.
5. **P1** — maplibre CSS out of `_app` (one line): −9 KB gz / −64.6 KB raw of render-blocking CSS on 32 routes.
6. **P1** — `next/font` or `preconnect`: −2 origins, −1 serialised RTT.
7. **P1** — `[[headers]]` for `public/*`.
8. **P2** — build host off OneDrive; memoise `allContent()`.

### Counts

**P0: 1 · P1: 6 · P2: 5**
