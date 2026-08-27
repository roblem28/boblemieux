# Design Review
_Method: design tokens + content frontmatter + component source + image assets. Server HTML is empty (known P0), so no rendered-markup or browser inspection._

## Verdict in one paragraph

This is a Stackbit/Netlify "personal" starter kit with Bob's copy poured into it. The *machinery* is fine — the type scale is coherent, the section components are sane, the Tailwind mapping is tidy. Almost nothing above that layer was decided. Four of the six palettes are never selected; the two brand colours defined in `style.json` are never rendered anywhere on the site; the favicon is still the template's letter "P"; five project pages ship abstract gradient wallpapers (`bg1/bg2/bg3.jpg`) as their featured images, two of them duplicated across pairs of projects; and the owner's portrait is an AI-generated comic caricature in mirrored sunglasses. The result reads as *assembled*, not designed — which is a direct credibility cost with the construction-executive audience, and reads as unfinished to the AI/tech audience.

## Page ratings

| Page | Score /5 | One-line verdict |
|---|---|---|
| `/` | 2 | Two competing `<h1>`s at 60px, a 118-character line length, no name or role above the fold, and container width jumping 1280→1024→1280. |
| `/info` | 2 | Its `<h1>` is a markdown `#` inside prose (~40px) while every other page's is `text-6xl` (60px); divider padding oscillates 8/12/12/8/12 with no pattern. |
| `/work` | 3 | Clean and restrained, but `pt-16/pb-8` then `pt-8/pb-24` makes the page bottom-heavy, and it drops the divider language `/` and `/info` use. |
| `/work/bp-whiting` | 3 | Best photograph on the site; undercut by ProjectLayout setting the whole description paragraph in uppercase mono. |
| `/work/cpchem-cedar-bayou` | 3 | As above. |
| `/work/harvard-brain-science` | 3 | Real architectural photo, but letterboxed and soft (upscaled), and a different aspect ratio from its three siblings. |
| `/work/integra` | 2 | Featured image is a screenshot of Integra's own marketing page — their logo, their headline, their body copy, baked in as a portfolio thumbnail. |
| `/work-projects` | 3 | `columns: 1` turns three ~120-word blocks into full-width walls of monospace; zero imagery. |
| `/tech-projects` | 2 | `recentCount: 6` shows *fewer* projects than the `/projects` index that links to it; empty subtitle; no framing at all. |
| `/projects` | 2 | 14 hand-authored cards with inconsistent `subtitle:` usage, duplicate `bg2`/`bg3` thumbnails side by side, and three different padding regimes in three sections. |
| `/projects/boblemieux-ai` | 1 | Featured image is `bg2.jpg`, an abstract gradient wallpaper — shared with `controls-automation`. |
| `/projects/controls-automation` | 1 | Same `bg2.jpg`. Two projects, one meaningless blob. |
| `/projects/schedule-cost-insight` | 1 | `bg3.jpg` gradient — shared with `lynda`. |
| `/projects/lynda` | 1 | Same `bg3.jpg`. |
| `/projects/turnover-readiness` | 1 | `bg1.jpg` gradient. The flagship work project is illustrated with template wallpaper. |
| `/projects/marley1` | 1 | A cluttered phone snapshot of a desk used as a full-page `backgroundImage` at `opacity: 75` behind body text on a black page. |
| `/projects/earth-twin` | 2 | Screenshot with the app's own keyboard-shortcut HUD baked into the bottom edge. |
| `/projects/exoplanet-twin` | 2 | Same category of uncleaned screenshot. |
| `/projects/moon-twin` | 2 | Same. |
| `/blog` | 3 | The most disciplined page on the site — `narrow`, consistent, restrained. |
| `/blog/post-one` … `post-seven` | 2 | All seven carry `pb-56` (224px) of dead black under Recent Posts, then a `pt-24` contact form: ~320px of empty space at every post's foot. |
| `/projects/weather` | 2 | `px-4 py-8` against the site's `pt-16`; no `<h1>` in the body at all — the map just appears under the header. |
| `/projects/fec` | 2 | Same pattern. |
| `/projects/spending` | 2 | Same pattern. |
| `/projects/nyt` | 2 | Same pattern. |
| `/wire/index.html` | 1 | Courier on `#fff` — inverse polarity and a different monospace from the site's DM Mono on `#000`. Does not read as the same site. |
| `/games/cheeseburgler.html` | 2 | Competent on its own; Nunito + Titan One, purple and cheese-yellow — no relationship to the site. |
| `/comics/gas-station-gummies.html` | 3 | Genuinely well-made Silver-Age pastiche; Bangers + Marvel red/yellow/blue. Alien to the site by design, which is defensible here. |
| `/widgets/mindmap-3d.html` | 2 | Segoe UI system sans and `#0a0e14` — and it is iframed into the homepage, so the mismatch is visible on the site's most important page. |

## Padding / rhythm audit

Container widths: `narrow` = `max-w-5xl` (1024px), `wide` = `max-w-7xl` (1280px) — `src/utils/map-styles-to-class-names.ts:95-97`. Sections with no `styles` block fall back to `py-12 px-4` and `width: wide` (`src/components/sections/Section/index.tsx:58,67`).

| Page | Section | padding (pt/pb) | width | Outlier? |
|---|---|---|---|---|
| `/` index.md:48 | HeroSection "Digital Leverage" | 16 / 16 | wide | baseline |
| `/` index.md:59 | Divider | 8 / 8 | wide | |
| `/` index.md:95 | HeroSection "Project Leadership" | 16 / 16 | wide | second `<h1>` on the page |
| `/` index.md:106,176,205,276,309,347 | Divider ×6 | 8 / 8 | wide | consistent — good |
| `/` index.md:166 | FeaturedItems "What I Build" | 16 / 16 | wide | |
| `/` index.md:195 | TextSection (3D map iframe) | 16 / 16 | wide | |
| `/` index.md:266 | FeaturedItems "Work Projects" | 16 / 16 | wide | |
| `/` index.md:299 | RecentProjects "Tech Projects" | 16 / 16 | wide | |
| `/` index.md:337 | FeaturedPosts | 16 / 16 | **narrow** | **YES — width drops 1280→1024 mid-page** |
| `/` index.md:408 | ContactSection | 16 / 16 | **narrow** | **YES — same jump** |
| `/info` info.md:46 | HeroSection | 16 / **12** | wide | **YES — asymmetric; every other hero is 16/16 or 16/8** |
| `/info` info.md:57 | Divider | 8 / 8 | wide | |
| `/info` info.md:84 | FeaturedProjects | 8 / 8 | wide | |
| `/info` info.md:94 | Divider | **12 / 12** | wide | **YES — dividers on this page are 8, 12, 12, 8, 12** |
| `/info` info.md:100 | **LabelsSection — no `styles` at all** | 12 / 12 (default) | wide (default) | **YES — unstyled, inherits the fallback** |
| `/info` info.md:133 | Divider | 12 / 12 | wide | |
| `/info` info.md:139 | **TextSection — no `styles` at all** | 12 / 12 (default) | wide (default) | **YES — unstyled** |
| `/info` info.md:152 | Divider | 8 / 8 | wide | **YES — back to 8 after two 12s** |
| `/info` info.md:231 | FeaturedItems (Experience) | 8 / 8 | wide | |
| `/info` info.md:241 | Divider | 12 / 12 | wide | |
| `/info` info.md:302 | ContactSection | 12 / 12 | narrow | |
| `/work` work/index.md:26 | HeroSection | 16 / 8 | wide | |
| `/work` work/index.md:48 | FeaturedProjects | 8 / **24** | wide | |
| `/work-projects` :18 | HeroSection | 16 / 8 | wide | matches `/work` |
| `/work-projects` :94 | FeaturedItems | 8 / 24 | wide | matches `/work` |
| `/tech-projects` :18 | HeroSection | 16 / 8 | wide | matches |
| `/tech-projects` :36 | RecentProjects | 8 / 24 | wide | matches |
| `/projects` :23 | HeroSection | 16 / 8 | wide | matches |
| `/projects` :80 | FeaturedItems "Work Projects" | 8 / **12** | wide | **YES — siblings all use 8/24 here** |
| `/projects` :282 | FeaturedItems "Tech Projects" | **12** / 24 | wide | **YES — only section on the site starting at pt-12 in an index** |
| `/blog` :39 | HeroSection | 16 / 16 | **narrow** | **YES — the only index page at `narrow`; `/work`, `/projects` are `wide`** |
| `/blog` :22 | PostFeedSection | **0** / 12 | narrow | `pt-0` |
| `/blog/post-*` :24 | RecentPostsSection | 12 / **56** | wide | **YES — 224px of dead space, on all seven posts** |
| `/blog/post-*` :74 | ContactSection | **24** / 24 | wide | **YES — stacks with the pb-56 above it: ~320px of empty black** |
| Footer, config.json:111 | Footer | 16 / 16 | narrow | |
| `/projects/{fec,spending,weather,nyt}` weather.tsx:22 | page body | **`py-8`** | none | **YES — half the top padding of every content page, and no max-width** |

**The two clearest rhythm defects:** (1) `/info` alternates its `DividerSection` padding 8 → 12 → 12 → 8 → 12 with no pattern, while `/` holds all seven of its dividers at 8/8 — so the site's two most-visited pages have visibly different section rhythm, and one of them is internally inconsistent. (2) Every blog post ends with `pt-12/pb-56` followed by `pt-24/pb-24`, which is ~320px of empty black between the last post card and the sign-up form.

## Findings

### [P0] The site's own portrait is an AI-generated caricature
- **Where:** `public/images/bob.jpg`, referenced at `content/data/config.json:5` (`defaultSocialImage`), `content/pages/index.md:9,18`, `content/pages/info.md:9,34`, `content/pages/work/index.md:9`, `content/pages/blog/index.md:8`
- **Problem:** The image is an AI-generated comic-book illustration of a scowling man in mirrored sunglasses on an orange field, cropped from below the chin. It is the `socialImage` for every page (so it is what appears in LinkedIn and Slack unfurls), it is floated at 200px into the homepage hero, and it is the hero media on `/info`. For a 45-year civil engineer asking data-center executives to trust him with schedule and EVM on a billion-dollar program, this is the single most expensive visual decision on the site. It is also stylistically unrelated to everything else, which is monochrome black and off-white.
- **Fix:** One real photograph — plain head-and-shoulders, neutral background, no sunglasses. Keep the caricature if he likes it, but demote it to a blog or personality context, never to `defaultSocialImage`.
- **Confidence:** high

### [P0] Five project pages ship template gradient wallpaper as their featured image, two of them duplicated
- **Where:** `content/pages/projects/turnover-readiness.md:13,17` (`bg1.jpg`); `controls-automation.md:13,17` and `boblemieux-ai.md:13,17` (both `bg2.jpg`); `schedule-cost-insight.md:13,17` and `lynda.md:13,17` (both `bg3.jpg`)
- **Problem:** `bg1/bg2/bg3.jpg` are the starter kit's abstract blurred-gradient wallpapers. They carry no information about the projects and are off-brand (bg3 is yellow-to-magenta-to-purple against a black-and-off-white site). Worse, `bg2` and `bg3` are each used by *two* projects, so on `/projects` and `/tech-projects` the grid renders visibly duplicated thumbnails in the same viewport. Turnover Readiness and the Controls Automation Toolset are the two strongest credibility assets on the site and both are illustrated with wallpaper.
- **Fix:** Screenshot the actual artefacts — a turnover dashboard, an Excel/VBA rollup, a P6 Gantt, the insight-layer output. Redacted if needed. Anything real beats a gradient. Delete `bg1/bg2/bg3.jpg` so they cannot be reached for again.
- **Confidence:** high

### [P0] `/projects/marley1` puts a cluttered desk snapshot behind the body text at 75% opacity
- **Where:** `content/pages/projects/marley1.md:5-11`
- **Problem:** `backgroundImage` with `backgroundSize: cover` and `opacity: 75` — a handheld phone photo of a Raspberry Pi and 3D-printed toys on a wood desk, stretched to cover the page, at 75% opacity behind off-white body copy. Busy midtones (pale yellow prints, wood grain, white cables) under `#FBFFF2` text is a legibility failure, not a stylistic choice. This is the only page on the site with a background image, so it also breaks the page-to-page rhythm.
- **Fix:** Remove the `backgroundImage` block. Keep `marley1.jpg` as `featuredImage`/`media` only — it already is, at lines 18-25.
- **Confidence:** high

### [P1] Both brand colours are defined and never rendered; four of six palettes are dead
- **Where:** `content/data/style.json:7-10`; `src/css/main.css:62-88`; every `colors:` value in `content/pages/**`
- **Problem:** Only two palette values appear anywhere in content: `colors-a` at page level and `colors-f` on every single section (65 occurrences, no exceptions). `colors-f` has *no* rule in `main.css` — line 86 explicitly excludes it from `bg-main text-main` — so it inherits, and every section falls through to the page-level `colors-a` = `--theme-dark` (`#000000`) on `--theme-on-dark` (`#FBFFF2`). `colors-c` (primary `#0804F6`) and `colors-d` (secondary `#FE491F`) are never selected on any page. Buttons do not help: `src/components/atoms/Action/index.tsx:30` uses `border-2 border-current`, i.e. currentColor. **Net effect: the saturated blue and the orange-red exist only in `style.json`. The rendered site is pure black and off-white, everywhere, with no accent colour at all.** There is no alternation to assess because there is no alternation.
- **Fix:** Either commit to the monochrome (then delete `primary`/`secondary` or repoint them, so the tokens tell the truth) or actually use them — one accent on links and buttons, and `colors-c` or `colors-d` on one or two deliberate full-bleed sections to break the scroll. On the pairing itself: `#0804F6` and `#FE491F` are both near-maximum chroma and near-complementary; as adjacent large fields they will vibrate badly. As a single accent against black, `#FE491F` is the safer of the two — `#0804F6` on `#000000` is close to unreadable at body sizes.
- **Confidence:** high

### [P1] The favicon is the template's letter "P", filled black
- **Where:** `public/images/favicon.svg`, referenced `content/data/config.json:3`
- **Problem:** The SVG is a single glyph — a "P" — with `fill="#000"`. Two defects: it is the wrong letter for "Bob LeMieux" (it is the starter kit's mark), and being pure black it disappears on dark browser-tab chrome and against the site's own `#000000` background. The site's identity mark is a leftover.
- **Fix:** A "B", or a simple monogram, in `#FBFFF2` or a colour that survives both tab themes.
- **Confidence:** high

### [P1] The wordmark is spelled two different ways
- **Where:** `content/data/config.json:10` (`"title": "Bob Lemieux"`) and `:107` (`"copyrightText": "(c) 2026 Bob Lemieux"`), versus `:4` (`"titleSuffix": "| Bob LeMieux"`) and every page's `metaTitle`
- **Problem:** The header logotype and the footer copyright — the two most repeated instances of his name on the site — use "Lemieux", while the browser title bar and all metadata use "LeMieux". The header renders at `text-base tracking-widest uppercase` (`src/components/sections/Header/index.tsx:179`), so uppercase masks it in the header but not in the footer.
- **Fix:** "LeMieux" everywhere.
- **Confidence:** high

### [P1] The homepage hero runs body copy at ~118 characters per line
- **Where:** `content/pages/index.md:41` (`width: wide`) + `src/components/sections/HeroSection/index.tsx:38` (`max-w-none prose sm:prose-lg`)
- **Problem:** `max-w-none` strips Tailwind Typography's built-in measure cap, and `width: wide` is `max-w-7xl` = 1280px. At `prose-lg` (18px) in DM Mono — average advance ~0.6em — that is roughly 118 characters per line, about double the readable maximum. The homepage's opening hero is a single unbroken ~250-word paragraph at that measure, and the second hero ("Project Leadership", `index.md:88`) repeats it. The same component behaves correctly on `/info` (`info.md:39`), because that hero *has* `media`, so the text sits in a `flex-1` half-column at ~640px / ~59 characters. Identical component, identical settings, double the measure — purely because one has an image and one does not.
- **Fix:** Set those two heroes to `width: narrow`, or give them media, or break the paragraphs. Also consider removing `max-w-none` from HeroSection so prose's own measure applies.
- **Confidence:** high

### [P1] Two h1s on the homepage; `/info`'s h1 is a third size
- **Where:** `src/components/sections/HeroSection/index.tsx:26`; `content/pages/index.md:16,69`; `content/pages/info.md:16`
- **Problem:** HeroSection emits `<h1 class="text-5xl sm:text-6xl">` unconditionally, and `index.md` stacks two HeroSections, so the homepage has two 60px h1s of equal weight ("DIGITAL LEVERAGE" and "PROJECT LEADERSHIP") with no primary. Neither contains his name or his role. Meanwhile `/info` gives its HeroSection no `title:` at all and writes the heading as a markdown `#` inside the `text` field, so it renders through the `prose sm:prose-lg` pipeline at roughly 40px — visibly smaller than the `text-6xl` heading on `/work`, `/projects`, `/blog`, `/work-projects` and `/tech-projects`. Three different treatments for the same structural element.
- **Fix:** One h1 per page. Give `/info` a real `title:`. Make the homepage's first heading say who he is.
- **Confidence:** high

### [P1] ProjectLayout sets whole description paragraphs in uppercase monospace
- **Where:** `src/components/layouts/ProjectLayout/index.tsx:48` (`text-lg uppercase sm:text-xl`), also `:39` and `:98`
- **Problem:** The `description` field is not a label — on `content/pages/work/integra.md:7-11` it is three full sentences, and it renders entirely in caps. Uppercase monospace at 18-20px for a multi-sentence paragraph removes ascender/descender word-shape cues and stretches the line by roughly 15%; it is the hardest combination to read this stack can produce. It affects every `/work/*` and `/projects/*` page.
- **Fix:** Drop `uppercase` from line 48. Keep it on the `client` eyebrow (line 39) and the nav labels (line 98), where short strings make it a deliberate device rather than a readability tax.
- **Confidence:** high

### [P1] Post and project headers are outdented 8rem to the left of the body they introduce
- **Where:** `src/components/layouts/PostLayout/index.tsx:21` (`max-w-5xl mx-auto`) vs `:41` (`max-w-3xl mx-auto`); same pattern at `src/components/layouts/ProjectLayout/index.tsx:38,51` vs `:48,58`
- **Problem:** Both layouts centre a `max-w-5xl` (1024px) header over a `max-w-3xl` (768px) body. Because both are `mx-auto`, the title's left edge sits 128px left of the body text's left edge on any viewport above ~1024px. Every blog post and every work/project page has a title and date visibly hanging off the left of the article. The `media` figure is also `max-w-5xl` while the prose is `max-w-3xl`, so image edges stick out too — three different left edges stacked down one page.
- **Fix:** Pick one measure. Either bring the header to `max-w-3xl`, or make the outdent large and intentional rather than a 128px accident.
- **Confidence:** high

### [P1] Every blog post ends with ~320px of empty black
- **Where:** `content/pages/blog/post-one.md:24-25,74-75` and the identical values in `post-two` through `post-seven`
- **Problem:** `pb-56` is 14rem = 224px, then the following ContactSection's `pt-24` adds 96px — about 320px of unbroken black between the last recent-post card and the sign-up form, on all seven posts identically. `pb-56` appears nowhere else in the repo; it is a value nobody revisited.
- **Fix:** `pb-16` on the RecentPostsSection. It will match the homepage's rhythm.
- **Confidence:** high

### [P1] `/work/integra`'s featured image is a screenshot of Integra's marketing page
- **Where:** `public/images/integra.jpg`, referenced `content/pages/work/integra.md:14,18,25`
- **Problem:** The file is a web/brochure capture: Integra's trademarked wordmark top-left, a two-line display headline, and two paragraphs of *their* marketing body copy, all baked into a raster. As a design object it fails at card size (the body copy becomes noise), its aspect ratio (~7:6) matches none of its three siblings (`bp-whiting.jpg` is ~16:10, `harvard-nw.jpg` ~16:9), and it puts someone else's brand where Bob's portfolio thumbnail should be. It is also the `socialImage`, so their logo is what unfurls.
- **Fix:** Replace with a photograph of the work, a neutral data-centre image, or a plain typographic card. Do not ship an employer's marketing page as a portfolio tile.
- **Confidence:** high

### [P1] The four static HTML pages do not belong to this site
- **Where:** `public/wire/index.html:9`; `public/games/cheeseburgler.html:19-22`; `public/comics/gas-station-gummies.html:37-45`; `public/widgets/mindmap-3d.html:9,13`
- **Problem:** Four pages, four unrelated type systems and palettes, none of them the site's DM Mono on `#000000`:
  - `/wire` — `background:#fff;color:#000;font-family:Courier` — inverse polarity *and* a different monospace. It reads as a 1998 plaintext dump, not a page of this site.
  - `/games/cheeseburgler.html` — Nunito + Titan One, purple and cheese-yellow.
  - `/comics/gas-station-gummies.html` — Bangers, Marvel red/yellow/blue. Genuinely well-crafted; the pastiche justifies the break.
  - `/widgets/mindmap-3d.html` — `background:#0a0e14` and `font-family:'Segoe UI',system-ui` — the default Windows system stack, on a near-black that is *not* the site's black.
  The mindmap is the serious one, because `content/pages/index.md:187-189` iframes it into the homepage. `#0a0e14` inside a `#000000` page renders as a visible dark-grey rectangle, and the widget's Segoe UI labels sit inside a page that is otherwise entirely monospace.
- **Fix:** At minimum set the mindmap's background to `#000000` and its font to DM Mono so it disappears into the homepage. Give `/wire` the site's black/off-white/DM Mono. Leave the comic and the game alone — they are meant to be their own thing, but they should be reachable only from `/projects`, never presented as site pages.
- **Confidence:** high

### [P1] The four code-driven project pages have no page heading and half the top padding
- **Where:** `src/pages/projects/weather.tsx:22` (`px-4 py-8`) and the equivalent in `fec.tsx`, `spending.tsx`, `nyt.tsx`
- **Problem:** `py-8` is 32px against the `pt-16` (64px) that opens every content page, and there is no h1, no description, and no `max-w-*` container — only a `<title>` tag in `<head>`. A visitor arriving from the `/projects` grid lands on a bare map or table with no framing, no title, and no visual continuity with the page they came from. They read as demos bolted on, not portfolio pieces.
- **Fix:** Wrap each in the same header treatment ProjectLayout uses — client/date eyebrow, `text-5xl sm:text-6xl` h1, description — and match `py-14 lg:py-20`.
- **Confidence:** high

### [P1] Imagery has no consistent treatment
- **Where:** `public/images/*`
- **Problem:** Nine content images, at least five unrelated treatments and five aspect ratios: an AI comic illustration (`bob.jpg`, 2:3), a professional aerial photograph (`bp-whiting.jpg`, ~16:10 — easily the best asset on the site), a soft upscaled architectural photo with letterbox bars (`harvard-nw.jpg`, ~16:9), a marketing-page screenshot (`integra.jpg`, ~7:6), a handheld phone snapshot (`marley1.jpg`, ~1:1), and app screenshots with the app's own UI chrome still in frame — `earthtwin.jpg` has its keyboard-shortcut HUD ("Scroll=zoom, Drag=tilt, N=night, T=terrain, C=clouds, A=atm, B=buildings, S=spin, L=locate") baked into the bottom edge — plus three gradient wallpapers. Nothing shares a crop, a colour treatment, or a light.
- **Fix:** Pick one treatment and apply it: a consistent aspect ratio (3:2 matches `ProjectLayout`'s `aspect-3/2` nav thumbnails at `index.tsx:91`), and one grade — desaturated toward monochrome is the strongest option here, since it would tie the photographs to the black/off-white palette *and* absorb the mismatched sources. Crop the HUD out of `earthtwin.jpg`, `moontwin.jpg`, `exotwin.jpg`.
- **Confidence:** high

### [P2] Unused starter-kit stock photography still in the repo, and still wired to the author record
- **Where:** `public/images/about.jpg`, `gallery-1.jpg` through `gallery-4.jpg`; `content/data/team/bob-lemieux.json:9`
- **Problem:** `about.jpg` is a stock neon-lit fashion portrait of a young woman; `gallery-1.jpg` is a stock RGB gaming-keyboard desk shot. Both are obvious free-stock starter-kit filler. `about.jpg` is still the `image` on Bob's own author record — the byline portrait for every blog post. The current feeds set `showAuthor: false` (`content/pages/blog/index.md:15`) and `PostLayout/index.tsx:24-29` renders only the name, so it likely does not surface today — but it is one config flip away from putting a stock photo of a stranger on his byline.
- **Fix:** Repoint `bob-lemieux.json:9` at a real photo; delete `about.jpg` and `gallery-*.jpg`.
- **Confidence:** med (that it currently renders), high (that the reference is wrong)

### [P2] Two different mechanisms render the same portrait on adjacent pages
- **Where:** `content/pages/index.md:18` vs `content/pages/info.md:32-35`
- **Problem:** `/info` uses the design system — a proper `media: ImageBlock`, which HeroSection lays out as a flex column (`HeroSection/index.tsx:60-69`). The homepage instead hand-writes raw HTML into the markdown body: an `img` tag with `style="float: right; width: 200px; margin: 0 0 16px 24px; border-radius: 8px;"`. Same image, two sizes, two alignments, two behaviours. The inline float is also a mobile defect: a 200px float inside a narrow column squeezes the first paragraph to a sliver. And the hardcoded `border-radius: 8px` bypasses the theme entirely — as does the second inline `border-radius:8px` on the iframe at `index.md:188`. These two are the only rounded corners on the site.
- **Fix:** Use `media: ImageBlock` on the homepage hero as `/info` does, and delete both inline styles.
- **Confidence:** high

### [P2] `flexDirection: row-reverse` set on heroes that have no media
- **Where:** `content/pages/index.md:52` and `:99`
- **Problem:** `mapFlexDirectionStyles` (`HeroSection/index.tsx:79-90`) turns this into `flex-col-reverse lg:flex-row-reverse lg:items-center`, but neither hero has a `media` block, so there is nothing to reverse — the classes are inert. Harmless in render; diagnostic of frontmatter copied from a preset and never read.
- **Confidence:** high

### [P2] Section variants were chosen by default, not by design
- **Where:** all 15 `variant:` values in `content/pages/**`
- **Problem:** The distribution is `variant-a` x3 (`index.md:185`, `work/index.md:34`, `info.md:140`), `variant-b` x3 (`index.md:288`, `tech-projects.md:29`, `info.md:66`), `variant-d` x9 — and every single `variant-d` is a blog feed (`blog/index.md:18` plus all seven posts plus `index.md:318`). `variant-c` is never used anywhere. So each section type has exactly one variant, applied uniformly. Not necessarily wrong, but combined with 65/65 sections on `colors-f` it confirms nobody ever opened the variant picker: the values are whatever the preset shipped.
- **Fix:** Low priority. Worth one pass to check whether `variant-c` on the project feeds gives a better grid for 14 items than `variant-b`.
- **Confidence:** med

### [P2] Only two of eight pages use the divider language
- **Where:** `content/pages/index.md` (7 DividerSections), `content/pages/info.md` (5); none on `/work`, `/projects`, `/work-projects`, `/tech-projects`, `/blog`
- **Problem:** The site has two different section-separation systems: `/` and `/info` put a 1px rule between every section; the six other pages rely on whitespace alone. Because `/` and `/info` are the entry points, a visitor learns the rule-separated rhythm and then loses it on every subsequent page.
- **Fix:** Pick one. Given the monospace/technical register, keeping the rules and extending them to the index pages is the more coherent choice.
- **Confidence:** high

### [P2] "View all Tech Projects" leads to fewer projects
- **Where:** `content/pages/projects/index.md:274-276` links to `/tech-projects`, which is `recentCount: 6` (`content/pages/tech-projects.md:25`); the `/projects` index it links *from* hand-lists 14 tech project cards
- **Problem:** The "view all" affordance returns a shorter list than the summary it came from. Same on the homepage (`index.md:284`, `recentCount: 6`). It reads as broken pagination.
- **Fix:** Raise `recentCount`, or switch `/tech-projects` to a full ProjectFeedSection.
- **Confidence:** high

### [P2] Card metadata is applied inconsistently across the `/projects` grid
- **Where:** `content/pages/projects/index.md:85-272`
- **Problem:** Of the 14 tech cards, 6 carry a `subtitle:` (a tech-stack line — `:165` "Three.js / WebGL / JavaScript", plus `:196`, `:212`, `:228`, `:242`, `:257`) and 8 do not. `FeaturedItem` renders the subtitle as `text-lg` under the title (`src/components/sections/FeaturedItemsSection/FeaturedItem/index.tsx:29`), so in a 3-column grid the cards sit at two different heights with a ragged internal structure — some titles followed by a stack line, some by body copy directly. Action labels are also mixed: "Learn more" x5, "Play ..." x4, "Launch EMBERWATCH", "Read Comic".
- **Fix:** Give every card a `subtitle:` (or none), and normalise the verbs to two: "Learn more" for case studies, "Launch" for live things.
- **Confidence:** high

## On the monospace body and uppercase headings

Asked directly: **the monospace is defensible, the uppercase-at-400 is not, and neither was actually chosen.**

`--theme-font-body: "DM Mono"` is applied to `html` (`src/css/main.css:19`), so *every* word on the site — nav, body copy, form placeholders, 250-word paragraphs, blog articles — is monospace. DM Mono is a good face, and a site-wide mono can read as deliberate for someone whose work is data pipelines and P6 exports; it signals "systems person" to the AI/tech audience. But it costs about 15% more horizontal space per character and removes the width variation that makes long-form text scannable, which is precisely the wrong trade for `/info` and the seven blog posts. And the same file loads **Azeret Mono** in the `@import` at `main.css:1` and never uses it — a second monospace family downloaded on every page load for nothing. That is the tell: this is the starter kit's font pairing still on its default, not a decision.

`--theme-heading-case: uppercase` at `--theme-heading-weight: 400` is the weaker half. It applies to h1-h6 globally (`main.css:36-37`) *and* is hand-applied to non-headings — the ProjectLayout description paragraph (`:48`), the header wordmark (`Header/index.tsx:179`), every Action link (`Action/index.tsx:32`), post bylines (`PostLayout/index.tsx:22`). Uppercase monospace at weight 400 gives no weight contrast against body text (also 400, also mono) and no case contrast (also caps in several places), so the only thing separating a 60px h1 from an 18px paragraph is size. That is a thin hierarchy. And "SELECTED WORK EXPERIENCE" set at 60px in a monospace at uniform advance width is extremely wide — it will wrap awkwardly on anything narrower than a desktop.

**Recommendation:** keep DM Mono for the interface, eyebrows, labels, metadata, code and data — where it earns its keep — and set long-form body copy in a proportional face. Drop the unused Azeret import. Either raise `headingWeight` to 500 (DM Mono ships a 500) so headings have something other than size distinguishing them, or drop `headingCase: uppercase` and let size do the work. Doing all of it — uppercase *and* 400 *and* mono *and* no accent colour — is why the site currently reads flat.

## Brand cohesion

It reads as an assembled template. The evidence, in order of visibility: the favicon is still the starter kit's "P"; the name is spelled two ways in the site chrome; 65 of 65 sections sit on the same palette value, so four of six themes are dead code; both brand colours render nowhere; five project pages use the kit's gradient wallpapers, two of them doubled; the header carries an Instagram link to `spazzmaster28` (`content/data/config.json:39`) next to LinkedIn on a site selling schedule and EVM credibility to data-centre executives; and four static pages use four unrelated type systems, one of which is iframed into the homepage on a mismatched background.

The header and footer are the most coherent parts of the site — `headerVariant: variant-c`, no logo, a `text-base tracking-widest uppercase` wordmark, four links, three social icons, and a narrow footer at `pt-16/pb-16`. Restrained and consistent. There is no iconography beyond the three social glyphs, which is fine.

What is missing is a single visual decision that is *his*. Right now every choice on the page is either the template's default or an unexamined leftover. The fastest route to cohesion is not a redesign: replace the portrait, replace the five wallpaper thumbnails with real screenshots, fix the favicon and the name, mute the photography to one grade, and introduce exactly one accent colour. That is a day's work, and it would move the whole site from a 2 to a 4.
