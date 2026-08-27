# Code & SEO Review
_Method: static analysis of source + rendered HTML from local prod build (`next start` @ :4321) + `npx tsc --noEmit` + `npx eslint`. Read-only; no source file was modified._

---

## Headline: the site serves no HTML

Every one of the 33 routes returns the same near-empty document:

```html
<html><head>
  <meta charSet="utf-8"/><meta name="viewport" content="width=device-width"/>
  <meta name="google-site-verification" content="BkUOl9…"/>
  …css/js links + inline :root theme vars…
</head><body><div id="__next"></div><script id="__NEXT_DATA__">…JSON…</script></body></html>
```

**0 `<title>`, 0 `<meta name="description">`, 0 `og:*`, 0 `twitter:*`, 0 `<link rel="canonical">`, 0 `<h1>`, 0 body copy, and no `lang` on `<html>` — on every route.**

Cause: `src/pages/_app.js:31` renders `{isMounted ? <Component {...pageProps} /> : null}`. `isMounted` is set in a `useEffect`, which never runs during SSR/SSG, so the page component — and the `<Head>` it owns — is not rendered into the static HTML at all. Next.js still emits `__NEXT_DATA__`, so the page hydrates and looks correct in a browser, which is why this has gone unnoticed.

Everything else in this report is downstream of that. The SEO matrix therefore has two halves: what is **served** (nothing) and what the DOM contains **after hydration**.

---

## SEO meta matrix

### A. As served (pre-JS) — identical for all 33 routes

| Route | Title | Desc | OG | Twitter | Canonical | lang |
|---|---|---|---|---|---|---|
| all 33 routes | — | — | — | — | — | — |

Verified by curl on every route in the brief. `/404` returns HTTP 404 correctly (`/404` → 308 → `/404/` → 404); `/does-not-exist/` → 404. Status codes are fine; content is not.

### B. After hydration — what the JS actually builds

`seoGenerateMetaTags()` (`src/utils/seo-utils.js:1-35`) can only ever emit **`og:title` and `og:image`**, because `site.defaultMetaTags` is never populated (absent from `content/data/config.json`) and no page in `content/**` defines `metaTags`. So the richest any content page gets is 4 head items: `title`, `description`, `og:title`, `og:image`.

Legend: OK = fine · FLAW = present but flawed · NONE = absent. Desc lengths are source characters; target 50–160.

| Route | Title (effective) | Len | Desc | OG | Twitter | Canonical |
|---|---|---|---|---|---|---|
| `/` | Bob LeMieux — Project Controls & Scheduling Manager - \| Bob LeMieux | 67 FLAW | 222 FLAW | title+img FLAW | NONE | NONE |
| `/info/` | Bob LeMieux — About - \| Bob LeMieux | 35 FLAW | 202 FLAW | title+img FLAW | NONE | NONE |
| `/work/` | Bob LeMieux — Selected Work Experience - \| Bob LeMieux | 54 FLAW | 185 FLAW | title+img FLAW | NONE | NONE |
| `/work/bp-whiting/` | BP Whiting Refinery Modernization — Bob LeMieux Project Controls - \| … | 80 FLAW | 171 FLAW | title+img FLAW | NONE | NONE |
| `/work/cpchem-cedar-bayou/` | CPChem Cedar Bayou Ethane Cracker — … - \| … | 80 FLAW | 206 FLAW | title+img FLAW | NONE | NONE |
| `/work/harvard-brain-science/` | Harvard Northwest Science Building — … - \| … | 81 FLAW | 217 FLAW | title+img FLAW | NONE | NONE |
| `/work/integra/` | Integra Mission Critical — … - \| … | 79 FLAW | 167 FLAW | title+img FLAW | NONE | NONE |
| `/work-projects/` | Work Projects - \| Bob LeMieux | 29 | **NONE** | img only FLAW | NONE | NONE |
| `/projects/` | Bob LeMieux — Projects - \| Bob LeMieux | 38 FLAW | 156 OK | title+img FLAW | NONE | NONE |
| `/projects/boblemieux-ai/` | BobLemieux.ai Personal LLM Ecosystem - \| … | 52 | **NONE** | img only FLAW | NONE | NONE |
| `/projects/controls-automation/` | Controls Automation Toolset - \| … | 43 | **NONE** | img only FLAW | NONE | NONE |
| `/projects/earth-twin/` | Earth Twin - \| Bob LeMieux | 26 | **NONE** | img only FLAW | NONE | NONE |
| `/projects/exoplanet-twin/` | Exoplanet Twin - \| Bob LeMieux | 30 | **NONE** | img only FLAW | NONE | NONE |
| `/projects/lynda/` | The Lynda Project - \| Bob LeMieux | 33 | **NONE** | img only FLAW | NONE | NONE |
| `/projects/marley1/` | Marley1 - \| Bob LeMieux | 23 | **NONE** | img only FLAW | NONE | NONE |
| `/projects/moon-twin/` | Moon Twin - \| Bob LeMieux | 25 | **NONE** | img only FLAW | NONE | NONE |
| `/projects/schedule-cost-insight/` | Schedule + Cost Insight Layer - \| … | 45 | **NONE** | img only FLAW | NONE | NONE |
| `/projects/turnover-readiness/` | Turnover Readiness Command Center - \| … | 49 | **NONE** | img only FLAW | NONE | NONE |
| `/projects/fec/` | FEC Campaign Finance Explorer — OpenFEC | 39 OK | 158 OK | NONE | NONE | NONE |
| `/projects/spending/` | Federal Award Explorer — USAspending.gov | 40 OK | 131 OK | NONE | NONE | NONE |
| `/projects/weather/` | Weather Map — Radar, Precip Type & Alerts | 41 OK | 106 OK | NONE | NONE | NONE |
| `/projects/nyt/` | NYT Daily Digest — Article Index | 32 OK | 160 OK | NONE | NONE | NONE |
| `/tech-projects/` | Tech Projects - \| Bob LeMieux | 29 | **NONE** | img only FLAW | NONE | NONE |
| `/blog/` | Bob LeMieux — Blog - \| Bob LeMieux | 34 FLAW | 121 OK | title+img FLAW | NONE | NONE |
| `/blog/post-one/` | How I Started Building in the AI Era - \| … | 52 | 166 (excerpt) FLAW | title+img FLAW | NONE | NONE |
| `/blog/post-two/` | The Great Unbundling - \| … | 36 | 197 (excerpt) FLAW | title+img FLAW | NONE | NONE |
| `/blog/post-three/` | Composable — The Future of the Web - \| … | 50 | 178 (excerpt) FLAW | title+img FLAW | NONE | NONE |
| `/blog/post-four/` | Sharing What I Have Learned After 40+ Years… - \| … | 79 FLAW | 185 (excerpt) FLAW | title+img FLAW | NONE | NONE |
| `/blog/post-five/` | AI Is So Hot Right Now 🔥 - \| … | 40 | 149 (excerpt) OK | title+img FLAW | NONE | NONE |
| `/blog/post-six/` | How I Structure and Organize a Modern Next.js Project - \| … | 68 FLAW | 134 (excerpt) OK | title+img FLAW | NONE | NONE |
| `/blog/post-seven/` | Habits of Highly Productive Developers - \| … | 54 | 154 (excerpt) OK | title+img FLAW | NONE | NONE |
| `/404` | (no Head at all) | — | NONE | NONE | NONE | NONE |

**Why each gap exists**

- **`- |` double separator.** `content/data/config.json:4` sets `"titleSuffix": "| Bob LeMieux"` (leading pipe), and `seoGenerateTitle()` (`seo-utils.js:38`) joins with a `-` separator. Result: `Home - | Bob LeMieux`. Either drop the pipe from the config value or drop the `-` from the template — not both.
- **`og:image` is always a relative path.** `seoGenerateOgImage()` (`seo-utils.js:79`) absolutises via `site.env?.URL`, but **nothing ever populates `site.env`** — `resolveStaticProps()` (`static-props-resolvers.ts:21-24`) builds `globalProps.site` straight from the `Config` content object, and `config.json` has no `env` key. So `og:image` ships as `/images/bob.jpg`. The OG spec requires an absolute URL; Facebook/LinkedIn/Slack/X will not render a relative one. The machinery is already there — it just needs `env: { URL: process.env.URL }` injected.
- **No `og:type`, `og:url`, `og:description`, `og:site_name`, no `twitter:*`.** `seo-utils.js:4` reads `site.defaultMetaTags`, and `src/types/generated.ts:426-433` even types the full `twitter:*` enum — but `config.json` never defines `defaultMetaTags`. The whole mechanism is inert. Populating that one array in `config.json` fixes all of these at once, site-wide.
- **No canonical anywhere.** `grep -rn "canonical" src/` → zero hits. Never implemented.
- **10 pages with no `metaTitle`/`metaDescription`**: 8 project pages + `tech-projects.md` + `work-projects.md`. They fall back to `title` with no description.
- **7 blog posts have no `metaDescription`** and no `featuredImage`, so they inherit the excerpt (4 of 7 exceed 160 chars) and the site-default `og:image`.
- **The 4 iframe pages** (`/projects/{fec,spending,weather,nyt}/`) bypass `seo-utils` entirely and hand-roll `<Head>` — which is why they have the *best* titles/descriptions on the site but no suffix, no OG and no canonical.

---

## Dead code inventory

| File / export | Referenced by | Verdict |
|---|---|---|
| `sections/CtaSection` (58 L) | registry only; 0 content refs | **dead** |
| `sections/MediaGallerySection` (126 L) | registry only; 0 content refs | **dead** |
| `sections/QuoteSection` (21 L) | registry only; 0 content refs | **dead** |
| `sections/TestimonialsSection` (148 L) | registry only; 0 content refs | **dead** |
| `layouts/ProjectFeedLayout` (25 L) | registry only; 0 content refs | **dead** |
| `molecules/FormBlock/SelectFormControl` (40 L) | registry only; 0 content refs | **dead** |
| `molecules/VideoBlock` (92 L) | registry only; 0 content refs | **dead** |
| `utils/get-video-data.ts` (175 L) | only `VideoBlock` (dead) | **transitively dead** |
| `utils/tree.ts` (35 L, `Tree`/`TreeNode`) | nothing, anywhere | **dead** |
| 18 of 24 `components/svgs/*` | see note | **never rendered** |
| `js-yaml` (devDep) | 0 imports | **unused dep** |
| `sections/ProjectFeedSection` | `FeaturedProjectsSection`, `RecentProjectsSection` | **alive** (do not remove) |
| `utils/highlighted-markdown.tsx` | `PostLayout`, `ProjectLayout` | alive |
| `utils/common.ts` (`isDev`) | 4 refs | alive |
| `utils/get-data-attrs.ts` | 2 refs | alive |
| `stackbit.config.ts` / `.stackbit/` | **`static-props-resolvers.ts:1-2` imports `.stackbit/models/Config` and `.stackbit/models/ThemeStyle`** | **LIVE — do not delete** |
| `graphcast_demo.ipynb` (42 KB, repo root) | nothing | leftover |

**Total directly removable: ~720 lines** across 9 files, plus 18 SVG files and one unused devDependency.

**SVG note.** `src/components/svgs/index.js` statically imports all 24 icons into an `iconMap`, consumed by string key in `atoms/Action`, `atoms/Social` and `Header/HeaderLink`. So all 24 are *technically* reachable from content and all 24 are always bundled (no tree-shaking possible through the map). In practice only **6** ever render: `instagram`, `github`, `linkedin` (from `config.json` social links) plus `close`, `menu`, `arrow-up-right` (direct imports). The other 18 — `apple`, `arrow-left`, `arrow-left-circle`, `arrow-right`, `arrow-right-circle`, `arrow-up-left`, `bluesky`, `cart`, `chevron-left`, `chevron-right`, `facebook`, `google-play`, `mail`, `play`, `play-circle`, `reddit`, `send`, `twitter`, `vimeo`, `youtube` — are dead weight in every bundle. Removing them requires pruning `iconMap` too.

**`stackbit` is not a leftover.** `next.config.js` exposes `env.stackbitPreview`, and `src/utils/static-props-resolvers.ts` imports model definitions from `.stackbit/models/`. Deleting `.stackbit/` breaks the build. `@stackbit/cms-git` and `@stackbit/types` are correctly devDependencies.

---

## Secrets audit

**CLEAN.** No credential is committed anywhere in the tracked tree.

- `.env.local` defines exactly one variable: **`FEC_API_KEY`**. It is listed in `.gitignore` and `git ls-files --error-unmatch .env.local` confirms it is **untracked**.
- Grep for `api[_-]?key|secret|token|password|bearer|DEMO_KEY` across `src/`, `content/`, `public/`, and root config files returns **no literal keys**.
- **No `NEXT_PUBLIC_*` variable exists anywhere** in the repo, so nothing is exposed to the client by construction.
- `process.env` appears in exactly one runtime path: `src/pages/api/fec.js:109` reads `FEC_API_KEY` **server-side only** and returns a clean `500` with setup instructions when absent (`fec.js:110-115`). There is no insecure fallback key.
- The other three API routes (`alerts`, `usaspending`, `wfs`) proxy **keyless** public endpoints (`api.weather.gov`, `api.usaspending.gov`, `opengeo.ncep.noaa.gov`) and read no secrets. `wfs.js:12-15` and `alerts.js` both use an upstream allow-list, so they are not open SSRF proxies.
- The standalone HTML apps under `public/` (`projects/fec`, `projects/spending`, `wire`, `widgets`, `comics`, `games`) contain no embedded keys — the FEC app calls the in-repo `/api/fec` proxy rather than OpenFEC directly.

---

## Toolchain status

- **`npx tsc --noEmit` → exit 0, zero errors.** This result is weak evidence: `tsconfig.json` sets `"strict": false` with `"allowJs": true`, and ~30 components are declared `function X(props)` with a fully implicit `any`. `WeatherMap.tsx` alone contains 30 explicit `any`s. The type system is effectively off.
- **`npx eslint src --ext .ts,.tsx,.js` → exit 2, could not run at all.** ESLint 9.21 requires flat config (`eslint.config.js`); the repo only has `.eslintrc.json`. There is also **no `lint` script in `package.json`**. Linting has been silently absent since the ESLint 9 upgrade — no rule has been enforced on this codebase in that window, so there are no warnings to report, only the fact that none can be produced.

---

## Findings

### [P0] No server-rendered HTML on any route
- **Where:** `src/pages/_app.js:31`
- **Problem:** `{isMounted ? <Component {...pageProps} /> : null}` gates the entire page tree behind a `useEffect`. SSG output contains no `<title>`, no meta, no headings, no body copy, on all 33 routes. Crawlers that do not execute JS (most social scrapers, many AI crawlers, LinkedIn/Slack/X unfurlers) see an empty page. Google will render it, but the site forfeits the crawl-priority, snippet-quality and unfurl behaviour of a static page for zero benefit.
- **Fix:** Remove the `isMounted` gate. It exists only to avoid a hydration mismatch on `data-theme`, which the `useEffect` at `_app.js:16-19` writes to `document.body`. Move that server-side: set `data-theme` in a custom `_document.js` (which the repo does not currently have) or via a tiny pre-hydration inline script, then render `<Component>` unconditionally.
- **Risk:** Behaviour change — this is the fix that makes the other 90% of this report's SEO items reachable. Watch for a hydration warning on `data-theme` and on the `style jsx global` CSS-var injection.
- **Confidence:** high

### [P1] `og:image` is emitted as a relative path, breaking every social preview
- **Where:** `src/utils/seo-utils.js:75-90`; `src/utils/static-props-resolvers.ts:21-24`
- **Problem:** `seoGenerateOgImage` absolutises using `site.env?.URL`, but `site.env` is never populated — `globalProps.site` is the raw `Config` content object and `config.json` has no `env` key. Every page ships `og:image` as `/images/bob.jpg`. OG requires absolute URLs, so no preview image renders anywhere.
- **Fix:** In `resolveStaticProps`, build `site` as `{ ...configObject, env: { URL: process.env.URL } }`. The absolutising branch at `seo-utils.js:83-85` then works with no other change. Netlify sets `URL` automatically.
- **Risk:** None; additive.
- **Confidence:** high

### [P1] `og:type`, `og:url`, `twitter:card` and all Twitter tags are never emitted
- **Where:** `src/utils/seo-utils.js:4-8`; `content/data/config.json`
- **Problem:** `seoGenerateMetaTags` reads `site.defaultMetaTags`, and `src/types/generated.ts:420-433` types the full OG + Twitter enum — but `config.json` never defines the array, and no page defines `metaTags`. So the only OG output is `og:title` + `og:image`. Without `twitter:card` X renders a bare link; without `og:type`/`og:url` the unfurl is degraded everywhere.
- **Fix:** Add `defaultMetaTags` to `content/data/config.json` with `og:type: website`, `og:site_name`, `twitter:card: summary_large_image`, `twitter:site`. Per-page `og:url`/`canonical` needs the page's own `urlPath` and is better added directly in `[[...slug]].tsx`.
- **Risk:** None; the consuming code already exists and is exercised by the two tags it does emit.
- **Confidence:** high

### [P1] No canonical URL on any route
- **Where:** `src/pages/[[...slug]].tsx:18-30`; grep for `canonical` in `src/` → 0 hits
- **Problem:** Never implemented. With `trailingSlash: true` both `/info` and `/info/` are reachable (one 308s), and `public/projects/fec/index.html` duplicates `/projects/fec/` — canonicals are the standard defence and are absent.
- **Fix:** Emit `<link rel="canonical" href={siteUrl + page.__metadata.urlPath + '/'} />` in the shared `<Head>`, and the same value as `og:url`.
- **Risk:** None if the emitted URL matches the trailing-slash form actually served. Getting it wrong is worse than omitting it — verify against the live host.
- **Confidence:** high

### [P1] No `robots.txt` and no sitemap
- **Where:** `public/` — neither `robots.txt` nor `sitemap.xml` exists; no generator in `package.json`, `next.config.js` or `netlify.toml`
- **Problem:** 33 routes with no discovery aid, and no way to exclude the iframe payload pages under `public/projects/*` from the index.
- **Fix:** Add `public/robots.txt` (allow all, `Sitemap:` line, `Disallow: /projects/fec/index.html` and `/projects/spending/index.html`). Generate the sitemap from `allContent()` — the same call `getStaticPaths` already uses — either as a `src/pages/sitemap.xml.tsx` route with `getServerSideProps`, or a build step. Do not hand-maintain it.
- **Risk:** None.
- **Confidence:** high

### [P1] No structured data anywhere
- **Where:** grep for `application/ld+json` / `schema.org` across `src/`, `content/`, `public/` → 0 hits
- **Problem:** A personal/professional site with a named subject, an employment history and 7 articles is exactly the shape structured data is for, and none is present.
- **Fix:** Add JSON-LD `<script type="application/ld+json">` blocks: a **`Person`** on `/` and `/info/` (name, jobTitle, worksFor, sameAs → the GitHub/LinkedIn URLs already in `config.json`, image); **`Article`** on each `/blog/post-*` (headline, datePublished from the existing `date` field, author ref, description); **`BreadcrumbList`** on the nested `/work/*` and `/projects/*` pages. Emit from `PostLayout`/`ProjectLayout`/`PageLayout` so it is driven by content already resolved.
- **Risk:** None; additive. Must not contradict the visible page.
- **Confidence:** high

### [P1] Title suffix renders a double separator
- **Where:** `content/data/config.json:4` + `src/utils/seo-utils.js:38`
- **Problem:** `titleSuffix` is `"| Bob LeMieux"` and the template appends `- ` before it, so every title ends `... - | Bob LeMieux`. Compounding this, 6 titles exceed ~70 chars and truncate in SERPs (`/work/harvard-brain-science/` at 81).
- **Fix:** Change `titleSuffix` to `"Bob LeMieux"` and keep the `-` separator (or switch the template to `·`). Then shorten the 6 over-length `metaTitle` values — most already repeat "Bob LeMieux" inside the title *and* get it appended again.
- **Risk:** Titles change in search results; that is the intent.
- **Confidence:** high

### [P1] 10 pages have no description; 8 more exceed 160 characters
- **Where:** `content/pages/projects/*.md` (8 files), `content/pages/tech-projects.md`, `content/pages/work-projects.md`; over-length: `index.md` (222), `harvard-brain-science.md` (217), `cpchem-cedar-bayou.md` (206), `info.md` (202), `work/index.md` (185), `bp-whiting.md` (171), `integra.md` (167), plus blog excerpts at 197/185/178/166
- **Problem:** Missing descriptions let Google synthesise a snippet from an iframe-only or thin page. Over-length ones truncate mid-sentence.
- **Fix:** Add `metaDescription` (50–160 chars) to the 10 pages that lack one; trim the 8 that are long. For blog posts, add explicit `metaDescription` rather than relying on the excerpt fallback at `seo-utils.js:47-50`, so the on-page excerpt can stay long-form.
- **Risk:** None; content-only.
- **Confidence:** high

### [P1] `glob` is imported but not declared in `package.json`
- **Where:** `src/utils/content.ts:3` (`import glob from 'glob'`), used at `content.ts:28-29`
- **Problem:** `glob` is absent from both `dependencies` and `devDependencies` — only `@types/glob` is declared. It currently resolves to a **transitively hoisted `glob@7.2.3`**. `content.ts` is the entry point for `allContent()`, which every `getStaticProps`/`getStaticPaths` in the repo calls, so if a dependency bump ever changes the hoist the entire build fails with a module-not-found.
- **Fix:** Declare it explicitly — `"glob": "7.2.3"` — matching the version currently resolved. Note `glob@9+` dropped the default export and `.sync()`, so do **not** let a caret range pull v9+ without also rewriting `content.ts:28-29`.
- **Risk:** None if pinned to 7.2.3; a major bump is a breaking API change.
- **Confidence:** high

### [P1] ESLint has not run since the v9 upgrade
- **Where:** `.eslintrc.json`; `package.json` scripts
- **Problem:** ESLint 9.21 requires `eslint.config.js` flat config; the repo has only `.eslintrc.json`, so `npx eslint src` exits 2 without linting a single file. There is also no `lint` script, so nothing in CI or local workflow would surface this.
- **Fix:** Migrate to `eslint.config.mjs` using `FlatCompat` to wrap `next/core-web-vitals` (keeping the existing `@next/next/no-img-element: off` override), and add `"lint": "next lint"` to scripts. Expect a backlog on first run given ~30 components with implicit-`any` props.
- **Risk:** Low. The first clean run will produce noise; fix errors and triage warnings separately.
- **Confidence:** high

### [P1] Every internal link costs a 308 redirect hop
- **Where:** `next.config.js:7` (`trailingSlash: true`) vs `content/data/config.json:16,21,26,31,69,81` and `src/utils/content.ts:109` (`urlPath`)
- **Problem:** `trailingSlash: true` makes `/info/` canonical, but every internal href omits the slash. `config.json` nav/footer links are `/info`, `/work`, `/projects`, `/blog`; and `__metadata.urlPath` is generated *without* a trailing slash (`"urlPath":"/blog/post-one"` in the served `__NEXT_DATA__`), so **every** post card, project card and work card links to the redirecting form too. `atoms/Link/index.tsx:23-27` passes the href straight to `next/link` with no normalisation. Confirmed: `curl /info` → 308. Every navigation and every crawl of an internal link is a wasted round trip.
- **Fix:** Cheapest durable option — normalise in one place, `atoms/Link`: append `/` to internal hrefs that lack one (excluding those with `#`/`?`). Alternatively append the slash in `contentUrl()` at `content.ts:109` and fix the 6 literal hrefs in `config.json`.
- **Risk:** No URL changes — the destination is identical, only the hop is removed. Verify anchors and query strings are not mangled.
- **Confidence:** high

### [P1] Duplicate titles between the Next pages and their iframe payloads
- **Where:** `public/projects/fec/index.html` vs `src/pages/projects/fec.tsx:15`; `public/projects/spending/index.html` vs `spending.tsx:13`
- **Problem:** Both pairs carry byte-identical `<title>` values (`FEC Campaign Finance Explorer — OpenFEC`, `Federal Award Explorer — USAspending.gov`) and both URLs return 200. With no canonical and no robots rules, Google may index the raw payload instead of the styled page. Separately, all four iframe pages have **zero indexable body content** — the substance lives inside a cross-document iframe, which is not attributed to the parent.
- **Fix:** Add `<meta name="robots" content="noindex">` to the two `public/projects/*/index.html` payloads and `Disallow` them in `robots.txt`. Then give each of the four parent pages a real intro paragraph above the iframe so there is something to rank.
- **Risk:** None. The payloads are only ever loaded via iframe, which `noindex` does not affect.
- **Confidence:** high

### [P1] No `lang` attribute on `<html>`
- **Where:** no `src/pages/_document.*` exists
- **Problem:** Served HTML is `<html>` with no `lang`. Accessibility (screen-reader pronunciation) and a basic SEO signal.
- **Fix:** Add `src/pages/_document.js` with `<Html lang="en">`. This is the same file the P0 theming fix wants, so do both at once.
- **Risk:** None.
- **Confidence:** high

### [P2] ~720 lines of dead components and utils
- **Where:** the 9 files in the Dead code inventory above
- **Problem:** Starter-template surface that no content references and nothing imports. It inflates the registry, the type union and the mental model of the codebase.
- **Fix:** Delete the 9 files, remove their entries from `components-registry.tsx`, drop `js-yaml` from devDependencies. Prune the 18 unused SVGs together with their `iconMap` entries in `svgs/index.js` (they are statically imported, so they ship in every bundle today). Leave `.stackbit/` and `stackbit.config.ts` alone — `static-props-resolvers.ts:1-2` imports from them at build time. `graphcast_demo.ipynb` (42 KB at the repo root) is unreferenced and belongs in a notebooks repo.
- **Risk:** Low, but `ProjectFeedSection` is **alive** (re-exported by `RecentProjectsSection`, wrapped by `FeaturedProjectsSection`) — do not delete it along with the dead `ProjectFeedLayout`. Removing a registry entry that content later references throws at render (`components-registry.tsx:38`).
- **Confidence:** high

### [P2] `PostFeedSection` and `ProjectFeedSection` are ~77% identical
- **Where:** `src/components/sections/PostFeedSection/index.tsx` (187 L) vs `src/components/sections/ProjectFeedSection/index.tsx` (170 L)
- **Problem:** Of 357 combined lines only **56 differ**; roughly **130 lines are duplicated**. Identical import block, identical props destructure, identical `Section` wrapper, identical grid/list/variant logic. The only real differences are the identifier prefix (`Post`/`Project`) and the attribution fields (`showAuthor`/`showExcerpt`/`author`/`excerpt` vs `showDescription`/`description`).
- **Fix:** Extract one generic `ItemFeedSection` taking the item array plus a small render-config for the attribution block; keep `PostFeedSection`/`ProjectFeedSection` as thin typed wrappers. Note the alias layer is already done well and is **not** the problem: `RecentPostsSection` and `RecentProjectsSection` are 2-line re-exports, `FeaturedPostsSection`/`FeaturedProjectsSection` are 4-line pass-throughs. The six "near-identical sections" are really two implementations plus four correct aliases.
- **Risk:** Medium — this is the most-rendered component on the site. Purely internal; no URL or markup change if done carefully.
- **Confidence:** high

### [P2] The four API routes duplicate their scaffolding and diverge on error handling
- **Where:** `src/pages/api/{alerts,fec,usaspending,wfs}.js`
- **Problem:** All four define their own identical `CORS` object and `applyCors()` (`alerts.js:21,27`; `fec.js:42,48`; `usaspending.js:20,26`; `wfs.js:17,23`). Only `fec.js:52` and `usaspending.js:30` define a `sendJson()` helper; `wfs.js` and `alerts.js` hand-roll `res.setHeader` + `res.status().json()` instead. Only `fec.js:105` rejects non-GET with a 405 — the other three accept any verb. Upstream-failure codes are inconsistent, and `wfs.js:68` leaks `String(err)` into the response body.
- **Fix:** Extract `src/pages/api/_shared.js` with `applyCors`, `sendJson`, a `methodGuard`, and one upstream-fetch wrapper with a consistent error shape. Stop returning raw `err` strings to clients.
- **Risk:** Low; these are internal proxies with a small surface.
- **Confidence:** high

### [P2] Mixed `.js`/`.tsx` and an effectively disabled type system
- **Where:** `tsconfig.json:5` (`"strict": false`), `:4` (`"allowJs": true`); `src/pages/_app.js`, `src/utils/seo-utils.js`, `src/pages/api/*.js`, `src/components/svgs/index.js`
- **Problem:** `tsc --noEmit` passes cleanly, but that is meaningless here: `strict` is off and ~30 components declare `function X(props)` with an implicit `any`. `WeatherMap.tsx` has 30 explicit `any`s; the four project pages each type their props as `props: any`. `seo-utils.js` is plain JS with no types despite being on the critical SEO path, and `_app.js` is the file holding the P0 bug.
- **Fix:** Convert `_app.js` → `_app.tsx` and `seo-utils.js` → `seo-utils.ts` first (highest value: they are the SEO path). Then enable `strict` incrementally — `noImplicitAny` first — and type the section components against the existing `src/types/generated.ts` models, which are already accurate and largely unused.
- **Risk:** Medium if done in one pass; low if incremental. No runtime change.
- **Confidence:** high

### [P2] `WeatherMap` styling escapes the CSS-module system
- **Where:** `src/components/projects/WeatherMap/WeatherMap.module.css` (379 L, **60** `:global(...)` selectors); `WeatherMap.tsx` uses `styles.wrapper` once and 18 literal class strings
- **Problem:** Not broken — every literal class is covered by a `.wrapper :global(...)` rule, so scoping holds. But it is the only CSS module in an otherwise fully Tailwind codebase, and it uses `:global` for 60 of its selectors, i.e. it opts out of the very mechanism it is using. Any future rename of a literal class string silently loses its styles with no type or lint error.
- **Fix:** Low priority. If touched, prefer `styles.x` bindings over literal strings, or move the panel chrome to Tailwind and keep the module only for the MapLibre overrides that genuinely need global reach.
- **Risk:** Medium if rewritten — 886-line component with a lot of imperative DOM work.
- **Confidence:** high

### [P2] `/projects/weather` has no visible error state
- **Where:** `src/components/projects/WeatherMap/WeatherMap.tsx:796`
- **Problem:** `map.on('error', (e) => console.warn('map error', e && e.error))` is the only error path — a map that fails to initialise renders an empty box with nothing in the UI to explain it. Everything inside the `map.on('load')` callback (`:757-795`) — alert layers, WMS rasters, legends, control wiring, the 5-minute refresh — is skipped silently if `load` never fires.
- **Fix:** Render a visible fallback on `error` and on a `load` timeout. **No API key is involved**: the basemap is `https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json` (`:176`), which is keyless, and every data source is a keyless public NOAA/NWS endpoint proxied through `/api/{alerts,wfs}`. Static analysis found no cause for `load` not firing; runtime diagnosis (console/network) is required and belongs to whoever holds the browser.
- **Risk:** None for adding the error state.
- **Confidence:** high (on the no-key finding); low (on the `load` root cause — not determinable statically)

### [P2] `netlify.toml` redirects are correct; one orphan page
- **Where:** `netlify.toml`; `public/wire/index.html`
- **Problem:** The redirect rules are sound — the `/projects/nyt/embed` proxy is deliberately scoped so it cannot shadow the Next page at `/projects/nyt/`, and the `/games/obstacleboy/*` rule with `force = true` correctly wins over the catch-all `[[...slug]].tsx`. The in-file comments explain the trailing-slash and `<base>` reasoning accurately. **No shadowing defect found.** Separately, `public/wire/index.html` ("THE AI WIRE") is reachable and indexable but has **no inbound link** from any page. The games and comic *are* linked (`content/pages/projects/index.md:174,204,220,267`).
- **Fix:** Either link `/wire/` from the projects page or add it to `robots.txt`. No change needed to `netlify.toml`.
- **Risk:** None.
- **Confidence:** high

### [P2] Content inconsistency in `info.md`
- **Where:** `content/pages/info.md:26-28` and `content/pages/info.md:188-190`
- **Problem:** Both passages list "ExxonMobil Baytown Expansion, Dow LHC-9, BP Whiting Refinery, and Chevron Phillips Hydrocracker", but the site's own detailed page `content/pages/work/cpchem-cedar-bayou.md` documents that engagement as the **Chevron Phillips Chemical Cedar Bayou Ethane Cracker in Baytown, Texas** — not a hydrocracker, and Baytown is the CPChem site. The two list entries look like one real engagement split into two garbled ones. The string appears **twice**, so any correction must touch both locations.
- **Fix:** Replace both entries with a single accurate line. Also: `info.md:21` claims projects "directly led ... up to $300M" while `info.md:170` describes "$400M+ annual capital programs at Cargill" — reconcile the framing. Other figures check out: "26 years at Fluor" matches the stated 1991–2017, and the $300M–$20B range is used consistently in `info.md:21` and `work/index.md:8`.
- **Risk:** Content-only; no URL change.
- **Confidence:** med (factual reconciliation needs the author's confirmation)

---

## Note on blog slugs

`/blog/post-one` … `/blog/post-seven` are generic and keyword-free while the titles are substantive ("How I Structure and Organize a Modern Next.js Project", "Habits of Highly Productive Developers"). Slugs are a real ranking and click-through signal, so this is a genuine defect. The fix is a slug rename plus 301 redirects from the old paths. **This changes URLs** — it invalidates any existing inbound links and shares, and needs redirect rules in `netlify.toml`. Flagged, not recommended unilaterally.

---

## Counts

| Severity | Count |
|---|---|
| **P0** | 1 |
| **P1** | 10 |
| **P2** | 8 |

The single P0 gates most of the P1 list: until `_app.js` renders server-side, no amount of meta-tag work reaches a crawler that does not execute JavaScript.
