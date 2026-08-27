# boblemieux.ai — Whole-Site Architecture Audit

**Phase 2B.** Read-only. Nothing in this file was changed on disk.
**Scope:** the layer the six per-page lanes did not cover — the site *as a system*: what links to what, whether the 33 routes agree with each other, and whether the whole thing tells one story.

**Method.** Everything below is derived from source, not from rendered HTML. `curl` returns no markup on any route (P0 #1), so the inputs were `content/pages/**` frontmatter, `content/data/config.json`, `netlify.toml`, `src/components/**`, `src/utils/static-props-resolvers.ts`, and the five hand-written HTML files in `public/`.

Findings already owned by another lane are **cited, not restated**. New findings are marked **[new]**.

---

## 0. Route inventory — a correction to the count

The brief lists "26 content-driven routes". There are **27** markdown page files under `content/pages/**` (verified by glob), all of which produce a route. The reconciliation to the build's 33 pages is:

| Source | Count |
|---|---|
| Markdown pages (`content/pages/**/*.md`) | 27 |
| Code pages (`src/pages/projects/{fec,spending,weather,nyt}.tsx`) | 4 |
| Next.js built-ins (`/404`, `/500` — no `src/pages/404.tsx` exists) | 2 |
| **Total generated** | **33** |

Outside the Next pipeline entirely, and therefore *not* in the 33:

| Asset | Path |
|---|---|
| `/wire/` | `public/wire/index.html` |
| `/games/cheeseburgler.html` | `public/games/cheeseburgler.html` |
| `/games/voxelcraft/` | `public/games/voxelcraft/index.html` |
| `/comics/gas-station-gummies.html` | `public/comics/gas-station-gummies.html` |
| `/widgets/mindmap-3d.html` | `public/widgets/mindmap-3d.html` |
| `/projects/fec/` (iframe payload) | `public/projects/fec/index.html` |
| `/projects/spending/` (iframe payload) | `public/projects/spending/index.html` |

Plus two Netlify 200-proxies to other Netlify sites (`netlify.toml:12-22`, `:41-45`): `/projects/nyt/embed` → `nyt-digest.netlify.app`, `/games/obstacleboy/*` → `obstacleboy.netlify.app`.

So the *user-visible* surface is **40 addressable things**, of which the nav exposes **4**.

---

## 1. Information architecture

### 1.1 The real hierarchy vs. what the nav exposes

`content/data/config.json:12-33` defines four primary links. `config.json:65-95` defines five footer links. Both are applied globally by `src/components/layouts/BaseLayout/index.tsx:21-39`. That is the entire navigation system — there is no breadcrumb component, no section nav, no sitemap page, no in-page anchor nav.

```
NAV EXPOSES (4)              THE SITE ACTUALLY IS (40)
─────────────────            ────────────────────────────────────────────────
[site title] ──────────────► /                                    (home)
                             │
  Info ────────────────────► /info                                (titled "About")
                             │
  Work ────────────────────► /work                                ("Selected Work Experience")
                             │   ├── /work/integra
                             │   ├── /work/harvard-brain-science
                             │   ├── /work/bp-whiting
                             │   └── /work/cpchem-cedar-bayou
                             │
  Projects ────────────────► /projects
                             │   ├── /projects/turnover-readiness
                             │   ├── /projects/controls-automation
                             │   ├── /projects/schedule-cost-insight
                             │   ├── /projects/marley1
                             │   ├── /projects/boblemieux-ai
                             │   ├── /projects/lynda
                             │   ├── /projects/weather          (code page)
                             │   ├── /projects/spending         (code page)
                             │   ├── /projects/fec              (code page)
                             │   └── /projects/nyt              (code page)
                             │
  Blog ────────────────────► /blog
                                 └── /blog/post-one … post-seven

  ── NOT IN NAV, NOT IN FOOTER ────────────────────────────────────────────
      /work-projects            reachable only from / and /projects
      /tech-projects            reachable only from / and /projects
      /projects/earth-twin      no authored link anywhere
      /projects/moon-twin       no authored link anywhere
      /projects/exoplanet-twin  no authored link anywhere
      /wire/                    NO INBOUND LINK ANYWHERE ON THE SITE
      /widgets/mindmap-3d.html  iframe payload only; not navigable
      /games/voxelcraft/        /projects only
      /games/cheeseburgler.html /projects only
      /games/obstacleboy/       /projects only
      /comics/…gummies.html     /projects only
      /404                      unreachable by design
```

**Footer** (`config.json:65-95`) exposes: Info, **Contact** (`mailto:roblem28@gmail.com`), Blog, GitHub, LinkedIn. Note what this means: the footer's link set is *not* a subset of the header's and *not* a superset — `Work` and `Projects` are in the header only, `Contact`/`GitHub`/`LinkedIn` in the footer only. The two global navigations disagree about what the site contains. **[new]**

### 1.2 Inbound-link census — all 40 destinations

"Authored" = a `url:` in frontmatter or a markdown link written by hand. "Generated" = a card emitted by a list component. "Global" = appears in header/footer on every page.

| Route | Authored inbound | Generated inbound | Global nav | Total | Verdict |
|---|---|---|---|---|---|
| `/` | 0 | 0 | 1 (site logo) | 1 | ok |
| `/info` | 0 | 0 | 2 (header + footer) | 2 | ok |
| `/work` | 1 (`info.md:78`) | 0 | 1 (header) | 2 | ok |
| `/work/integra` | 0 | 2 (`work/index.md:39`, `info.md:71`) | 0 | 2 | ok |
| `/work/harvard-brain-science` | 2 (`info.md:24`, `info.md:172`) | 2 (`work/index.md:40`, `info.md:72`) | 0 | 4 | best-linked page on the site |
| `/work/bp-whiting` | 0 | 2 (`work/index.md:41`, `info.md:73`) | 0 | 2 | ok |
| `/work/cpchem-cedar-bayou` | 0 | 2 (`work/index.md:42`, `info.md:74`) | 0 | 2 | **never named in the bio** — see §1.5 |
| `/work-projects` | 2 (`index.md:260`, `projects/index.md:74`) | 0 | 0 | 2 | nav-invisible |
| `/tech-projects` | 2 (`index.md:293`, `projects/index.md:276`) | 0 | 0 | 2 | nav-invisible |
| `/projects` | 0 | 0 | 1 (header) | 1 | **zero content links to it** |
| `/projects/turnover-readiness` | 3 (`index.md:226`, `work-projects.md:44`, `projects/index.md:43`) | 0 | 0 | 3 | ok |
| `/projects/controls-automation` | 3 (`index.md:240`, `work-projects.md:65`, `projects/index.md:55`) | 0 | 0 | 3 | ok |
| `/projects/schedule-cost-insight` | 3 (`index.md:253`, `work-projects.md:85`, `projects/index.md:67`) | 0 | 0 | 3 | ok |
| `/projects/marley1` | 1 (`projects/index.md:98`) | 2 (home + `/tech-projects` recent-6) | 0 | 3 | ok |
| `/projects/boblemieux-ai` | 1 (`projects/index.md:110`) | 2 | 0 | 3 | ok |
| `/projects/lynda` | 1 (`projects/index.md:122`) | 2 | 0 | 3 | ok |
| `/projects/earth-twin` | **0** | 2 | 0 | 2 | **orphan (authored)** |
| `/projects/moon-twin` | **0** | 2 | 0 | 2 | **orphan (authored)** |
| `/projects/exoplanet-twin` | **0** | 2 | 0 | 2 | **orphan (authored)** |
| `/projects/weather` | 1 (`projects/index.md:134`) | 0 | 0 | 1 | single point of failure |
| `/projects/spending` | 1 (`projects/index.md:146`) | 0 | 0 | 1 | single point of failure |
| `/projects/fec` | 1 (`projects/index.md:159`) | 0 | 0 | 1 | single point of failure |
| `/projects/nyt` | 1 (`projects/index.md:236`) | 0 | 0 | 1 | single point of failure |
| `/blog` | 1 (`index.md:323`) | 0 | 2 (header + footer) | 3 | ok |
| `/blog/post-three` | 0 | 2 (`/blog` feed, `index.md:331`) | 0 | 2 | ok |
| `/blog/post-four` | 0 | 2 (`/blog` feed, `index.md:330`) | 0 | 2 | ok |
| `/blog/post-six` | 0 | 2 (`/blog` feed, `index.md:329`) | 0 | 2 | ok |
| `/blog/post-one` | 0 | 1 (`/blog` feed) | 0 | 1 | ok |
| `/blog/post-two` | 0 | 1 | 0 | 1 | ok |
| `/blog/post-five` | 0 | 1 | 0 | 1 | ok |
| `/blog/post-seven` | 0 | 1 | 0 | 1 | ok |
| `/games/voxelcraft/` | 1 (`projects/index.md:174`) | 0 | 0 | 1 | single point of failure |
| `/games/cheeseburgler.html` | 1 (`projects/index.md:204`) | 0 | 0 | 1 | single point of failure |
| `/games/obstacleboy/` | 1 (`projects/index.md:267`) | 0 | 0 | 1 | single point of failure |
| `/comics/gas-station-gummies.html` | 1 (`projects/index.md:220`) | 0 | 0 | 1 | single point of failure |
| `/widgets/mindmap-3d.html` | 0 navigable (iframe `src` at `index.md:187`) | 0 | 0 | **0** | **orphan** |
| `/wire/` | **0** | **0** | **0** | **0** | **total orphan** |
| `/404` | 0 | 0 | 0 | 0 | by design |
| `/projects/fec/`, `/projects/spending/` (raw HTML) | iframe `src` only | — | — | 0 | by design |

**Orphan count: 5 pages with zero authored inbound links** — `/wire/`, `/widgets/mindmap-3d.html`, and the three digital twins (`earth-twin`, `moon-twin`, `exoplanet-twin`). Of those, **`/wire/` is a true orphan with zero inbound links of any kind**: `grep` for `wire` across the whole of `content/` and `src/` returns **no matches**. It is reachable only by typing the URL. The master report already flags this under *P1 › Conversion › "`/wire` is unreachable"*; what is new here is that the three digital-twin pages sit in the same category for authored links, and are saved only by an auto-generated list they were never meant to be in (§1.4).

Nine destinations have exactly **one** inbound link, seven of them the *same* link source (`content/pages/projects/index.md`). If that one section were edited, four demos, three games and a comic would all become orphans simultaneously. **[new]**

### 1.3 First-visit flows, measured in clicks

#### Construction executive lands on `/`

| Goal | Path | Clicks | Status |
|---|---|---|---|
| Credentials / bio | header `Info` → `/info` | **1** | works, but the nav word is "Info" and the page is titled "About" (*P1 › Conversion*) |
| First hard proof (a named $B programme) | header `Work` → card → `/work/bp-whiting` | **2** | works — **but only via the nav.** `content/pages/index.md` contains **no link to `/work` or any case study**, verified: the only `/work…` strings in the file are absent entirely. (*P1 › Conversion › "The home page body never links to `/work`"*) |
| Résumé / CV | — | **∞** | **Does not exist.** `grep -i resume\|CV\|vitae` over `content/` returns one unrelated hit (`post-six.md:137`). No PDF, no download, no `/resume` route. |
| Contact | footer `Contact` (`mailto:`) | **1** | but the footer is below a 14,022px page at 380px with `isSticky: false` (`config.json:9`) — 18 screens of scroll (*P1 › Conversion*) |
| Contact **form** | scroll `/` to bottom, or `Info` → scroll past 5 sections | **0–1** + very long scroll | and every submission is discarded (**P0 #2**) |

**Verdict: credentials in 1 click, proof in 2, contact in 1 — on paper the exec flow passes.** It breaks on three things that clicks don't measure: there is nothing clickable above the fold anywhere (both home heroes have `actions: []`, `index.md:37` and `index.md:84`), there is no `Contact` item in the header, and the only artefact an executive actually wants — a résumé — is not on the site.

#### AI / tech visitor lands on `/`

| Goal | Path | Clicks | Status |
|---|---|---|---|
| Any technical project | scroll to home "Tech Projects" → card | **1** | works — lands on `earth-twin`/`exoplanet-twin`/`moon-twin`/`marley1`/`boblemieux-ai`/`lynda` |
| The flagship interactive demos (`weather`, `fec`, `spending`, `nyt`) | header `Projects` → card | **2** | works — **but none of them appears on the home page at all** (§1.4) |
| `/wire/` — the single best AI artefact on the site, 2,991 bytes gzipped, zero JS | — | **∞** | unreachable |
| Games / comic | header `Projects` → card | **2** | works |

**Verdict: 1 click to *a* tech project, 2 clicks to the *good* ones, ∞ to the best one.** The failure is not depth, it is selection: the six projects a tech visitor sees first are chosen by a date sort, not by Bob. Three of them (the twins) have no authored description anywhere on the site. And the one page that would most impress that audience is unlinked.

### 1.4 The two "Tech Projects" sections show different projects **[new]**

This is the sharpest structural defect found in this lane.

`src/utils/static-props-resolvers.ts:97-103`:

```ts
function getAllProjectsSorted(objects: ContentObject[]) {
    const all = objects.filter((object) => object.__metadata?.modelName === 'ProjectLayout') as ProjectLayout[];
    const sorted = all.sort(
        (projectA, projectB) => new Date(projectB.date).getTime() - new Date(projectA.date).getTime()
    );
    return sorted;
}
```

It filters on **model name only** — not on directory. And `content/pages/work/*.md` are all `type: ProjectLayout` (`work/integra.md:2`, `work/bp-whiting.md:2`, `work/cpchem-cedar-bayou.md:2`, `work/harvard-brain-science.md:2`). So the "all projects" pool is **13 documents: 9 tech projects + the 4 executive case studies**, sorted by `date:`:

| # | Doc | `date:` |
|---|---|---|
| 0–2 | `earth-twin`, `exoplanet-twin`, `moon-twin` | `2025-03-01` (three-way tie) |
| 3 | `marley1` | `2025-02-01` |
| 4 | `boblemieux-ai` | `2025-01-25` |
| 5 | `lynda` | `2025-01-20` |
| 6 | `turnover-readiness` | `2025-01-15` |
| 7 | `controls-automation` | `2025-01-10` |
| 8 | `schedule-cost-insight` | `2025-01-05` |
| 9 | **`work/integra`** | `2024-06-01` |
| 10 | **`work/harvard-brain-science`** | `2022-06-01` |
| 11 | **`work/cpchem-cedar-bayou`** | `2017-01-01` |
| 12 | **`work/bp-whiting`** | `2013-01-01` |

Three consequences:

1. **`RecentProjectsSection` with `recentCount: 6`** (`index.md:282-284` and `tech-projects.md:24-25`) returns indices 0–5 = the three digital twins, Marley1, boblemieux-ai, Lynda. Meanwhile `/projects`'s hand-curated "Tech Projects" (`projects/index.md:85-276`) lists **thirteen** items — Marley1, boblemieux-ai, Lynda, Weather Map, Federal Award Explorer, FEC Explorer, VoxelCraft, Flash Frenzy, The Cheeseburgler, the comic, NYT Digest, EMBERWATCH, ObstacleBoy — and **does not contain the three twins at all**. The overlap between the two sections that carry the same heading is **3 of 16**. A visitor who reads "Tech Projects" on the home page and then clicks "View all Tech Projects" lands on a page showing *three items they just saw and three they have never seen*, while the ten they might actually want are on a *different* page under the *same* heading. (The 6-of-13 symptom is *P1 › Content credibility › "'View all Tech Projects' leads to a page showing 6 of 13"*; the near-disjointness of the two sets is new.)

2. **The `/work` ↔ `/projects` boundary is one date-edit away from collapsing.** Nothing prevents a case study from appearing under "Tech Projects" — only the fact that `work/integra.md:5` is dated `2024-06-01` and so lands at index 9. Bump it to 2026 and BP Whiting's sibling appears in a grid next to a cheeseburger game.

3. **Project prev/next already crosses the boundary today.** `static-props-resolvers.ts:60-70` pages through the same unfiltered array, and `ProjectLayout` renders it as a `<nav>` (`src/components/layouts/ProjectLayout/index.tsx:64-73`). At index 8/9 the chain reads:

   `/projects/schedule-cost-insight` → *prev* → `/work/integra` → *prev* → `/work/harvard-brain-science` → … → `/work/bp-whiting`

   So a reader browsing AI tooling is silently paged into the $20B data-center case study, and a reader on `/work/integra` is offered "Schedule + Cost Insight Layer" as the next item. Neither page says which list it belongs to.

### 1.5 Dual identity — deliberate or collided?

**Collided.** The structure encodes the split in exactly one place and undermines it in four.

Where it works: `/work` is unambiguously the project-controls branch — four case studies, one list component, `FeaturedProjectsSection variant-a` (`work/index.md:32-42`), no tech content anywhere on it.

Where it collapses:

- **`/projects` is the collision point.** `projects/index.md` runs "Work Projects" (three $M-scale controls systems) and "Tech Projects" (thirteen items, including a cheeseburger game at `:194-209` and a comic at `:210-225`) as two sections of **one page under one `<h1>` reading "Projects"**. An executive who clicks the only nav item called "Projects" scrolls past the turnover command center into *Bob & Kenny in: GAS STATION GUMMIES!*. (*P1 › Conversion › "`/projects` puts a cheeseburger game and a comic next to $20B project-controls work"*.)
- **The word "project" carries four different meanings** across `/work` ("Selected Work Experience"), `/work-projects` ("Work Projects"), `/projects` ("Projects"), `/tech-projects` ("Tech Projects") — and `ProjectLayout` is the model behind *both* branches. (*P1 › Conversion › "'Work' vs 'Work Projects' vs `/work-projects`"*.)
- **The bio never links to the branch it describes.** `info.md:26-28` names the Fluor programmes as "ExxonMobil Baytown Expansion, Dow LHC-9, BP Whiting Refinery, and Chevron Phillips Hydrocracker" — four plain-text strings, none hyperlinked, while `/work/bp-whiting` and `/work/cpchem-cedar-bayou` exist and say the same things better. Only Harvard is linked (`info.md:24`, `info.md:172`). **[new]** (The factual problem in that same sentence is P0 #5; the missing links are separate.)
- **The AI identity has no home of its own.** There is no `/ai`, no `/lab`, no page that says "here is the edge-computing work". The AI story is scattered across three list pages, one blog category, and one unreachable static page.

#### Proposed IA — two branches, one shared spine

Serves both audiences without diluting either, and needs **no page deletions**:

```
/                     One-screen positioning + two explicit doors
 │                      "45 years, $20B programmes" ──► /work
 │                      "What I build now"          ──► /lab   (rename of /projects)
 │
├─ /work               THE EXEC BRANCH  (nav: "Work")
│   ├─ /work/integra … /work/bp-whiting        (4 case studies, unchanged)
│   └─ /work-projects  ──redirect──►  /work/systems
│         the three controls systems, re-parented under Work where they belong
│
├─ /lab                THE BUILDER BRANCH  (nav: "Lab" or "Projects")
│   ├─ Live demos       weather · fec · spending · nyt · wire · emberwatch
│   ├─ Systems & twins  marley1 · boblemieux-ai · lynda · earth/moon/exoplanet-twin
│   └─ /play            games + comic, one click down, preserved and linked
│         (voxelcraft · cheeseburgler · obstacleboy · gas-station-gummies)
│   └─ /tech-projects  ──redirect──►  /lab
│
├─ /about              /info renamed to match its own <h1>
├─ /blog
└─ /contact            NEW — the only genuinely new page; nav item #5
```

Three rules make it hold:
1. **`getAllProjectsSorted` must filter by path**, not just model name, or the branches keep leaking into each other (§1.4).
2. **Every list is either curated or generated, never both under one heading.** Today "Tech Projects" is both.
3. **Games and the comic stay, one level down, still linked** — `/lab/play`. Preserved as required; simply not adjacent to a $3.8B refinery.

---

## 2. Cross-page consistency

### 2.1 The full table — all 33 generated routes + 5 static assets

Derived from each page's `type:` and section list, `styles.self.width`, and the layout that renders it. "Ends with CTA?" means *the last thing on the page invites a next step* — prev/next project paging counts as a weak yes.

| Route | Layout / type | Header | Footer | Nav | H1 pattern | Hero pattern | Section order | Container width | Contact form | Ends with CTA |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | `PageLayout` | ✅ | ✅ | ✅ | **2× `<h1>`** — "Digital Leverage", "Project Leadership" (`HeroSection/index.tsx:26`) | 2 heroes, `actions: []`, portrait floated inline in `text` | Hero·÷·Hero·÷·Feat.Items·÷·Text(iframe)·÷·Feat.Items·÷·RecentProjects·÷·FeaturedPosts·÷·Contact | wide (`max-w-7xl`) ×10, narrow (`max-w-5xl`) ×2 | ✅ (broken, P0 #2) | ✅ form |
| `/info` | `PageLayout` | ✅ | ✅ | ✅ | **markdown `#`** inside hero `text` — *different element chain from every other page* | 1 hero, no `title:` field, media = portrait | Hero·÷·FeatProjects·÷·Labels·÷·Text·÷·FeatItems·÷·Contact | wide ×10, narrow ×1 | ✅ (broken) | ✅ form |
| `/work` | `PageLayout` | ✅ | ✅ | ✅ | Hero `title:` = "Selected Work Experience" | 1 hero + `subtitle`, `actions: []` | Hero·FeaturedProjects | wide ×2 | ❌ | ❌ **dead end** |
| `/work/integra` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` (`ProjectLayout:44`) | **no hero** — client eyebrow · date · h1 · description · media | header·description·media·prose·prev/next | hdr `max-w-5xl`, prose `max-w-3xl` | ❌ | ⚠️ prev/next only |
| `/work/harvard-brain-science` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | same | same | same | ❌ | ⚠️ prev/next |
| `/work/bp-whiting` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | same | same + trailing external `<a>` (`:35`) | same | ❌ | ⚠️ prev/next |
| `/work/cpchem-cedar-bayou` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | same | same | same | ❌ | ⚠️ prev/next |
| `/work-projects` | `PageLayout` | ✅ | ✅ | ✅ | Hero `title:` = "Work Projects" | 1 hero, `subtitle: ''`, `actions: []` | Hero·FeaturedItems(cols 1) | wide ×2 | ❌ | ❌ **dead end** |
| `/tech-projects` | `PageLayout` | ✅ | ✅ | ✅ | Hero `title:` = "Tech Projects" | 1 hero, `subtitle: ''`, `actions: []` | Hero·RecentProjects(6) | wide ×2 | ❌ | ❌ **dead end** |
| `/projects` | `PageLayout` | ✅ | ✅ | ✅ | Hero `title:` = "Projects" | 1 hero, `subtitle: ''`, `actions: []` | Hero·FeatItems"Work Projects"·FeatItems"Tech Projects" | wide ×3 | ❌ | ⚠️ "View all Tech Projects" |
| `/projects/turnover-readiness` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | no hero; **`client: ''` → no eyebrow** | header·description·media·prose·prev/next | 5xl/3xl | ❌ | ⚠️ prev/next |
| `/projects/controls-automation` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | same | same | 5xl/3xl | ❌ | ⚠️ prev/next |
| `/projects/schedule-cost-insight` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | same | same | 5xl/3xl | ❌ | ⚠️ prev/next |
| `/projects/marley1` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | same + `backgroundImage:` override (`:5`) — **only page on the site that overrides it** | same | 5xl/3xl | ❌ | ⚠️ prev/next |
| `/projects/boblemieux-ai` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | same | same | 5xl/3xl | ❌ | ⚠️ prev/next |
| `/projects/lynda` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | same | same | 5xl/3xl | ❌ | ⚠️ prev/next |
| `/projects/earth-twin` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | **no `media:`** → no figure | header·description·prose·prev/next | 5xl/3xl | ❌ | ✅ inline "Launch" link |
| `/projects/moon-twin` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | **no `media:`** | same | 5xl/3xl | ❌ | ✅ inline "Launch" |
| `/projects/exoplanet-twin` | `ProjectLayout` | ✅ | ✅ | ✅ | `title:` | **no `media:`** | same | 5xl/3xl | ❌ | ✅ inline "Launch" |
| `/projects/weather` | code (`weather.tsx`) | ✅ | ✅ | ✅ | `<h1>Weather Map</h1>` inside the component (`WeatherMap.tsx:811`) | none | `px-4 py-8` → component | component-owned | ❌ | ❌ (and blank, P0 #3) |
| `/projects/fec` | code (`fec.tsx`) | ✅ | ✅ | ✅ | **none** in host doc | none | full-bleed 88vh iframe | none — full bleed | ❌ | ❌ **dead end** |
| `/projects/spending` | code (`spending.tsx`) | ✅ | ✅ | ✅ | **none** in host doc | none | full-bleed 88vh iframe | none | ❌ | ❌ **dead end** |
| `/projects/nyt` | code (`nyt.tsx`) | ✅ | ✅ | ✅ | **none** in host doc | none | full-bleed 88vh iframe on `#0b0f19` | none | ❌ | ❌ **dead end** |
| `/blog` | `PostFeedLayout` | ✅ | ✅ | ✅ | Hero `title:` = "Blog" | 1 hero, `subtitle: ''`, **narrow** (all other list heroes are wide) | Hero·PostFeed | narrow ×2 | ❌ | ❌ **dead end** |
| `/blog/post-one` | `PostLayout` | ✅ | ✅ | ✅ | `title:` (`PostLayout:31`) | date \| author · h1 | header·prose·Contact | 5xl/3xl; Contact **wide** | ✅ (broken) | ✅ form |
| `/blog/post-two` | `PostLayout` | ✅ | ✅ | ✅ | `title:` | same | same | Contact **wide** | ✅ | ✅ form |
| `/blog/post-three` | `PostLayout` | ✅ | ✅ | ✅ | `title:` | same | same | Contact **wide** | ✅ | ✅ form |
| `/blog/post-four` | `PostLayout` | ✅ | ✅ | ✅ | `title:` | same | same | Contact **narrow** | ✅ | ✅ form |
| `/blog/post-five` | `PostLayout` | ✅ | ✅ | ✅ | `title:` | same | same | Contact **narrow** | ✅ | ✅ form |
| `/blog/post-six` | `PostLayout` | ✅ | ✅ | ✅ | `title:` | same | same | Contact **narrow** | ✅ | ✅ form |
| `/blog/post-seven` | `PostLayout` | ✅ | ✅ | ✅ | `title:` | same | same | Contact **narrow** | ✅ | ✅ form |
| `/404` | Next built-in | ❌ | ❌ | ❌ | Next's own | none | none | none | ❌ | ❌ **hard dead end** |
| `/500` | Next built-in | ❌ | ❌ | ❌ | Next's own | none | none | none | ❌ | ❌ |
| `/wire/` | raw HTML | ❌ | ❌ | ❌ | **none** (`public/wire/index.html`) | none | own | own | ❌ | ❌ **hard dead end** |
| `/games/cheeseburgler.html` | raw HTML | ❌ | ❌ | ❌ | `<h1>The Cheeseburgler</h1>` (`:100`) | none | own | own | ❌ | ❌ |
| `/games/voxelcraft/` | raw HTML | ❌ | ❌ | ❌ | `<h1>VoxelCraft</h1>` (`:488`) | none | own | own | ❌ | ❌ |
| `/comics/gas-station-gummies.html` | raw HTML | ❌ | ❌ | ❌ | **none** | none | own | own | ❌ | ❌ |
| `/widgets/mindmap-3d.html` | raw HTML | ❌ | ❌ | ❌ | `<h1>Bob's Molecule</h1>` (`:28`) | none | own | own | ❌ | ❌ |

### 2.2 Pages with no header / footer / nav

**Nine of the ~38 addressable destinations have no site chrome at all** — no header, no footer, no nav, no way back:

| Page | File | Why |
|---|---|---|
| `/404`, `/500` | *no `src/pages/404.tsx` exists* | Next's built-ins. Already *P2 › "`/404` renders Next's built-in page with no site chrome"*. Note the same is true of `/500`. **[new]** |
| `/wire/` | `public/wire/index.html` | outside the Next pipeline |
| `/games/cheeseburgler.html` | `public/games/cheeseburgler.html` | ″ |
| `/games/voxelcraft/index.html` | `public/games/voxelcraft/index.html` | ″ |
| `/comics/gas-station-gummies.html` | `public/comics/gas-station-gummies.html` | ″ |
| `/widgets/mindmap-3d.html` | `public/widgets/mindmap-3d.html` | ″ (iframe payload, so arguably correct) |
| `/games/obstacleboy/` | Netlify proxy (`netlify.toml:41-45`) | different origin |
| `/projects/nyt/embed` | Netlify proxy (`netlify.toml:12-22`) | ″ (iframe payload, correct) |

The architectural cause is exact: header and footer are injected by `BaseLayout` (`src/components/layouts/BaseLayout/index.tsx:21-39`) from `config.json`. Anything not rendered through `BaseLayout` gets none of it. The four code pages *do* call `BaseLayout` (`weather.tsx:21`, `fec.tsx`, `spending.tsx`, `nyt.tsx:30`) and are therefore fine. The `public/*.html` files never touch React.

**Consequence worth stating plainly:** a visitor who clicks "Play The Cheeseburgler" from `/projects` (target `_blank`, `projects/index.md:205`) lands in a document with no link back to boblemieux.ai. Same for the comic and VoxelCraft. Because they open in a new tab this is survivable; `/wire/`, which nothing links to, is not — it is a page you can only arrive at and never leave. **[new]**

Also: `grep 'href="/"' public/**/*.html` returns **zero matches** — not one of the five static pages links home. **[new]**

### 2.3 Page-title format — four incompatible schemes, and a rendering bug

`config.json:4` sets `titleSuffix: "| Bob LeMieux"`. `src/utils/seo-utils.js:36-42` applies it:

```js
title = `${title} - ${site.titleSuffix}`;
```

**The suffix already contains its own separator, and the template adds another.** Every content page therefore resolves to `… - | Bob LeMieux` — a hyphen immediately followed by a pipe. **[new]** This is invisible today only because P0 #1 means no `<title>` is emitted at all; it will appear on all 27 content routes the moment the SSR gate is fixed, which makes it a *prerequisite* fix for Phase-3 commit #1, not a later polish item.

Worked examples of what will render:

| Route | Source | Resolved `<title>` |
|---|---|---|
| `/info` | `metaTitle: Bob LeMieux — About` (`info.md:4`) | `Bob LeMieux — About - \| Bob LeMieux` — name twice, 40 chars of it |
| `/work/bp-whiting` | `metaTitle:` (`:21`) | `BP Whiting Refinery Modernization — Bob LeMieux Project Controls - \| Bob LeMieux` — **80 chars**, name twice |
| `/tech-projects` | no `metaTitle`, falls back to `title:` | `Tech Projects - \| Bob LeMieux` |
| `/blog/post-one` | no `metaTitle` | `How I Started Building in the AI Era - \| Bob LeMieux` |
| `/projects/weather` | own `<Head>` (`weather.tsx:14`) | `Weather Map — Radar, Precip Type & Alerts` — **no name at all** |
| `/wire/` | own tag | `THE AI WIRE` — no name, no context |

Four schemes coexist:

1. **`Bob LeMieux — X`** prefix + broken suffix — 5 pages carry a `metaTitle` in this shape (`index.md:4`, `info.md:4`, `work/index.md:4`, `projects/index.md:4`, `blog/index.md:4`).
2. **`X — Bob LeMieux <role>`** suffix + broken suffix — the 4 work case studies (`bp-whiting.md:21`, `cpchem-cedar-bayou.md:20`, `harvard-brain-science.md:20`, `integra.md:20`).
3. **`X` + broken suffix** — the 18 pages with no `metaTitle` (9 project pages, 7 blog posts, `work-projects.md`, `tech-projects.md`).
4. **`X — Y`, no name, bypasses `seo-utils` entirely** — the 4 code pages and the 5 static HTML files.

Only scheme 3 is safe to keep. Recommendation: strip the `— Bob LeMieux` fragments out of the eight `metaTitle:` values, change `seo-utils.js:39` to `${title} ${site.titleSuffix}`, and give the 4 code pages `<title>X | Bob LeMieux</title>`.

Related: **`metaDescription:` exists on only 9 of 27 content routes** (`index`, `info`, `work/index`, `projects/index`, `blog/index`, and the 4 work case studies). The 7 blog posts are covered by the `excerpt` fallback (`seo-utils.js:47-49`). That leaves **11 content routes with no description at all** — the 9 project pages plus `work-projects` and `tech-projects` — which is the code lane's *P1 › SEO › "12 routes have no meta description"* (their 12th is `/404`).

### 2.4 Hero pattern

Nine pages use `HeroSection`. They agree on almost everything and disagree on the two things that matter.

| Page | `title:` | `subtitle:` | `actions:` | media | width | padding |
|---|---|---|---|---|---|---|
| `/` #1 | "Digital Leverage" | — | `[]` | portrait as raw `<img>` **inside `text:`** (`index.md:18`) | wide | `pt-16 pb-16` |
| `/` #2 | "Project Leadership" | — | `[]` | — | wide | `pt-16 pb-16` |
| `/info` | **absent** | — | absent | `media:` ImageBlock (`info.md:32-35`) | wide | `pt-16 pb-12` |
| `/work` | "Selected Work Experience" | ✅ one line | `[]` | — | wide | `pt-16 pb-8` |
| `/projects` | "Projects" | `''` | `[]` | — | wide | `pt-16 pb-8` |
| `/work-projects` | "Work Projects" | `''` | `[]` | — | wide | `pt-16 pb-8` |
| `/tech-projects` | "Tech Projects" | `''` | `[]` | — | wide | `pt-16 pb-8` |
| `/blog` | "Blog" | `''` | `[]` | — | **narrow** | **`pt-16 pb-16`** |

Findings:

- **`actions: []` on every single hero on the site.** Nine heroes, zero buttons. (*P1 › Conversion › "No CTA exists anywhere"* — confirmed exhaustively here: `index.md:37`, `index.md:84`, `work/index.md:17`, `projects/index.md:14`, `work-projects.md:9`, `tech-projects.md:9`, `blog/index.md:31`.)
- **`/info` is the only page whose `<h1>` is not a `HeroSection` title.** It has no `title:` field; the heading comes from `# 40+ years building and controlling complex projects` inside the hero's markdown `text:` (`info.md:16`). It therefore renders through `markdown-to-jsx` prose styling rather than `text-5xl sm:text-6xl` (`HeroSection/index.tsx:26`) — a visibly smaller, differently-weighted h1 than every other page. **[new]**
- **`/` is the only page with two heroes and therefore two `<h1>`s** (*P1 › a11y*). The mechanism is not a hardcoded h1 — it is that `HeroSection` renders `<h1>` unconditionally and `index.md` uses the section twice.
- **Only `/work` has a subtitle.** Four list pages ship `subtitle: ''`, which renders nothing — so the four sibling pages present a bare word where `/work` presents an orienting sentence.
- **`/blog`'s hero is the only narrow one** and the only one with `pb-16` rather than `pb-8`, so the blog index's heading sits at `max-w-5xl` while `/projects`, `/work`, `/work-projects` and `/tech-projects` sit at `max-w-7xl`. Clicking Blog after Projects visibly shifts the left margin.

### 2.5 Card and list formats — five list pages, five different card contracts

| Page | Section | Component | Variant | Image | Date | Author | Excerpt/desc | "Read more" affordance | Cols |
|---|---|---|---|---|---|---|---|---|---|
| `/work` | `FeaturedProjectsSection` (`work/index.md:32-42`) | → `ProjectFeedSection` | `variant-a` | ✅ | ❌ (`showDate` unset) | n/a | ✅ | **arrow glyph**, no text | `md:grid-cols-2` |
| `/info` | `FeaturedProjectsSection` (`info.md:63-74`) | → `ProjectFeedSection` | **`variant-b`** | ✅ | ❌ | n/a | ✅ | arrow glyph | `md:grid-cols-3` |
| `/tech-projects` | `RecentProjectsSection` (`tech-projects.md:24-29`) | → `ProjectFeedSection` | `variant-b` | ✅ | ❌ | n/a | ✅ | arrow glyph | 3 |
| `/` "Tech Projects" | `RecentProjectsSection` (`index.md:282-288`) | ″ | `variant-b` | ✅ | ❌ | n/a | ✅ | arrow glyph | 3 |
| `/blog` | `PostFeedSection` (`blog/index.md:10-18`) | — | `variant-d` | **`true` — but no post has one** | ✅ | `false` | ✅ | arrow glyph | list |
| `/` "Featured Posts" | `FeaturedPostsSection` (`index.md:315-331`) | — | `variant-d` | **`false`** | ✅ | — | ✅ | arrow glyph | list |
| `/projects` ×2, `/work-projects`, `/` "Work Projects" | `FeaturedItemsSection` | — | n/a | **never** | ❌ | n/a | ✅ | **text link**: "Learn more" / "View project" | 3 / 3 / **1** / 3 |

Four concrete inconsistencies, all citable:

1. **The same four case studies render at two different variants.** `/work` uses `variant-a` (2-up), `/info` uses `variant-b` (3-up) — `work/index.md:34` vs `info.md:66`, identical `projects:` arrays (`work/index.md:39-42`, `info.md:71-74`). The same four cards, different geometry, on two pages one click apart. **[new]**
2. **Two entirely different card components are used for "projects".** `FeaturedItemsSection` items are hand-typed title+text+link with **no image and no link to a real page object**; `ProjectFeedSection` cards are generated from the content object with a featured image. So on `/projects`, the "Work Projects" row has no images and the "Tech Projects" row has no images either (also `FeaturedItemsSection`) — while `/tech-projects`, reached by the button at the bottom of that very row, is all images. **[new]**
3. **`/blog` asks for featured images that do not exist.** `blog/index.md:16` sets `showFeaturedImage: true`, but `grep '^featuredImage' content/pages/blog/` returns **zero matches** across all seven posts. The flag is inert; `PostFeedSection/index.tsx:81` guards on `post.featuredImage`. The home feed sets it to `false` (`index.md:324`) — so the two feeds happen to look the same, by accident rather than intent. It also means every post's `og:image` falls back to `defaultSocialImage` = the comic portrait (`seo-utils.js:60-68`, `config.json:5`). **[new]**
4. **`/work-projects` is the only single-column list on the site** (`columns: 1`, `work-projects.md:26`) with ~120-word blocks per item, while the identical items appear 3-up with 30-word blurbs on `/projects` and `/`. Same three items, three densities.

**Read-more affordance:** every generated card ends with a bare `ArrowUpRightIcon` in a circle and **no text** (`PostFeedSection/index.tsx:98-104`, `ProjectFeedSection/index.tsx:95`), whereas every hand-authored `FeaturedItem` ends with a text link. So half the site says "Learn more" and half shows an unlabelled arrow. (The `aria-label=""` on those is *P2 › "81 links carry `aria-label=\"\"`"*.)

### 2.6 Date formats

Uniform, and uniformly wrong for the audience. Every rendered date is `dayjs(date).format('YYYY-MM-DD')`:

- `PostLayout/index.tsx:16`
- `ProjectLayout/index.tsx:33`
- `PostFeedSection/index.tsx:177`
- `ProjectFeedSection/index.tsx:168`

So `/blog` and every post render `2026-03-03`, not `March 3, 2026`. There is no second format to be inconsistent *with* — the inconsistency is against prose, where `info.md:168` writes `**2021–2024 — PMA Consultants / Cargill**` and `bp-whiting.md:33` writes "mid-November of its commissioning year". **[new]** ISO dates read as a log file, not a portfolio. One-line fix in four files.

Project cards never show a date at all (`showDate` is unset on every `FeaturedProjectsSection`/`RecentProjectsSection`), which is fortunate — otherwise `/tech-projects` would display `2025-03-01` three times in a row for the twins.

### 2.7 Capitalization — counts per variant

Grepped across `content/`, `-o`, exact:

| Term | Variant | Count | Where |
|---|---|---|---|
| data center | `data center` | **17** | `index.md`, `info.md`, `work/index.md`, `work/integra.md` |
| | `Data Center` | **1** | `info.md:24` — "60 Oxford Street Data Center" (proper noun, correct) |
| | `datacenter` / `data centre` | **0** | — |
| project controls | `Project Controls` | **19** | `index.md:4`, `info.md:6,18,170,180,187`, `harvard:8,20,30`, `cpchem:8,20,22,28,30`, `bp-whiting:8,21,23,29,31` |
| | `Project controls` | **4** | `index.md:6`, `work/index.md:15`, `work-projects.md:51`, `controls-automation.md:21` |
| | `project controls` | **4** | `info.md:144`, `work/index.md:6`, `harvard:22`, `blog/index.md:6` |
| earned value | `EVM` | **9** | `index.md:8`, `info.md:22,166`, `integra:8,20,22,30`, `bp-whiting:31` |
| | `earned value` | **7** | `integra:23,28,30`, `cpchem:30`, `bp-whiting:29,31`(×2) |
| | `Earned Value` | **3** | `info.md:117` (label), `bp-whiting:8,31` |

**"data center" is clean** — 17 lowercase, 1 legitimate proper noun, zero one-word or British spellings. Leave it.

**"project controls" is not.** Three casings, 27 occurrences. The distinction is defensible in principle (title-case for the job title "Project Controls Manager", lowercase for the discipline) but it is not applied that way: `harvard-brain-science.md` uses `Project Controls` at `:8`, `:20`, `:30` and `project controls` at `:22` in running prose of the same register. **[new]**

**"earned value" is worst, and worst inside one line.** `bp-whiting.md:31` contains all three forms in a single paragraph: *"**Role — Project Controls Manager, Scheduling and Earned Value, Fluor Enterprises.** I owned scheduling and EVM across the EPC scope: … earned value measurement … earned value is the mechanism …"*. A controls executive reads that line closely. **[new]**

Suggested rule: `Earned Value Management (EVM)` on first use per page, `EVM` thereafter, `earned value` only as a common noun. `Project Controls` only when part of a role title.

### 2.8 Company-name styling

| Company | Forms in use | Count | Consistent? |
|---|---|---|---|
| Fluor | `Fluor Enterprises` (bio + case-study `client:` + first mention), `Fluor` (thereafter) | 13 | ✅ correct introduce-then-shorten |
| BP | `BP` throughout; `client: BP / Fluor Enterprises` | 7 | ✅ |
| Chevron Phillips | `Chevron Phillips` ×7, `CPChem` ×7 | 14 | ⚠️ see below |
| Integra | `Integra` ×10 (`Integra Mission Critical` in `title:`) | 10 | ✅ |
| Harvard | `Harvard` ×11 | 11 | ⚠️ see below |
| Cargill | `Cargill` ×2 | 2 | ✅ |
| ExxonMobil | `ExxonMobil` ×2 | 2 | ✅ styling; **factually wrong per P0 #5** |
| Dow | `Dow LHC-9` ×2 | 2 | ✅ |
| PMA | `PMA Consultants` ×1 | 1 | ✅ |

Two problems, both architectural rather than typographic:

- **Chevron Phillips has two names and they never meet.** `cpchem-cedar-bayou.md` correctly introduces `Chevron Phillips` (`:6`, `:8`) then uses `CPChem` (`:15`, `:19`, `:20`) — good practice inside one document. But `/info` calls the same job "Chevron Phillips Hydrocracker" (`info.md:27`, `:189`) as a plain string, never says CPChem, never says Cedar Bayou, and **never links to the case study that exists**. A reader of the bio and a reader of `/work` see two unrelated projects. **[new]** (The underlying factual error is **P0 #5**; the un-linked duplicate naming is separate and survives even after that fix.)
- **Harvard is named three ways for one building.** `title: Harvard Northwest Science Building` (`harvard-brain-science.md:3`), URL slug `harvard-brain-science`, link text "Harvard's Center for Brain Science" (`info.md:24`, `info.md:172`). Already *P2 › "'Center for Brain Science' links to a page titled 'Northwest Science Building'"* — noted here because it is also why `/work/harvard-brain-science` is the only page on the site whose slug matches neither its title nor its inbound link text. **[new] on the slug angle.**

### 2.9 CTA wording — the complete sitewide inventory

Every button/link label, from `grep 'label:\|submitLabel'` over `content/` plus the components:

| Label | Count | Source |
|---|---|---|
| `Learn more` | **12** | `index.md:225,239,252`; `projects/index.md:42,54,66,97,109,121,133,145,235` |
| `View project` | **3** | `work-projects.md:43,64,84` |
| `View all Work Projects` | 2 | `index.md:259`, `projects/index.md:73` |
| `View all Tech Projects` | 2 | `index.md:292`, `projects/index.md:275` |
| `View all work experience` | 1 | `info.md:77` |
| `See all posts` | 1 | `index.md:322` |
| `Play VoxelCraft` / `Play The Cheeseburgler` / `Play ObstacleBoy` / `Play Flash Frenzy` | 4 | `projects/index.md:173,187,203,266` |
| `Read Comic` | 1 | `projects/index.md:219` |
| `Launch EMBERWATCH` | 1 | `projects/index.md:248` |
| `↗ Launch Earth Twin` (+ Moon, Exoplanet) | 3 | inline HTML in the twin `.md` bodies |
| `Submit 🚀` | **8** | `index.md:394` + all 7 blog posts |
| `Send it 🚀` | **1** | `info.md:288` |
| *(unlabelled arrow icon)* | ~30 generated | `PostFeedSection:101`, `ProjectFeedSection` |
| Nav: `Info` `Work` `Projects` `Blog` | global | `config.json:15,20,25,30` |
| Footer: `Info` `Contact` `Blog` `GitHub` `LinkedIn` | global | `config.json:68,73,80,85,91` |

Voice assessment:

- **Three synonyms for the same action.** "Learn more" (12), "View project" (3), and a bare arrow (~30) all mean *open this page*. The three verbs are distributed by which *component* rendered the card, not by what the card is.
- **Four verbs for "view a list"**: `View all Work Projects` / `View all Tech Projects` / `View all work experience` / `See all posts`. Note the casing drift inside a matched pair — `View all Work Projects` (Title Case) vs `View all work experience` (sentence case). **[new]**
- **Two different submit labels for the identical form.** `Submit 🚀` on 8 pages, `Send it 🚀` on `/info`. Both are Stackbit-template voice with a rocket emoji on a heavy-industrial consultant's contact form (*P0 #8*).
- **Nothing anywhere says what a prospective client should do.** There is no "Get in touch", no "Download résumé", no "Book a call". The most action-oriented string on the site is "Play The Cheeseburgler".

### 2.10 Spacing rhythm and container widths — the cross-template picture

The per-page rhythm problems are already owned: *P1 › Design system* (`/info` alternating 8→12→12→8→12; blog posts' `pb-56` + `pt-24` producing ~320px of empty black). What follows is the layer above that — whether the **templates agree with each other**.

**Three different width vocabularies are in play, and two of them use the same words for different values. [new]**

| Consumer | `narrow` | `wide` | Source |
|---|---|---|---|
| Body sections (`PageLayout`) | `max-w-5xl` | `max-w-7xl` | `src/utils/map-styles-to-class-names.ts:94-98` |
| **Header** | `max-w-7xl` | `max-w-8xl` | `src/components/sections/Header/index.tsx:18` |
| **Footer** | `max-w-7xl` | `max-w-8xl` | `src/components/sections/Footer/index.tsx:13-14` |
| `PostLayout` / `ProjectLayout` | *(hardcoded)* header `max-w-5xl`, prose `max-w-3xl` | — | `PostLayout:21,41`; `ProjectLayout:38,58` |

So the tokens do not mean one thing. And the values actually configured are:

- **Header: `width: full`** (`config.json:59`) → matches *neither* branch of `Header/index.tsx:17-19`, so no max-width class is applied and the header runs **edge-to-edge**.
- **Footer: `width: narrow`** (`config.json:110`) → `max-w-7xl`.
- **Body "wide" sections** → `max-w-7xl`.

Result: the footer and body sections share an alignment edge at `max-w-7xl`, and the header does not align with either. The nav sits flush to the viewport while everything beneath it is inset. At 1440px that is a ~100px mismatch on each side, on every page of the site. **[new]** This is the most likely single cause of the "doesn't feel professionally designed" impression, and it is a one-line change (`config.json:59` `full` → `narrow`).

**Do the templates agree with each other?**

| Family | Hero padding | Body padding | Agree? |
|---|---|---|---|
| `/work`, `/work-projects`, `/tech-projects` | `pt-16 pb-8` | `pt-8 pb-24` | ✅ **identical** — the three list pages are perfectly consistent |
| `/projects` | `pt-16 pb-8` | `pt-8 pb-12` then `pt-12 pb-24` | ❌ its two body sections use different top padding from each other *and* from its siblings (`projects/index.md:80-83`, `:281-285`) |
| `/blog` | `pt-16 pb-16`, **narrow** | `pt-0 pb-12` | ❌ the only narrow hero, the only `pt-0` feed |
| `/` | every section `pt-16 pb-16`, dividers `pt-8 pb-8` | — | ✅ internally rigid, but does not match any other page |
| `/info` | `pt-16 pb-12` | dividers 8·12·12·8 | ❌ *P1 › Design system* |
| All 13 `ProjectLayout` pages | `px-4 py-14 lg:py-20` (hardcoded) | — | ✅ identical to each other, ❌ unrelated to the `pt-16` used everywhere else |
| All 7 `PostLayout` pages | `px-4 py-14 lg:py-20` | Contact `pb-56`/`pt-24` | ✅ body, ❌ trailing block |

So: `/work`, `/work-projects` and `/tech-projects` agree exactly. `/projects` — the page the nav actually points at — agrees with none of them. `/work` and `/projects` do **not** agree.

And one clean cross-template inconsistency worth fixing in five minutes: the seven blog posts carry an identical trailing `ContactSection`, but **three of them set `width: wide` and four set `width: narrow`** — `post-one.md:72`, `post-two.md:72`, `post-three.md:72` are `wide`; `post-four.md:72`, `post-five.md:72`, `post-six.md:73`, `post-seven.md:74` are `narrow`. The same form is `max-w-7xl` on three posts and `max-w-5xl` on four. **[new]**

Finally, the mechanism behind *P1 › Design system › "Post/project headers are outdented 8rem"*: `PostLayout:21` and `ProjectLayout:38` set the header to `max-w-5xl` while `:41`/`:58` set the prose to `max-w-3xl`, both `mx-auto`. `(64rem − 48rem) / 2 = 8rem` per side — the outdent is exactly that arithmetic, so the fix is to make both `max-w-3xl`.

---

## 3. Flow and narrative

### 3.1 Walking `/` → `/info` → `/projects` → contact

**`/` (14 sections, 14,022px at 380px).** Opens on `# Digital Leverage` and 250 words of abstraction closing on *"It's not hype"* (*P1 › Content credibility*). Nothing clickable above the fold (`index.md:37`). The reader then gets a second `<h1>`, "Project Leadership", saying much the same thing in different words — **two heroes, both abstract, neither naming a company, a dollar figure, or a year**. Then "What I Build" (four cards, **no links on any of them** — `index.md:123-160` have no `actions:`), then a 70vh iframe of a 3D mind map labelled with a stale internal codename (*P2*), then "Work Projects" (3 cards), then "Tech Projects" (6 auto-selected cards), then 3 blog posts, then the form.

*Where it breaks:* by the time the reader reaches anything concrete they are 5 sections deep, and the page **never once links to `/work`** — the only place the $3.8B and $20B numbers live. The home page's job is to route the two audiences and it routes neither: the exec branch is invisible from it, and the tech branch is populated by a date sort.

**`/` → `/info`.** Requires the nav, because the home page offers no path. The nav word is "Info"; the page `<h1>` is "40+ years building and controlling complex projects"; the `title:` is "About"; the `metaTitle:` is "Bob LeMieux — About" (`info.md:3-4`, `:16`). Four names for one page.

The page itself is the strongest on the site: bio → four case-study cards → capability labels → "Work with Bob" → experience/education → form. That is a correct order.

*Where it breaks:* the bio is third-person ("Bob LeMieux is…", `info.md:18`) while every case study it links to is first-person ("I served as…", `bp-whiting.md:29`) — *P1 › Content credibility*. And the four Fluor programmes named at `info.md:26-28` are plain text; only Harvard is a link. The reader is told about BP Whiting and Chevron Phillips in a sentence and given no way to click through to the two case studies that prove them (§2.8). **[new]**

**`/info` → `/projects`.** Requires the nav again (`info.md:77` offers only "View all work experience" → `/work`). The reader arrives at a page whose `<h1>` is "Projects" and whose first section heading is "**Work Projects**" — a phrase they have now seen meaning three different things. Scrolling past three controls systems they reach "**Tech Projects**", thirteen cards, and somewhere between the FEC campaign-finance explorer and the NYT digest they hit *The Cheeseburgler* and *Bob & Kenny in: GAS STATION GUMMIES!*.

*Where it breaks:* this is the page the nav points an executive at. It is also the page that contains the cheeseburger game (*P1 › Conversion*).

**`/projects` → contact.** There is no contact section on `/projects`, `/work`, `/work-projects`, `/tech-projects`, or on any of the 13 case-study/project pages. The reader's options are: scroll to the footer `mailto:`, or navigate back to `/` or `/info` and scroll to the bottom of those. **The story has no ending.** A visitor who is convinced by `/work/bp-whiting` — the best single page on the site — is offered exactly one next step: `prev`/`next` to another project.

**Verdict on the narrative:** the three-page arc is *ordered* correctly and *linked* incorrectly. Every transition in it requires the global nav; not one is carried by the content. And the arc terminates in nothing.

### 3.2 Dead-end audit

A page is a dead end here if, having read it, there is no offered next step other than the global chrome.

**Tier 1 — hard dead ends (nothing forward at all, no contact, no related content): 12**

| Route | File |
|---|---|
| `/projects/fec` | `src/pages/projects/fec.tsx` — iframe, then page ends |
| `/projects/spending` | `src/pages/projects/spending.tsx` — ″ |
| `/projects/nyt` | `src/pages/projects/nyt.tsx` — ″ |
| `/projects/weather` | `src/pages/projects/weather.tsx` — ″ (and blank, P0 #3) |
| `/wire/` | `public/wire/index.html` — no inbound link *and* no outbound |
| `/comics/gas-station-gummies.html` | no chrome, no link home |
| `/games/cheeseburgler.html` | ″ |
| `/games/voxelcraft/index.html` | ″ |
| `/games/obstacleboy/` | proxied, different origin |
| `/widgets/mindmap-3d.html` | ″ (acceptable — iframe payload) |
| `/404` | Next built-in, no chrome — *P2* |
| `/500` | Next built-in, no chrome — **[new]** |

The four code pages are the notable ones: they *do* carry the site header and footer (`BaseLayout`), so the visitor is not stranded — but they are also the four pages a technical evaluator is most likely to land on, and the page offers them nothing after the demo. No "here's how I built it", no link to the related blog post, no contact.

**Tier 2 — onward cards, but no contact and no CTA: 5**
`/work`, `/work-projects`, `/tech-projects`, `/blog`, `/projects`. Each ends on a grid or a "View all" button. The reader can keep browsing but is never asked for anything.

**Tier 3 — prev/next paging only: 13**
All four `/work/*` case studies and all nine `/projects/*` markdown pages. `ProjectLayout/index.tsx:64-73` renders a two-item `<nav>` of adjacent projects. This is the *only* forward affordance on the thirteen most persuasive pages on the site — and per §1.4 it pages across the work/tech boundary. (*P1 › Conversion › "Dead-end pages — no contact CTA on any work or project page"*.)

**Tier 4 — ends with a contact form: 9**
`/`, `/info`, and the seven blog posts. All nine forms discard the submission (**P0 #2**).

**Summary: 30 of 33 routes end without a working way to contact Bob, and the 9 that offer one throw it away.**

### 3.3 Redundant and overlapping pages — the actual set theory

Let each list page be the set of items it presents.

```
W   = /work            = { integra, harvard, bp-whiting, cpchem }                       |W|  = 4
WP  = /work-projects   = { turnover, controls-auto, schedule-cost }                     |WP| = 3
P   = /projects        = WP ∪ T13                                                       |P|  = 16
      T13              = { marley1, boblemieux-ai, lynda, weather, spending, fec,
                           voxelcraft, flash-frenzy, cheeseburgler, comic, nyt,
                           emberwatch, obstacleboy }                                    |T13|= 13
TP  = /tech-projects   = { earth-twin, exoplanet-twin, moon-twin,
                           marley1, boblemieux-ai, lynda }                              |TP| = 6
H   = / (3 list sections) = WP ∪ TP ∪ { post-six, post-four, post-three }
```

Relations:

| Relation | Value | Meaning |
|---|---|---|
| `WP ⊂ P` | 3 of 16 | `/work-projects` is a **strict subset** of `/projects` — it adds no item, only longer prose |
| `WP = H["Work Projects"]` | 3 = 3 | the home section is **the same three items again** |
| `TP ∩ P` | **3** of 16 | the two "Tech Projects" lists share only Marley1, boblemieux-ai, Lynda |
| `TP \ P` | **3** | earth/moon/exoplanet twin appear **only** on the "view all" page and the home page — never on `/projects` |
| `P \ TP` | **13** | thirteen items on `/projects` are absent from the page its own button calls "all Tech Projects" |
| `W ∩ P` | **0** | the four executive case studies appear on **no** page called "Projects" |
| `W ∩ TP` | **0 today** | but only because of `date:` values — see §1.4, this is not enforced |

**The verbatim duplication, precisely located.** The Turnover Readiness copy exists in four places:

| Location | Length | Text |
|---|---|---|
| `content/pages/projects/turnover-readiness.md:21` | ~110 words | canonical body |
| `content/pages/work-projects.md:31-40` | ~110 words | **byte-identical to the above** |
| `content/pages/projects/index.md:36-39` | ~30 words | condensed |
| `content/pages/index.md:219-222` | ~45 words | condensed differently |

Same for Controls Automation (`controls-automation.md:21` ≡ `work-projects.md:51-61`) and Schedule + Cost Insight (`schedule-cost-insight.md:21` ≡ `work-projects.md:72-81`). That is *P2 › "'Work Projects' content duplicated verbatim across three pages"*; the set-theoretic point is that **`/work-projects` contains no information that `/projects/{slug}` does not already contain** — it is a copy of three project pages with the "Learn more" links pointing at the originals.

**Recommended target structure — framed as redirects for the owner to approve. No page is deleted.**

| # | Proposal | Rationale | Risk |
|---|---|---|---|
| R1 | **Redirect `/work-projects` → `/work/systems`**, a new page under the Work branch holding the same three items with the same long copy | `WP ⊂ P` — the page is pure duplication, and its three items are project-controls work that belongs on the exec branch, not next to the games. Keeps the long-form copy that `/projects` truncates. | Low. Two inbound links to update (`index.md:260`, `projects/index.md:74`). Needs a 301. |
| R2 | **Redirect `/tech-projects` → `/projects`**, and make `/projects` the single curated tech list — adding the three twins that are currently missing from it | Removes the "6 of 13 / two different sets under one heading" defect (§1.4) by eliminating one of the two lists. `/projects` is already the nav target. | Low–medium. Two inbound links (`index.md:293`, `projects/index.md:276`), plus the "View all Tech Projects" buttons become redundant and should be dropped. Needs a 301. |
| R3 | **Add `/projects/play`** holding VoxelCraft, Cheeseburgler, ObstacleBoy and the comic, linked from `/projects` with one card | Preserves the games as required — the grandson's links keep working, since the underlying `public/` URLs never change — while removing them from the executive's line of sight. Purely additive. | Low. New page only. |
| R4 | **Add `/wire` as a card on `/projects`** and add a "← boblemieux.ai" link inside `public/wire/index.html` | Turns the site's best AI artefact from unreachable into reachable. | Trivial. |
| R5 | **Rename the nav label `Info` → `About`** and the page `title:` to match its own `<h1>` | Four names for one page (§3.1). | Trivial, `config.json:15`. |
| R6 | **Add `/contact`** and a fifth nav item | Currently the only contact affordance in the header is nothing at all. | Low. New page. |

After R1–R6 the four confusable list pages become two, both named after what they contain, with a `/play` shelf and a `/contact` endpoint:

```
Work      → 4 case studies + /work/systems (3 controls systems)
Projects  → demos + systems + twins, with /projects/play one click down
About · Blog · Contact
```

---

## 4. Professional benchmark

### 4.1 What a senior consultant / fractional-exec site looks like in 2026

The bar for a $300M–$20B project-controls expert positioning for fractional or advisory work is not high in a visual sense — it is high in a *proof* sense. The pattern that converts is: one screen that states who you are and the number that proves it; a single primary action; three to five case studies with named clients and quantified outcomes; a downloadable one-page credential; a contact route that works and is visible from every page; and an SEO/social footprint such that the person who Googles you or gets your link on LinkedIn sees your name and your headline before they click.

Measured against that pattern, this site currently delivers the case studies — genuinely, and they are good — and none of the rest.

### 4.2 Scores

**Credibility — 4 / 10**

The raw material is top-decile: BP Whiting at $3.8–4.0B with a 102 MBPD coker, CPChem Cedar Bayou, Harvard, Cargill's $400M+ annual programme, 26 years at Fluor, currently Senior Construction Schedule and EVM Manager at Integra. Almost nobody has this. But the site undermines it at the exact points an executive checks first: the surname is misspelled in the header on all 33 pages and in the copyright (**P0 #4**), the career is understated as "40+ years" when the site's own dates prove 45 (**P0 #6**), the bio double-counts one job under two wrong names (**P0 #5**), the current role carries no numbers at all (*P1*), the bio is third-person while the case studies are first-person (*P1*), the contact form has been silently discarding inquiries (**P0 #2**), there is no résumé, and every LinkedIn share previews blank (**P0 #1**). Four points, and they are all earned by the case studies.

**Clarity — 3 / 10**

Four list pages named `/work`, `/work-projects`, `/projects`, `/tech-projects`, of which two are not in the nav and one is a strict subset of another. The phrase "Tech Projects" heads two sections that share 3 of 16 items (§1.4). The nav says "Info" and the page says "About" and the `<h1>` says something else again. The nav has no Contact. The only nav item pointing at technical work also contains a cheeseburger game. A visitor cannot form a mental model of this site from its navigation, and the navigation is the only thing carrying them between pages, because the content almost never links sideways.

**Visual polish — 3 / 10**

There is a coherent dark monochrome system underneath, zero horizontal overflow at 380px across 15 routes, and all palettes pass AA — real foundations. What sits on top: both brand colours are defined and rendered zero times, so nothing on the site is ever the brand colour (*P1 › Design system*); the favicon is still the template's letter "P" (*P1*); five project pages ship the starter kit's gradient wallpapers as featured images, two of them duplicated so `/projects` shows the same blob twice (**P0 #10**); the header is full-bleed while every body section is inset to `max-w-7xl`, so the nav never aligns with the page (§2.10, **[new]**); every blog post ends in ~320px of empty black; project headers are outdented 8rem from their own body text; and whole paragraphs are set in uppercase monospace. It reads as a template that was filled in, which is exactly what it is.

**Memorability — 4 / 10**

This is the most interesting score, because the ingredients for a 9 are already in the repo. A 45-year heavy-industrial controls veteran who also runs local LLMs on his own hardware, built three NASA/AWS-backed digital twins, a wildfire map, an FEC campaign-finance cross-reference, a Unity game for his grandson, and a Silver-Age comic — that is a memorable person, and almost none of it is positioned to land. `/wire`, the sharpest artefact on the site, has zero inbound links. The twins have zero authored links. The homepage leads with the phrase "Digital Leverage" and 250 words containing no proper noun. The comic-illustrated portrait — the one genuinely distinctive visual asset — is doing double duty as the LinkedIn thumbnail for an executive audience, which is the open question the master report already put to the owner. Four points for the raw personality; the site is currently spending it badly.

### 4.3 Top 10 changes, ranked by impact

| # | Change | Tag |
|---|---|---|
| 1 | **Fix the SSR gate in `src/pages/_app.js:31`** and move `data-theme` server-side. Everything below is invisible to Google, LinkedIn and Slack until this lands, and the contact-form fix depends on it. | `covered-by-existing-finding` — **P0 #1** |
| 2 | **Make the contact form deliver.** Nine pages, every submission discarded since launch. The single highest-value business defect on the site. | `covered-by-existing-finding` — **P0 #2** |
| 3 | **Restructure the four list pages into two branches** — redirect `/work-projects` → `/work/systems`, redirect `/tech-projects` → `/projects`, add `/projects/play` for the games and comic. Removes the naming collision, the strict-subset duplication, and the cheeseburger-next-to-$20B problem in one move. No deletions; R1–R3 in §3.3. | `new-structural` |
| 4 | **Add a `/contact` page, a fifth nav item, and a downloadable one-page résumé.** The site currently has no Contact in the header and no CV anywhere — the two artefacts a construction executive looks for first. Both are absences, not defects, so no existing lane owns them. | `new-structural` |
| 5 | **Put an action on every hero and link the home page to `/work`.** Nine heroes, nine `actions: []`; the home body contains zero links to the case studies that carry the $3.8B and $20B numbers. | `covered-by-existing-finding` — *P1 › Conversion › "No CTA exists anywhere"* |
| 6 | **Filter the project pool by path in `src/utils/static-props-resolvers.ts:97-103`.** Today `getAllProjectsSorted` matches on `modelName` alone, so the four executive case studies are in the same array as the tech projects: prev/next already pages from `/projects/schedule-cost-insight` into `/work/integra`, and a single `date:` edit would put BP Whiting into a grid headed "Tech Projects". Fixing this is also the prerequisite for #3 holding over time. | `new-structural` |
| 7 | **Fix the title template.** `seo-utils.js:39` produces `${title} - | Bob LeMieux` — a hyphen followed by a pipe on all 27 content routes — and eight `metaTitle:` values already contain "Bob LeMieux", so the name renders twice. Also give the four code pages a suffix; they currently carry no name at all. Ship it in the same commit as #1, before the titles become visible. | `new-quick-fix` |
| 8 | **Name, years, and template copy.** `Lemieux` → `LeMieux` in `config.json:10` and `:107`; "40+ years" → 45; retire "Sign me up to receive my words", "Submit 🚀" and "Send it 🚀". Four string edits and a find-replace that remove the two most visible credibility leaks. | `covered-by-existing-finding` — **P0 #4, #6, #8** |
| 9 | **Three alignment fixes.** `config.json:59` header `width: full` → `narrow`, so the nav aligns with the body on every page. Set `post-one/two/three.md:72` `ContactSection` width to `narrow` to match the other four. Change the four `dayjs(...).format('YYYY-MM-DD')` calls to a human format. Under an hour, and it removes the strongest "unfinished template" signals. | `new-quick-fix` |
| 10 | **Close the link gaps.** Add `/wire` and the three digital twins to `/projects` (four pages currently reachable by URL only, one of them the best thing on the site); hyperlink the Fluor programme names in `info.md:26-28` to the two case studies that already exist; collapse "Learn more" / "View project" / bare-arrow into one label. | `new-quick-fix` |

**Split: 4 `covered-by-existing-finding` · 3 `new-structural` · 3 `new-quick-fix`.**

Items 1, 2, 7 and 8 are already in the master report's Phase-3 batching (commits 1, 2, 4, 5) and need no new decision. Items 3, 4 and 6 are IA changes that need the owner's approval before anything is written, and item 3 in particular is a redirect proposal, not a deletion proposal — `/wire`, the games and the comic all survive unchanged at their current `public/` URLs under every option above.

---

## Appendix — what this lane verified independently

- `grep 'wire'` across all of `content/` and `src/`: **zero matches**. `/wire/` has no inbound link of any kind.
- `grep 'href="/"'` across `public/**/*.html`: **zero matches**. No static page links home.
- `grep -i 'resume|CV|vitae'` across `content/`: one unrelated hit (`blog/post-six.md:137`). No résumé exists.
- `grep '^featuredImage'` across `content/pages/blog/`: **zero matches**, against `showFeaturedImage: true` at `blog/index.md:16`.
- 27 markdown page files under `content/pages/**`, not 26; 27 + 4 code pages + `/404` + `/500` = the 33 the build reports.
- `getAllProjectsSorted` (`static-props-resolvers.ts:97-103`) filters on `modelName` only — confirmed against the `type: ProjectLayout` frontmatter of all four `content/pages/work/*.md`.
- Width tokens resolve to different values in `map-styles-to-class-names.ts:94-98` than in `Header/index.tsx:18` and `Footer/index.tsx:13-14`.
- `seo-utils.js:39` concatenates `" - "` in front of a `titleSuffix` that already begins with `"|"`.

Not attempted, per the brief: any inspection of rendered HTML (P0 #1 makes it uninformative), and any browser automation.
