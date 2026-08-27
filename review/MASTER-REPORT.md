# boblemieux.ai — Master Review Report

**Date:** 2026-08-27
**Clone reviewed:** `C:\Users\roble\OneDrive\Documents\GitHub\boblemieux` @ `214b812` (main)
**Netlify site:** 2003ca99-9fc3-4a0b-bd2c-e28b2b2390c4
**Baseline:** `npm run build` exit 0, 33 pages generated. Local prod server on :4321.

---

## Verdict

One bug is responsible for most of the damage. `src/pages/_app.js:31` gates the entire React tree behind an `isMounted` flag, so all 33 statically generated pages ship an empty `<div id="__next"></div>` with **no title, no meta description, no OG tags, no `<html lang>`, and no content**. Everything the build produced is thrown away and re-derived in the browser from an 81 KB JSON blob.

That single ternary is simultaneously the worst SEO defect, the worst performance defect, the reason every LinkedIn share of this site previews as a bare URL, and the reason the contact form cannot be fixed by the normal Netlify route. Fix it first; several other findings resolve or change shape once it lands.

Behind it sit two independent breakages — a contact form that has been silently discarding every inquiry, and the flagship weather demo rendering as a blank rectangle — and a body of content whose factual inconsistencies are the kind a petrochemical executive notices in ten seconds.

The good news: 0 broken links, 0 missing alt text, secrets clean, no horizontal overflow at 380px on any of 15 routes, and a build that passes. The foundations are sound. The failures are concentrated and fixable.

**118 findings — P0: 11 · P1: 55 · P2: 52** (after deduplication across six lanes)

---

## Method and confidence

Six parallel agents. Two things shaped the review and are worth recording:

- **`curl` returns no markup**, because of the P0. The a11y lane worked around this by bundling the real component source with esbuild and server-rendering all 27 routes from the live `__NEXT_DATA__` to obtain true DOM. The design lane worked from design tokens and content frontmatter instead. Where a finding depends on rendered output, it was obtained one of those two ways.
- **This machine's Chrome has a 20px default root font**, which moves Tailwind v4's rem-based `lg:` breakpoint from 1024px to 1280px. Responsive testing was re-run with `html{font-size:16px}` forced. Anyone repeating this work here needs to know that or they will file a phantom nav-breakpoint bug.

Items re-verified against source rather than taken on an agent's word are marked **[verified]**.

---

# P0 — Broken

### 1. Every page server-renders as an empty div  **[verified]**

`src/pages/_app.js:31` — `{isMounted ? <Component {...pageProps} /> : null}`
*Lanes: code, perf, ux, a11y — all four independently*

Confirmed across 9 routes by hand and 33 by the code lane: `0` `<title>`, `0` `og:` tags, `0` meta descriptions, bare `<html>` with no `lang`. Homepage HTML is 83,247 bytes of which 81,393 (97.8%) is `__NEXT_DATA__` and **zero is DOM**.

Consequences, all downstream of this one line:

- Social crawlers do not execute JS → every share on LinkedIn/Slack/iMessage previews blank.
- `seo-utils.js` is complete and correct but never executes at build time.
- LCP waits on 121,901 gz of entry JS + hydration + a `useEffect` re-render. CLS ≈ 1.0.
- No image is discoverable by the preload scanner.
- `dynamicIds` is absent from every HTML file, so `next/dynamic` chunks load in a *second* waterfall (61,311 gz on blog/project routes).
- Netlify Forms detection parses built HTML at deploy and finds no `<form>` — see P0 #2.

The gate exists to dodge a hydration mismatch on the `data-theme` body attribute set at `_app.js:18`. **The fix is therefore not just deleting the ternary** — theming has to move server-side (a `_document.tsx` setting `data-theme`, or the attribute moving onto a wrapper element rendered from `pageProps`). Deleting the ternary alone will produce a hydration error.

### 2. The contact form throws every submission away  **[verified]**

`src/components/molecules/FormBlock/index.tsx:16-22`
*Lane: ux*

```js
event.preventDefault();
const value = Object.fromEntries(new FormData(formRef.current).entries());
alert(`Form data: ${JSON.stringify(value)}`);
```

The untouched Stackbit stub. No fetch, no POST, no mailto. Live on **9 pages**: `/`, `/info`, and all seven blog posts. Every inquiry ever submitted has been discarded into a browser alert.

Line 27 has `<input type="hidden" name="form-name">`, so Netlify Forms was intended — but that path is doubly dead: `preventDefault()` means no POST fires, **and** Netlify detects forms by parsing built HTML, which is empty per P0 #1. Fixing `_app.js` is a prerequisite.

### 3. ~~`/projects/weather` renders a blank rectangle at every viewport~~ — **RETRACTED, testing artifact**

**Corrected 2026-08-27 during Phase 3.** This was largely a false positive. The
review drove a Chrome tab that was backgrounded
(`document.visibilityState === "hidden"`), and Chrome suspends
`requestAnimationFrame` in hidden tabs — measured: **1 rAF callback in 15.8
seconds**. MapLibre renders on rAF, so it never completed a first paint, never
fired `load`, and never requested vector tiles. In a normal visible tab this
does not occur. The basemap and NOAA endpoints were reachable throughout (a
direct tile probe returned 200 with 183 KB of `.mvt`).

Two real defects survive from the original finding and are fixed in `3a7499a`:
the legend `<img>` elements sat at `src=""` and rendered as broken-image icons,
and the only failure path was an invisible `console.warn`. Boot was also moved
off `load` onto the earliest usable style signal so a delayed first render no
longer strands the whole panel.

Original finding text follows for the record.



`src/components/projects/WeatherMap/WeatherMap.tsx:761`
*Lane: ux — directly observed in-browser at 1521px and 380px*

WebGL is available, the MapLibre canvas is correctly sized (1851×730 device px), and the style assets all return 200 — but **zero vector data tiles are requested and zero calls to `/api/alerts` or `/api/wfs` are made**. The status line stays on "Loading…" forever and both legend images sit at `src=""`, rendering as broken-image icons.

Everything hangs off `map.on('load', …)` at lines 761-790 — legend `src` assignment, `refreshAlerts()`, `wireControls()`, all layer creation — and none has run. The APIs are healthy (`/api/alerts/` returns 200 with 1.4 MB GeoJSON). Most likely the handler registers after the style already resolved; `reactStrictMode: true` plus the `_app` mount gate makes a double-mount race very plausible. Confidence: high on symptom, medium on mechanism.

This is the flagship technical demo for the AI/tech audience and it currently reads as a dead page.

### 4–9. Content: six factual defects  **[partly verified]**

*Lane: content*

| # | Issue | Where |
|---|---|---|
| 4 | Surname misspelled in the two most-visible strings on the site | `config.json:10` header title, `config.json:107` copyright |
| 5 | About page names two different Chevron Phillips facilities | `info.md:28`, `info.md:190` |
| 6 | "40+ years" understates a 45-year career the site's own dates prove | `index.md:6,71`, `info.md:6,16`, `work/index.md:8` |
| 7 | Claims the site runs local LLMs; it is Next.js on Netlify | `projects/boblemieux-ai.md:21` |
| 8 | Newsletter copy is unedited starter-template text | all 7 blog posts, `:33,61` |
| 9 | Two blog posts dated 2024 among 2026 posts; one is featured on the homepage | `post-six.md`, `post-seven.md` |

**#4 [verified]** — correct spelling is **LeMieux** (16 occurrences: every `metaTitle`, the `titleSuffix`, the `info.md` body). `Lemieux` appears 4 times, two of them rendering on every single page directly beneath a `<title>` that spells it the other way. Four string edits in two JSON files.

**#5 [verified]** — and sharper than reported. Bob's own commit `363e72f` ("Correct Baytown entry: CPChem Cedar Bayou cracker, not ExxonMobil") touched only **one line** of `info.md`. Two references survived: both `info.md:26-28` and `info.md:189-190` still list *"ExxonMobil Baytown Expansion"* **and** *"Chevron Phillips Hydrocracker"* as two separate Fluor programs. Per his own commit these are **one** job — Chevron Phillips Chemical, Cedar Bayou, Baytown TX — and it was an **ethane cracker**, not a hydrocracker. The bio double-counts one project under two wrong names.

**#7 [verified]** — the claim is *misattributed, not false*. Bob does run local models on his own hardware. The sentence welds that lab onto *this site*, which is a CDN-served Next.js build — and it contradicts `post-three.md:96`, which describes the stack correctly. Reword the subject; do not retract the capability.

**#8 [verified]** — `title: 'Stay up-to-date with my words ✍️'` and checkbox `Sign me up to receive my words` — Stackbit personal-theme boilerplate, on every blog post. Same family: `"Submit 🚀"` (`index.md:394`) and `"Send it 🚀"` (`info.md:288`) — a rocket emoji on the contact form of a heavy-industrial consultant. The clearest surviving fingerprint of the fork.

### 10–11. Design: two images actively working against the site

*Lane: design*

- **Five project pages ship the kit's gradient wallpapers** (`bg1/bg2/bg3.jpg`) as featured images, and `bg2`/`bg3` are each used by *two* projects — so `/projects` renders duplicate blobs side by side. Turnover Readiness and Controls Automation, two of the strongest assets, are both illustrated with wallpaper. **[verified]**
- **`/projects/marley1`** puts a cluttered desk snapshot behind body text at `opacity: 75` on a black page — which is also the site's worst contrast failure at **1.86:1**, with 43.4% of the frame below 4.5:1.

---

# P1 — Looks bad / hurts credibility

Grouped by theme. Full detail in the per-lane reports.

## Conversion — the site never asks for anything  *(ux)*

- **No CTA exists anywhere.** Both home heroes have `actions: []` — nothing clickable above the fold at any viewport. No Contact in the nav, no résumé/CV on the site.
- The home page body **never links to `/work` or any case study**. Exec proof is one nav click away and zero content links away.
- **Dead-end pages** — no contact CTA on any work or project page.
- Home is **14,022px tall at 380px** with `isSticky: false` — no nav for 18 screens.
- Nav says **"Info"**, the page is titled **"About"**.
- **"Work" vs "Work Projects" vs `/work-projects`** — three different things sharing one word.
- **`/wire` is unreachable** — the best AI artifact on the site, linked from nowhere. *(also content, design)*
- `/projects` puts a **cheeseburger game and a comic next to $20B project-controls work**.

## Content credibility  *(content)*

- Homepage hero: **250 words of abstraction, zero numbers**, closing with *"It's not hype"*. Fails both audiences.
- **`info.md` is third-person** ("Bob LeMieux is…", "He has directly led") while every case study is first-person ("I served as…"). **[verified]**
- The **`$300M` vs `$3.8B` tension** — `info.md:21` reads *"directly led controls on projects up to $300M **and contributed as a key controls leader on programs up to $20B**"*, a deliberate two-tier claim, not a flat contradiction. But `bp-whiting.md:29` says *"I served as Project Controls Manager… responsible for scheduling and earned value across the program"*, which reads as leading. **[verified — downgraded from the content lane's P0.]** Only Bob can settle which framing is right.
- **Harvard case study never says what Bob did.**
- **Integra page — the current role — contains no numbers at all.**
- The **three digital-twin projects**, the strongest tech assets (named NASA/AWS/MapLibre stacks), are **missing from `/projects` entirely**.
- **Four project pages are bare iframes** with no heading, byline, or copy. *(also design)*
- **"View all Tech Projects" leads to a page showing 6 of 13.** *(also design)*
- Blog: four posts repeat the same sentence and same three examples; post-five is a generic AI explainer with nothing of Bob's in it.
- **Instagram sits in the header** next to the executive audience.

## SEO  *(code)* — all blocked behind P0 #1

- No `robots.txt`, no `sitemap.xml`, no JSON-LD.
- **12 routes have no meta description** — `seoGenerateMetaDescription` only falls back for `PostLayout`.
- No canonical, no Twitter card, no `og:type`/`og:url`/`og:description`.
- **`og:image` is relative** and will not resolve for any scraper — `site.env.URL` (`seo-utils.js:78`) is never populated.
- Blog slugs `post-one`…`post-seven` — generic URLs despite substantive titles. **This is the one fix that changes URLs; needs 301s in the same deploy.**

## Performance  *(perf)* — gzipped unless stated

- **`maplibre-gl.css` is in the global stylesheet**: 64,602 of 121,665 raw bytes (53%) of render-blocking CSS on all 33 pages, for a library used on 1. `_app.js:7`.
- **`react-syntax-highlighter` ships ~70 Prism themes to use one** — 227,960 raw / 48,022 gz on 18 routes. `highlighted-markdown.tsx:5` imports the theme barrel.
- **Google Fonts `@import` at the top of the compiled CSS** — 3-origin critical chain, no `preconnect`, 8 woff2 for 2 families when the theme selects 1. `main.css:1`.
- **2.08 MB of unoptimised JPEGs** — no `next/image`, no WebP/AVIF, no `srcset`.
- **`xlsx.full.min.js` (316,241 gz) loads eagerly on two routes** for an export button.
- **`/projects/spending/` loads a second, third-party copy of maplibre-gl** from unpkg.
- **No `[[headers]]` in `netlify.toml`** — 2.08 MB of images serve `max-age=0`.

## Accessibility  *(a11y)* — 12 P1s, no P0s

- **4 genuine contrast failures**, all from photo backgrounds and opacity modifiers — **the palettes themselves all pass** (20.69:1 for the one actually used). Worst: 1.86:1 (marley1, see P0 #11), then the contact-form placeholder at 2.52:1 worst / 3.97 median with 71.5% of area failing.
- **Placeholder text is the only visible label** on every contact-form field.
- **Focus visibility broken in four places**: mobile open/close buttons (`focus:outline-hidden`, no replacement), the `opacity-0` consent checkbox (no `peer-focus` style), the skip link (`sr-only` with no `focus:not-sr-only`), form inputs (1px ring against an identical 1px border).
- **Mobile menu** has no `aria-expanded`/`aria-controls`, no dialog semantics, no focus management, no Escape.
- **Home has two `<h1>`** (HeroSection hardcodes one). *(also design)*
- `/projects/fec|nyt|spending`, `/wire/` and the comic have **zero headings**.
- No `<html lang>` on any route — no `_document.tsx` exists. *(also code)*

## Code health  *(code)*

- **`glob` is imported but not declared in `package.json`** (`content.ts:3`; only `@types/glob` is present). Survives on a transitive hoist; **will break on a lockfile refresh**. **[verified]**
- **ESLint cannot run at all** — v9.21 wants flat config, repo has only `.eslintrc.json`, no `lint` script. **[verified]**
- **`/api/fec` sets `Access-Control-Allow-Origin: *`** on a route that injects a private API key — an open proxy for the OpenFEC quota. The key never leaks, but the route already has 429 backoff logic, so exhaustion is a live failure mode.

## Design system  *(design)*

- **Both brand colours are defined and never rendered.** `colors-f` 39 uses, `colors-a` 27, and **`colors-b`/`c`/`d`/`e` zero**. `colors-c` is the primary `#0804F6`, `colors-d` the secondary `#FE491F`. `main.css:86` excludes `colors-f` from the theming rule. The site is monochrome with no accent. **[verified]**
- **The favicon is the template's letter "P"**, `fill="#000"` — invisible on dark tabs. **[verified]**
- Homepage hero body copy runs at **~118 characters per line**.
- **`ProjectLayout:48` sets whole multi-sentence paragraphs in uppercase monospace.**
- Post/project headers are **outdented 8rem** to the left of the body they introduce.
- **Every blog post ends with ~320px of empty black** (`pb-56` + `pt-24`).
- **`/work/integra`'s featured image is a screenshot of Integra's marketing site**, cropped mid-sentence, illegible at 340px. *(also ux)*
- **The four static HTML pages do not belong to this site** visually.
- Home hero portrait is a hard-coded `width:200px` float → **124px text column at 380px**, 2–3 words per line for twelve lines. *(ux)*

---

# P2 — Polish

52 items. Highest-value clusters:

- **~900 LOC of dead starter code (~16% of `src/`)** — 5 unused sections, `ProjectFeedLayout`, `VideoBlock` + `get-video-data.ts`, `SelectFormControl`, `utils/tree.ts`, and **21 of 27 SVGs bundled unconditionally** because `iconMap` is a static lookup webpack cannot tree-shake. Plus unused `js-yaml` and an orphan 42 KB `graphcast_demo.ipynb`.
- **The 128.7 s "Generating static pages" is build-host I/O, not the content layer.** Measured directly: `getStaticPaths()` 47 ms, all 27 `getStaticProps()` **189 ms total**, all 33 HTML files written in a **0.362 s window**. The cause is that this repo lives on **OneDrive-synced storage**; Next's worker pool + file tracing (813 files) crawls it. `du -sh node_modules` did not finish in 120 s. **Fix is moving the clone off OneDrive** — presumably why `~/repos` and `~/Projects` copies exist.
- Titles duplicate the owner's name (7 exceed 60 chars); 8 descriptions exceed 160.
- 81 links carry `aria-label=""`; 260 inline SVGs unmarked; header/footer link lists are not `<nav>` landmarks.
- `voxelcraft/index.html` ships 222,894 bytes of unminified inline JS; `mindmap-3d.html` blocks the parser on a 149,872 gz synchronous three.js r128.
- `"strict": false` with 74 `any` usages; 7 `.js` files in a TS codebase; four API routes in four different shapes.
- No security headers; markdown-authored internal links pay a 308 redirect hop.
- `/404` renders Next's built-in page with no site chrome.
- "Work Projects" content duplicated verbatim across three pages.
- The homepage 3D widget is labelled with a stale internal codename.
- "Center for Brain Science" links to a page titled "Northwest Science Building".

---

# Decisions I will not make for you

Judgment calls about a real career and a personal brand. No fixes queued for any of them.

1. **The portrait.** `public/images/bob.jpg` is a stylized comic illustration — ink hatching, mirrored green sunglasses, saturated orange background. It has real personality. But `config.json:5` makes it `defaultSocialImage`, so it is the thumbnail that unfurls on LinkedIn, where the audience is construction executives. The design lane called it the single most expensive decision on the site for that audience. It may be entirely deliberate. **Your call.**
2. **`$300M` vs `$3.8B`.** Which framing is accurate for BP Whiting — did you *lead* controls on it, or *contribute* to it? The two pages currently imply different answers.
3. **The Chevron Phillips / ExxonMobil Baytown entry.** Your own commit shows these are one job under two wrong names, but I do not know the correct final wording for the Fluor programme list.
4. **Instagram in the header** — keep or drop for the exec audience.
5. **Blog slug renames.** `post-one` → real slugs is a genuine SEO win but it changes live URLs and needs 301s. Say the word and I will do it with redirects in the same commit.
6. **Games/comic placement.** Rules say preserve `/wire` and the game pages — they are preserved. But `/projects` currently mixes them with $20B project-controls work. Separating them is a content-architecture decision.

---

# Proposed Phase 3 batching

If approved, commits in this order — each a single logical change:

| # | Commit | Risk |
|---|---|---|
| 1 | Fix `_app.js` SSR gate + move `data-theme` server-side (`_document.tsx`) | **High — touches every page.** Verify no hydration warnings before proceeding. |
| 2 | Wire the contact form to Netlify Forms (depends on #1) | Medium |
| 3 | Fix the WeatherMap boot race + hide unset legend images | Medium |
| 4 | Surname spelling, "45 years", newsletter/rocket-emoji template copy | Low |
| 5 | `robots.txt`, `sitemap.xml`, canonical, Twitter card, absolute `og:` URLs, `og:type` | Low — depends on #1 to be visible |
| 6 | Declare `glob`; add flat ESLint config + `lint` script | Low |
| 7 | Lock `/api/fec` CORS to the site origin | Low |
| 8 | Split `maplibre-gl.css` out of global; direct Prism theme import | Medium — verify weather + blog rendering |
| 9 | `preconnect` + font subset; `[[headers]]` cache block in `netlify.toml` | Low |
| 10 | Favicon; brand colour actually used; project featured images off `bg*.jpg` | Low — but the images themselves need to come from you |
| 11 | a11y: focus-visible, mobile menu ARIA + Escape, real `<label>`s, `<html lang>`, single `<h1>` | Low |
| 12 | Dead code removal (~900 LOC) | Low — but delete `.stackbit` models/presets in the same commit or the visual editor breaks |

Not queued: anything under "Decisions I will not make for you", and no page deletions.

---

# What is already good

Worth stating, because the list above is long:

- **0 broken links.** Every internal route and external URL resolves.
- **0 missing alt text** across 59 images. No filename-as-alt, no empty alt on meaningful images.
- **Secrets clean**, verified twice independently. `.env.local` gitignored and never tracked; zero `NEXT_PUBLIC_*` anywhere; `FEC_API_KEY` is server-only and fails closed rather than falling back to a demo key.
- **Zero horizontal overflow** at 380px on 15 routes, and at 768px on 9. The hamburger collapse works correctly.
- **The colour palettes all pass AA** — 20.69:1 for the one in use.
- **`maplibre-gl` JS is correctly code-split** (785 KB, weather-only).
- **`react-syntax-highlighter` correctly uses `PrismLight`** — only the theme import is wrong.
- **All four iframes carry `title`.**
- **`tsc --noEmit` passes**, exit 0.
- **`public/wire/index.html`** — 2,991 bytes gzipped, zero JS — is the fastest page on the site by two orders of magnitude, and the best AI artifact on it. It just needs to be reachable.
