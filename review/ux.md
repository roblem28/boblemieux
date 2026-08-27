# UX & Responsive Review

_Method: Browser testing **succeeded** (Chrome extension, own tab in the MCP tab group) against the running production build at `http://localhost:4321`._

_Viewports: **380 / 768 / 1440**. `resize_window` was a no-op on this machine — the Chrome window is maximized and refused every programmatic resize (`innerWidth` stayed 1536 after each call). Narrow viewports were therefore tested with a **same-origin iframe harness**: a full-screen overlay injected onto the localhost page holding an iframe of the target route at an exact pixel width. CSS media queries evaluate against the iframe's own width, so breakpoint behaviour is faithful. 1440 was tested directly in the real window (client width 1521)._

_One environment caveat, so nobody chases it as a bug: **this browser's default root font-size is 20px, not 16px**. Tailwind v4 breakpoints are rem-based, so `lg:` (64rem) resolved to 1280px here instead of 1024px, and all text rendered 25% larger than a normal visitor sees. Every measurement below was re-run with `html{font-size:16px}` forced inside the harness to simulate a default browser. The nav breakpoint is correctly 1024px for a normal visitor._

_Link checking: all 30 markdown/TSX routes were fetched with `curl`, every `href` and `url` extracted from the `__NEXT_DATA__` payload (see P0-2 for why the served HTML body is empty), then every internal path curl'd for status and every external URL checked with `curl -sL` under a browser user-agent._

---

## Broken / dead links

**Zero broken links.** Every internal route and every external URL referenced anywhere on the site resolves.

| Link | Found on | Status |
| --- | --- | --- |
| `/games/obstacleboy/` | `/projects` | 404 locally — **expected**, Netlify proxy to `obstacleboy.netlify.app` (verified 200). Not a finding. |
| `/wire/` | (nothing links to it) | 404 under `next start`; `/wire/index.html` is 200. Next.js does not serve directory indexes from `public/`; Netlify's static server does. Environment-only — see P2-3. |
| `/games/voxelcraft/` | (site links the `/index.html` form) | Same mechanism. The site's own link uses `/games/voxelcraft/index.html`, so no user-facing break. |
| `/work/harvard-brain-science` | `/info` (inline markdown link) | 200 via a **308 redirect** — the only internal link on the site missing its trailing slash. See P2-2. |

External links all verified 200: `boblemieux.ai`, `github.com/roblem28`, `linkedin.com/in/boblemieux`, `instagram.com/spazzmaster28`, `earth-twin-bob`, `moon-twin-bob`, `exoplanet-twin-bob`, `emberwatch-bob`, `flash-frenzy`, `nyt-digest`, `obstacleboy`, `bp.com`, `cpchem.com`, `som.com`.

Note for anyone running an automated link checker later: `bp.com`, `som.com`, `boblemieux.ai`, `emberwatch-bob` and `exoplanet-twin-bob` all return 403 or a connection failure to a bare `curl -I`, and are fine only with a browser user-agent. Those are false positives, not dead links.

---

## Responsive issues

**No horizontal overflow at any viewport.** `documentElement.scrollWidth === clientWidth` on all 15 routes probed at 380px and all 9 probed at 768px. No table, `<pre>`, canvas, or SVG exceeds its container; nothing breaks out of the page. The Tailwind grid work is sound.

| Route | Viewport | Issue |
| --- | --- | --- |
| `/` | 380 | Hero portrait is a hard-coded `width: 200px` float. Measured: container 348px, image 200px, **text column 124px** — the opening paragraph runs 2–3 words per line for ~12 lines. Worst readability failure on the site. |
| `/projects/weather` | 380 | Map canvas is 641px tall starting 97px down; the page title ("WEATHER MAP") and the Layers control sit **below** it. The entire first screen is a blank rectangle with no indication of what the page is. |
| `/projects/weather` | 380 / 768 / 1440 | Map renders blank (no basemap, no radar), status stuck on "Loading…", legend `<img>` elements have `src=""` and show broken-image icons. See P0-3. |
| `/work` | 380 | `/images/integra.jpg` is a screenshot of Integra's marketing website. At 340px its embedded body copy is ~5px tall and illegible, and the screenshot is cropped mid-sentence. |
| `/` | 380 | Page is **14,022px tall** (~18.5 screens). Header is `isSticky: false`, so from the contact form at the bottom there is no route back to nav except scrolling the full height. |
| `/` | 380 | 3D mind-map iframe renders at 340×516. A pan/zoom/rotate WebGL graph in a 340px box is not usable by touch and captures the scroll gesture mid-page. |
| `/`, `/projects`, `/work`, footer | 380 / 768 | Action links ("Learn more", "View all…", "See all posts") are **28px tall**; footer links **23px**; MapLibre zoom/compass buttons **29×29**; newsletter checkbox **24×24**. All below the 44px touch minimum. Card links themselves are 700px+ and fine. |
| all | 768 | Nav correctly collapses to hamburger below 1024px. Overlay verified working: full-screen, 4 links + 3 socials, close button, auto-closes on route change. No Contact and no Home item in it. |
| `/projects/fec`, `/projects/spending`, `/projects/nyt` | all | Render in an entirely different visual language (light ground, Bootstrap-style blue buttons, system sans) from the rest of the site. No overflow, but they read as embedded third-party apps rather than as Bob's work. |
| `/` contact form | 380 | Layout is fine — single column, 348px fields, 50px inputs, 144×63 submit. It simply does not work (P0-1). |

---

## Findings

### [P0] The contact form throws every submission away

- **Where:** `src/components/molecules/FormBlock/index.tsx:16-22`; rendered on `/`, `/info`, and all seven `/blog/post-*` pages
- **Problem:** This is still the unmodified Stackbit template stub. `handleSubmit` calls `event.preventDefault()` and then `alert(...)` with the serialized form data. Verified live in the browser: filling the form and clicking "Submit 🚀" pops a native alert reading `Form data: {"form-name":"sign-up-form","firstName":"Test","lastName":"","email":"t@example.com","message":"hello"}` and nothing else happens. The `<form>` has no `action`, no `method`, and no `data-netlify` attribute. There is a hidden `form-name` input — the shape of a Netlify form — but the handler intercepts before it can ever POST. **Every inquiry from every visitor has been lost**, and the visitor gets a raw JSON dump instead of a confirmation. This is the site's primary conversion mechanism, and it appears on nine pages.
- **Fix:** Add `data-netlify="true"` to the `<form>`, drop the `onSubmit` interceptor (or replace it with a `fetch` POST to `/` as `application/x-www-form-urlencoded` plus a success state). Because the pages are client-rendered, Netlify's build-time form detection will never see this form — add a static hidden duplicate in `public/` so the form registers. Until that ships, the footer `mailto:` is the only working path and should be made prominent.
- **Confidence:** high

### [P0] Every page ships an empty HTML shell — no title, no meta description, no content

- **Where:** `src/pages/_app.js:31` — `{isMounted ? <Component {...pageProps} /> : null}`
- **Problem:** `isMounted` starts `false` and is only set in `useEffect`, which never runs during static generation. All 30 pre-rendered pages therefore contain literally `<div id="__next"></div>` and nothing else (verified: 30 of 30 routes). Because `<Head>` lives *inside* the gated `<Component>`, the served HTML also carries **no `<title>`, no `<meta name="description">`, and no OpenGraph tags** — only the Google site-verification tag from `_app` survives. All content exists solely inside the `__NEXT_DATA__` JSON blob. Consequences: link previews in LinkedIn, Slack, iMessage and email — the channels through which an executive actually receives this URL — render as a bare URL with no title, no description and no photo, despite `socialImage: /images/bob.jpg` being set on every page. Search engines get a blank document on first pass. Anyone with JS disabled or a slow connection sees a white page. This also silently discards the `metaTitle`/`metaDescription` copy that has clearly been written with care on every content file.
- **Fix:** Delete the `isMounted` gate and render `<Component {...pageProps} />` unconditionally. Move the `data-theme` body attribute into a `_document.tsx` or apply it as a className on a wrapper so it exists at SSR time — that attribute is almost certainly why the gate was added.
- **Confidence:** high

### [P0] `/projects/weather` is broken at every viewport

- **Where:** `/projects/weather`; `src/components/projects/WeatherMap/WeatherMap.tsx:761` (`map.on('load', …)`)
- **Problem:** The map renders as an empty rectangle. Confirmed at 1521px and at 380px. WebGL is available (`ANGLE / Intel UHD / D3D11`), the MapLibre canvas is correctly sized (1851×730 device px), and the style loads — `style.json`, `tiles.json`, `sprite@2x.json/.png` and the glyph `.pbf`s all return 200. But **zero vector data tiles are ever requested** and **zero calls to `/api/alerts` or `/api/wfs` are made**. The status line stays on "Loading…" indefinitely and both legend images sit at `src=""`, rendering as broken-image icons with the alt text "radar legend" visible in the panel. Everything hangs off the `map.on('load')` callback — the legend `src` assignment, `refreshAlerts()`, `wireControls()` and all layer creation are inside it at lines 761-790 — and none of it has run, so the load event is not firing. Most likely a race where the handler is registered after the style has already resolved (`reactStrictMode: true` plus the `_app` mount gate makes a double-mount race very plausible). The APIs themselves are healthy: `/api/alerts/` returns 200 with 1.4MB of GeoJSON. This is the flagship technical demo for the AI/tech audience and it currently reads as a dead page.
- **Fix:** Guard the boot sequence with `if (map.isStyleLoaded()) boot(); else map.on('load', boot);`, and make sure the effect that creates the map cleans up with `map.remove()` on unmount so StrictMode's double-invoke cannot leave a stale instance behind. Separately, keep the legend `<img>` elements `hidden` until their `src` is set so a failure degrades to nothing rather than to a broken-image icon.
- **Confidence:** high on the symptom (directly observed); medium on the exact mechanism.

### [P1] Nothing on the site asks the visitor to do anything

- **Where:** `content/pages/index.md:36` and `:83` (both `actions: []`); `content/data/config.json:12-31`
- **Problem:** Both hero sections on `/` declare `actions: []` — there is **no button, no CTA, nothing clickable above the fold** at any viewport. The first screen is a headline ("Digital Leverage") and a personal essay about computers. The header nav is Info / Work / Projects / Blog — no "Contact", no "Hire me", no "Resume". The only contact affordances on the entire site are the broken form at the very bottom of a 14,000px page and a `mailto:` in the footer. There is **no résumé or CV anywhere** — no PDF in `public/`, no link, no mention. For a 45-year career being marketed to hiring executives, that is the single most-requested artifact and it is absent.
- **Fix:** Add an `actions` array to the first hero with two buttons — "See selected work" → `/work` and "Get in touch" → the contact anchor. Add a "Contact" entry to `config.json` `primaryLinks` so it appears in both the desktop nav and the mobile overlay. Publish a one-page PDF résumé to `public/` and link it from `/info` and the header.
- **Confidence:** high

### [P1] An executive landing on `/` cannot reach the credibility proof

- **Where:** `/` (page body), `/work`, `content/pages/info.md`
- **Problem:** The 15 in-body links on the home page go to `/work-projects`, three `/projects/*` tool pages, six `/projects/*` tech pages, `/tech-projects`, three blog posts, and `/blog`. **Not one links to `/work` or to any of the four career case studies.** The projects that actually establish authority — Integra data centers, Harvard Northwest Science Building, BP Whiting, CPChem Cedar Bayou — are reachable only by noticing "WORK" in the nav bar. Meanwhile the strongest credibility copy on the site ("40+ years… projects up to $300M… programs up to $20B… 26 years at Fluor") is buried on `/info`, a page the nav labels "Info". The home page's own above-the-fold copy mentions none of it: no numbers, no employers, no scale.
- **Fix:** Move the credibility statement — or a three-metric strip (45 years / $20B programs / P6 + EVM) — to the top of `/`. Add a "Selected Work" section on `/` linking the four case studies directly, the way the "Work Projects" and "Tech Projects" sections already do for the tool pages.
- **Confidence:** high

### [P1] "Work" vs "Work Projects" vs `/work-projects` — three different things sharing one word

- **Where:** `content/data/config.json:17-21`; `content/pages/projects/index.md:30`; `content/pages/work-projects.md:7`; `content/pages/work/index.md:13`
- **Problem:** The nav item **Work** goes to `/work` = "Selected Work Experience" (career history). The nav item **Projects** goes to `/projects`, whose first section is titled **"Work Projects"** and whose "View all Work Projects" button goes to `/work-projects` — a *different* page about internal tooling. So "Work" and "Work Projects" are unrelated destinations that share a word. `/work-projects` and `/tech-projects` are not orphans (both are linked from `/` and from `/projects`) but they are invisible in the nav and their content substantially duplicates the sections that link to them — the same three tool cards appear at three levels of the hierarchy.
- **Fix:** Rename the `/projects` sections so they do not collide — e.g. "Project Controls Tools" and "Experiments" — or fold `/work-projects` and `/tech-projects` into `/projects` as anchors and drop the duplicate hub pages.
- **Confidence:** high

### [P1] `/projects` puts a cheeseburger game and a comic next to $20B project-controls work

- **Where:** `/projects` (reached from the top-level nav)
- **Problem:** `/projects` is the single hub an executive reaches from the nav, and its 18 links run: Turnover Readiness Command Center, Controls Automation Toolset, Schedule + Cost Insight Layer, Marley1, boblemieux.ai, Lynda, Weather Map, Spending, FEC, **Voxelcraft**, **Flash Frenzy**, **Cheeseburgler**, **Gas Station Gummies (comic)**, NYT Digest, Emberwatch, **ObstacleBoy**. Six of sixteen are games or a comic strip. The site has to convert two audiences and this page serves neither cleanly — the exec scrolls past arcade games looking for EVM credentials, and the AI/tech visitor filters the same list to find the digital twins and edge-AI work.
- **Fix:** Split `/projects` into two clearly-labelled bands with their own headings and intros — "Project Controls & AI Systems" and "Personal / Playground" — with the playground band below the fold, or moved to its own page linked from the footer. The `/work-projects` / `/tech-projects` split already implies this structure; the hub just doesn't reflect it.
- **Confidence:** high

### [P1] `/wire` — the best AI artifact on the site — is unreachable

- **Where:** `public/wire/index.html`; nothing in `content/` or `src/` links to it
- **Problem:** "THE AI WIRE" is a genuinely well-executed Drudge-style AI news aggregator: three columns, 26 curated headlines from TechCrunch, VentureBeat, MIT Tech Review, FT and arXiv, with a splash lead. Grep confirms **zero inbound links** from any page, nav, or config — it is not in `config.json` `primaryLinks`, not on `/projects`, not on `/tech-projects`. It also has no site header, no footer, and no link back to boblemieux.ai, so a visitor who arrives by direct URL has no path into the rest of the site. For the AI/tech audience this is the strongest signal on the whole domain, and it is invisible.
- **Fix:** Add it to `/projects` and `/tech-projects` as a card, and add the site header — or at minimum a "← boblemieux.ai" link — to `public/wire/index.html`. The same applies to `/widgets/mindmap-3d.html`, which is only ever seen as an embedded iframe on `/` and is never linked as a standalone page.
- **Confidence:** high

### [P1] Dead-end pages with no onward link, and no contact CTA on any work or project page

- **Where:** `/projects/weather`, `/projects/fec`, `/projects/spending`, `/projects/nyt`, `/wire/index.html`, all `/work/*`, all `/projects/*` detail pages
- **Problem:** Counting links inside `<main>`: `/projects/weather` has **one** (maplibre.org, external); `/wire` has **zero**; `/projects/fec` and `/projects/spending` link only to their data sources; `/work/integra` has two. None link back to `/projects` or `/work`, to a related case study, or to contact. Separately, the `ContactSection` appears on `/`, `/info` and the seven blog posts — but **on none of the four `/work/*` case studies and none of the `/projects/*` detail pages**. So a visitor who arrives at a case study from LinkedIn or search reads the proof and then has nothing to do.
- **Fix:** Append a `ContactSection` (or at minimum a "Let's talk" link block) to the four `/work/*` pages and the `/projects/*` detail pages. Add an "← All projects" breadcrumb to the four TSX tool pages.
- **Confidence:** high

### [P1] The home page portrait squeezes the opening paragraph into a 124px column on mobile

- **Where:** `content/pages/index.md:18`
- **Problem:** `<img src="/images/bob.jpg" style="float: right; width: 200px; …" />` — a hard-coded pixel width with no media query. At a 380px viewport the section's content box is 348px, so the float takes 200px plus a 24px left margin and leaves **124px** for text. Measured in the browser: the first twelve lines render 2–3 words each ("Computers / have always / been my / leverage—how / I compress / time, reduce / friction, …"). This is the very first prose a mobile visitor reads.
- **Fix:** Replace the inline style with a responsive one — `width: min(200px, 40%)` at minimum, or better, drop the float below `sm` so the portrait stacks above full-width text. Best of all, move the portrait into the section's `media` slot the way `/info` already does and let `HeroSection`'s existing responsive layout handle it.
- **Confidence:** high

### [P1] `/work`'s Integra card is a screenshot of Integra's marketing website

- **Where:** `public/images/integra.jpg`, shown on `/work` and `/work/integra`
- **Problem:** The other three case-study images are proper photography (Harvard Northwest is a good dusk exterior). `integra.jpg` is a browser screenshot of Integra's own site: a hero banner reading "DATA CENTER CONSTRUCTION" over stock imagery, followed by two paragraphs of Integra's marketing copy, **cropped mid-sentence** ("…significantly reducing onsite complexity, weather delays, and risk" is sliced through), with a clipped "INTEGRA" wordmark hanging off the top edge. At 380px the text inside the screenshot is ~5px tall. On the page meant to prove current, senior, mission-critical data-center experience, the lead visual is someone else's web page — it reads as an unfinished placeholder.
- **Fix:** Replace with a project photograph, a redacted schedule/EVM artifact, or a clean logo lockup on a solid ground.
- **Confidence:** high

### [P1] The header scrolls away on an 18-screen home page

- **Where:** `content/data/config.json:9` — `"isSticky": false`
- **Problem:** `/` is 14,022px tall at 380px and 10,367px at desktop. With a non-sticky header, a visitor who has scrolled to the contact form — 18 screens down — has no navigation at all and must scroll the entire page back to the top. The mobile overlay menu is only reachable from the top of the page too, since its trigger lives in that same scrolled-away header.
- **Fix:** Set `isSticky: true`. `Header` already supports it (`sticky top-0 z-10` at `src/components/sections/Header/index.tsx:16`) — it is a one-word config change. Separately, the home page is too long: the two opening essays run 3,700px before the first link appears.
- **Confidence:** high

### [P1] `/projects/weather` shows a full-screen blank rectangle before identifying itself on mobile

- **Where:** `/projects/weather` at 380
- **Problem:** Setting aside the map being broken (P0-3), the layout puts a 641px map canvas immediately below the 97px header, with the "WEATHER MAP" heading and the "Layers ▾" control **below** it. The entire first viewport is map and nothing else. Combined with the blank render, the first screen a phone visitor sees is empty white space.
- **Fix:** Put the page title and a one-line description above the map, and cap the map at roughly `60vh` on small screens so the title and controls are both on the first screen.
- **Confidence:** high

### [P1] The nav says "Info" but the page is "About"

- **Where:** `content/data/config.json:15-19`; `content/pages/info.md:3-4` (`title: About`, `metaTitle: Bob LeMieux — About`)
- **Problem:** The page's own title, its meta title, and its H1 ("40+ years building and controlling complex projects") all present it as the About/bio page, but the nav labels it "Info". "Info" is the weakest label in a four-item nav and is exactly where a visitor looking for the bio and credentials will *not* click first — yet this page carries the $300M / $20B / Fluor / Cargill credibility copy.
- **Fix:** Rename the nav label to "About" and keep the `/info` URL (or redirect `/info` → `/about`).
- **Confidence:** high

### [P2] Tap targets below 44px throughout

- **Where:** the action-link atom used by "Learn more" / "View all", `src/components/sections/Footer/index.tsx`, MapLibre default controls
- **Problem:** Measured at 380px with a 16px root: action links 28px tall, footer links 23px, map zoom/compass buttons 29×29, newsletter checkbox 24×24, mobile-menu items ~24px of text hit area (though generously spaced). Card links themselves are 700px+ and fine, so this affects secondary navigation rather than the primary path.
- **Fix:** Add vertical padding to the action-link and footer-link styles to reach a 44px hit box (`py-2`/`py-3` with `inline-flex items-center`) without changing the visual weight.
- **Confidence:** high

### [P2] Page titles render as "… - | Bob LeMieux"

- **Where:** `src/utils/seo-utils.js:38-40`
- **Problem:** `title = \`${title} - ${site.titleSuffix}\`` and `titleSuffix` is already `"| Bob LeMieux"`, producing `Bob LeMieux — Project Controls & Scheduling Manager - | Bob LeMieux` — a stray hyphen against the pipe, plus "Bob LeMieux" twice. Confirmed in the browser tab. Currently invisible to crawlers because of P0-2, so it becomes visible the moment that is fixed.
- **Fix:** Change the separator to a space, or drop the `|` from `titleSuffix` in `config.json`. Consider suppressing the suffix entirely when `metaTitle` already contains the name.
- **Confidence:** high

### [P2] One internal link missing its trailing slash

- **Where:** `content/pages/info.md:22` — `[Harvard's Center for Brain Science](/work/harvard-brain-science)`
- **Problem:** `next.config.js` sets `trailingSlash: true`, so this is the only internal link on the site that costs a 308 round-trip. Every other internal link is generated by the component layer and already carries the slash.
- **Fix:** Add the trailing slash.
- **Confidence:** high

### [P2] `/wire/` and `/games/voxelcraft/` 404 under `next start`

- **Where:** `public/wire/index.html`, `public/games/voxelcraft/index.html`
- **Problem:** Next.js serves `public/` by exact path and does not resolve directory indexes, so `/wire/` 404s locally while `/wire/index.html` is 200. Netlify's static server does resolve indexes, so production is fine — but anyone reviewing locally, and any link written as the bare directory path, hits a 404. The site sidesteps this today only because it links `/games/voxelcraft/index.html` explicitly; `/wire/` is linked nowhere so it was never noticed.
- **Fix:** No production change needed — just be aware when testing locally. If `/wire` is added to the nav (see P1-8), link it as `/wire/index.html` or add a Netlify redirect.
- **Confidence:** high

### [P2] The 3D mind map is not usable on a phone

- **Where:** `content/pages/index.md:187` — `<iframe src="/widgets/mindmap-3d.html" style="width:100%;height:70vh;…">`
- **Problem:** At 380px the iframe renders 340×516. A pan/zoom/rotate WebGL node graph in that space cannot be read or navigated by touch, and it sits mid-page where a mobile visitor's scroll gesture is captured by the canvas.
- **Fix:** Below `md`, replace the iframe with a static image of the graph plus a "View the 3D map" link that opens `/widgets/mindmap-3d.html` full-screen.
- **Confidence:** medium

### [P2] `/wire` headlines are hard-coded and will silently go stale

- **Where:** `public/wire/index.html`
- **Problem:** 6.3KB of static HTML with zero `<script>` tags and zero `fetch` calls. The 26 headlines are dated 2026-08-20 through 2026-08-24 — three to seven days old today. The meta description claims "Curated daily." There is no visible "last updated" stamp, so a visitor cannot tell whether they are seeing today's wire or a snapshot from last year.
- **Fix:** Add a dateline under the masthead, and either automate the fetch or soften "Curated daily."
- **Confidence:** high

### [P2] The four TSX tool pages look like a different website

- **Where:** `/projects/fec`, `/projects/spending`, `/projects/weather`, `/projects/nyt`
- **Problem:** These render with a light background, system sans-serif, and Bootstrap-style blue/green buttons, against a site that is otherwise dark, gradient-backed, and set entirely in DM Mono. The site header is present but everything below it belongs to a different design system. `/projects/fec` additionally lands on an **empty results table** with no zero-state message — a visitor who doesn't realise they must type a query and press Search sees a blank grid under a "Contributions (Schedule A)" heading.
- **Fix:** Adopt the site's font and color tokens on these pages, and give `/projects/fec` a default query or an empty-state line ("Search a contributor name to begin").
- **Confidence:** high

---

## Counts

- **P0: 3** — broken contact form; empty server-rendered HTML (no title/meta/OG on any page); `/projects/weather` blank map
- **P1: 11**
- **P2: 7**
- **Broken links: 0**
