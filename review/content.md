# Content Review
_Method: source markdown + config (Read/Grep, no browser). Date basis: 2026-08-27._

## Credibility scorecard

| Page | Exec /5 | AI-tech /5 | Note |
|---|---|---|---|
| `/` (index.md) | 2 | 2 | Two 250-word walls of abstraction. Not one number, client, or artifact above the fold. Worst page on the site for both audiences. |
| `/info` | 4 | 3 | The strongest page. Real employers, real dates, real dollar ranges — undermined by the "$300M" ceiling its own case studies contradict. |
| `/work` (index) | 3 | 2 | Pure index, no copy of its own. Repeats the "40+ years... $300M to $20B" contradiction. |
| `/work/bp-whiting` | 5 | 3 | Best case study. Named owner, dollar value, unit capacity, external BP citation. The register the whole site should use. |
| `/work/cpchem-cedar-bayou` | 5 | 3 | Same standard. Tonnage, start-up date, CPChem citation. |
| `/work/harvard-brain-science` | 3 | 2 | Weakest case study. "I served on the large... project" states no ownership and no number. |
| `/work/integra` | 3 | 3 | Current role, zero quantification — no MW, no program value, no count of programs. The page an exec checks first. |
| `/projects` (index) | 2 | 3 | Three serious work tools sitting above kids' games and a comic with no hierarchical separation. |
| `/work-projects` | 3 | 2 | Duplicates the project pages verbatim. Every claim unfalsifiable — no client, no scale, no metric. |
| `/tech-projects` | 1 | 2 | "View all Tech Projects" lands on a page showing 6 of ~14. Actively broken promise. |
| `/projects/turnover-readiness` | 3 | 2 | "hundreds of systems", "hundreds of hours" — round and sourceless. |
| `/projects/controls-automation` | 3 | 2 | "multi-hundred-million-dollar projects" is the only scale marker; VBA/Excel undersold for the tech reader. |
| `/projects/schedule-cost-insight` | 3 | 3 | Best of the three work tools; still no model, no volume, no accuracy figure. |
| `/projects/boblemieux-ai` | 2 | 1 | Claims this site runs local LLMs. It is a static Next.js export on Netlify. Tech readers will check. |
| `/projects/marley1` | 2 | 3 | Concept copy only. Never names the hardware the blog names (Pi 5, Orin Nano). |
| `/projects/{earth,moon,exoplanet}-twin` | 3 | 5 | Most credible tech pages on the site — named data sources, named stack, live links. And they are missing from `/projects`. |
| `/projects/{fec,spending,weather,nyt}` | 2 | 3 | Bare iframes. No heading, no context, no "why I built this". |
| `/blog` posts one–four | 3 | 3 | Real voice, some concrete artifacts. Heavy repetition across the four. |
| `/blog/post-five` | 2 | 1 | Generic AI explainer with an emoji title. Nothing here only Bob could write. |
| `/blog/post-six`, `post-seven` | 2 | 1 | Generic developer listicles dated 2024 — two years before every other post. Read as unedited filler. |

**Pages that actively damage trust:** `/` (abstraction with no evidence — loses the exec), `/projects/boblemieux-ai` (a checkable false claim — loses the tech reader), `/tech-projects` (broken "view all"), `/blog/post-six` and `post-seven` (stale and generic, and post-six is featured on the homepage).

## Name spelling audit

The correct spelling is **LeMieux** — it is what every `metaTitle`, the `titleSuffix`, the body of `info.md`, and the photo alt text use (16 occurrences). `Lemieux` appears in 4 places, and two of them are the most-seen strings on the site.

| File | Spelling found | Occurrences | Notes |
|---|---|---|---|
| `content/data/config.json:4` | LeMieux | 1 | `titleSuffix: "| Bob LeMieux"` — correct |
| `content/data/config.json:10` | **Lemieux** | 1 | `header.title: "Bob Lemieux"` — **wrong; renders on every page** |
| `content/data/config.json:107` | **Lemieux** | 1 | `copyrightText: "© 2026 Bob Lemieux"` — **wrong; renders on every page** |
| `content/data/team/bob-lemieux.json:4` | **Lemieux** | 1 | `"lastName": "Lemieux"` — wrong; feeds the blog author byline |
| `content/data/team/bob-lemieux.json:10` | **Lemieux** | 1 | `altText: "Bob Lemieux photo"` — wrong |
| `content/pages/index.md` | LeMieux | 2 | lines 4, 18 |
| `content/pages/info.md` | LeMieux | 3 | lines 4, 18, 35 |
| `content/pages/work/index.md` | LeMieux | 1 | line 4 |
| `content/pages/work/bp-whiting.md` | LeMieux | 1 | line 21 |
| `content/pages/work/cpchem-cedar-bayou.md` | LeMieux | 1 | line 20 |
| `content/pages/work/harvard-brain-science.md` | LeMieux | 1 | line 20 |
| `content/pages/work/integra.md` | LeMieux | 1 | line 20 |
| `content/pages/blog/index.md` | LeMieux | 1 | line 4 |
| `content/pages/projects/index.md` | LeMieux | 1 | line 4 |
| `src/**`, `public/**` | — | 0 | No occurrences of either spelling anywhere in code or static pages |

**Exactly four string edits fix it**, all in two JSON files: `config.json` lines 10 and 107, `bob-lemieux.json` lines 4 and 10. Leave the filename `bob-lemieux.json`, the domain `boblemieux.ai`, the LinkedIn slug `/in/boblemieux`, and the project title `BobLemieux.ai Personal LLM Ecosystem` alone — those are lowercase identifiers, not name spellings.

## Typos & mechanics

| File | Text | Correction |
|---|---|---|
| `config.json:10` | `"Bob Lemieux"` | `"Bob LeMieux"` |
| `config.json:107` | `"© 2026 Bob Lemieux"` | `"© 2026 Bob LeMieux"` |
| `bob-lemieux.json:4,10` | `"Lemieux"`, `"Bob Lemieux photo"` | `"LeMieux"`, `"Bob LeMieux photo"` |
| `index.md:356` | `Got an interesting project? Tell me more...💬` | `Got an interesting project? Tell me about it. 💬` — three periods is not an ellipsis, and the emoji needs a preceding space |
| `bp-whiting.md:11` vs `:29` | description says `102 MBPD coker`; body says `102,000 BPD coker` | Pick one, and use `102,000 bpd` in both. `MBPD` reads as "million bpd" to a non-refining executive — wrong by 1000x |
| `bp-whiting.md:9` vs `:29` | `$3.8–4.0B` vs `$3.8B–$4.0B` | Use `$3.8B–$4.0B` in both |
| `index.md`, `projects/*.md`, `work-projects.md` | Unspaced em dashes — `leverage—how`, `chaos—and`, `desk—but` (15 occurrences across 8 files) | The work case studies and all seven blog posts use spaced em dashes (`Indiana — including`). Standardise on spaced. |
| `info.md:16,19`; `index.md:71` | `40+ years` / `over four decades` / `four decades of experience` | See P0-4 — should be `45 years` |
| `index.md:189` | `title="Box of Rox 3D mind map"` | The widget's own title is `Bob's Molecule — Living Graph`. Stale internal codename sitting in an accessibility label. |
| `post-one.md:112` | `running anonymized, privacy-first AI capability` | You anonymize data, not capability. Use `running local, privacy-first AI`. |
| `harvard-brain-science.md:28` | `I served on the large Harvard Northwest Science Building project` | `the large` is a dangling adjective — see P1-2 |
| `bob-lemieux.json:9` | `"url": "/images/about.jpg"` | Every other reference to Bob's photo uses `/images/bob.jpg`. Both files exist, so the blog byline shows a different photo from the rest of the site. Pick one. |
| `config.json:104` | `"address": "USA"` | Give a metro ("Greater Boston, USA") or drop the field. "USA" reads as an unfinished form. |

Clean: straight-vs-curly quotes are consistent (curly throughout). No double spaces. No misspellings. Proper nouns (Primavera P6, Netlify, GitHub, LinkedIn, Next.js, Acumen Fuse, Power BI, Bluebeam) are capitalised consistently. "data center" is consistently two words, unhyphenated, site-wide — no issue there.

**Typo/mechanics count: 13 distinct issues, 4 of which are the name.**

## Findings

### [P0] The surname is misspelled in the two most-visible strings on the site
- **Where:** `content/data/config.json` lines 10, 107; `content/data/team/bob-lemieux.json` lines 4, 10
- **Quote:** `"title": "Bob Lemieux"` and `"copyrightText": "© 2026 Bob Lemieux"`
- **Problem:** The site header and the footer copyright — the two strings on every single page — spell the name differently from the `<title>` tag on that same page (`titleSuffix: "| Bob LeMieux"`). A visitor who glances at the header and then at the browser tab sees two spellings of the man's own name. On a personal brand site this is the cheapest credibility leak on the property, and it is an SEO entity-consistency problem on top.
- **Suggested replacement:** `"title": "Bob LeMieux"`, `"copyrightText": "© 2026 Bob LeMieux"`, `"lastName": "LeMieux"`, `"altText": "Bob LeMieux photo"`
- **Confidence:** high

### [P0] The About page caps the résumé at $300M — its own case studies say $3.8B
- **Where:** `content/pages/info.md:20-21`, contradicted by `content/pages/work/bp-whiting.md:29` and `cpchem-cedar-bayou.md:28,30`
- **Quote:** info.md — _"He has directly led controls on projects up to $300M and contributed as a key controls leader on programs up to $20B."_ bp-whiting.md — _"I served as Project Controls Manager at Fluor Enterprises on BP's Whiting Refinery Modernization... responsible for scheduling and earned value across the program... Publicly reported project value was approximately $3.8B–$4.0B."_
- **Problem:** These cannot both be true. Either owning scheduling and EVM across a $3.8B EPC program counts as "directly led controls" — in which case the $300M ceiling is a severe self-underrating that discards the most impressive fact on the site — or the BP Whiting page overstates the role. A construction executive reading both pages in sequence will notice, and the uncharitable reading is "he inflated the case study." The same tension exists at Cedar Bayou, where he is Scheduling Lead on a world-scale cracker inside CPChem's multi-billion-dollar USGCPP. This is the most damaging finding in the review.
- **Suggested replacement:** _"He has owned the scheduling and earned value function on EPC programs valued from $300M to $4B, and served as a controls leader on capital portfolios up to $20B."_ Then confirm the BP Whiting role title with Bob — "Project Controls Manager" on a $3.8B program is a claim worth stating precisely.
- **Confidence:** high

### [P0] The About page and the case study name two different Chevron Phillips facilities
- **Where:** `content/pages/info.md:27-28` and `:189-190` vs `content/pages/work/cpchem-cedar-bayou.md:3,28`
- **Quote:** info.md lists the Fluor flagship programs as _"ExxonMobil Baytown Expansion, Dow LHC-9, BP Whiting Refinery, and Chevron Phillips Hydrocracker."_ The case study is titled _"CPChem Cedar Bayou Ethane Cracker"_ and describes _"Chevron Phillips Chemical's Cedar Bayou ethane cracker in Baytown, Texas."_
- **Problem:** A hydrocracker (refining, hydrogen-fed conversion unit) and an ethane cracker (petrochemical olefins furnace) are entirely different plants. This appears **twice** in `info.md`, so it is not a one-off slip. Any refining or petrochemical executive — precisely the reader Bob is targeting — spots it instantly, and it makes the whole experience list look loosely remembered rather than documented.
- **Suggested replacement:** In both `info.md` locations replace `Chevron Phillips Hydrocracker` with `Chevron Phillips Cedar Bayou Ethane Cracker`. If Bob genuinely worked a separate CPChem hydrocracker, list both — but they must not be conflated.
- **Confidence:** high

### [P0] "40+ years" understates a 45-year career, and the site's own dates prove it
- **Where:** `content/pages/index.md:6,71`; `info.md:6,16,18-19`; `work/index.md:8`; `blog/post-four.md:3`
- **Quote:** _"# 40+ years building and controlling complex projects"_ / _"I bring four decades of experience"_ / _"Sharing What I Have Learned After 40+ Years of Building Things"_
- **Problem:** `info.md` dates the career from **1981** (SW&B Constructors / Wade & Searway). 1981 to 2026 is **45 years**. "40+" and "four decades" are technically true but round down by half a decade, and "four decades" actively reads as *forty*, not forty-five. In a market where tenure is the differentiator, that is free credibility thrown away. It is also internally inconsistent: four different phrasings of one number across four pages.
- **Suggested replacement:** Standardise on **"45 years"** everywhere. Home meta: _"45 years delivering billion-dollar capital programs."_ Info H1: _"# 45 years building and controlling complex projects"_. Info body: _"Bob LeMieux is a Project Controls and Scheduling Manager with 45 years of experience across EPC, mission-critical, data center, and industrial construction."_ Home "Project Leadership": _"I bring 45 years of experience delivering billion-dollar capital and industrial projects."_ Post-four title: _"Sharing What I Have Learned After 45 Years of Building Things"_. Better still, anchor it — _"Building capital projects since 1981"_ — because a date never goes stale.
- **Confidence:** high

### [P0] Two blog posts are dated 2024 and read as filler — and one is featured on the homepage
- **Where:** `content/pages/blog/post-six.md:3,5`, `post-seven.md:3,5`; featured via `content/pages/index.md:329`
- **Quote:** post-six — `title: How I Structure and Organize a Modern Next.js Project`, `date: '2024-06-03'`. post-seven — `title: Habits of Highly Productive Developers`, `date: '2024-06-10'`. Body sample: _"**Document complex logic.** Future you will thank you."_
- **Problem:** Three failures at once. (a) They are dated **two years before** every other post (Feb–Mar 2026), so the blog's date column runs 2026, 2026, 2026, 2026, 2026, 2024, 2024 — the signature of content never touched after the fork. (b) The writing is indistinguishable from a generic dev-blog listicle: seven numbered habits, a stock folder tree, "Future you will thank you." Nothing in either post could only have been written by a 45-year project controls expert. (c) `index.md:329` features **post-six** on the homepage, so the first blog post a visitor sees is the least Bob-specific and the most stale thing on the site.
- **Suggested replacement:** Change the homepage featured set at `index.md:328-331` to `post-one.md`, `post-two.md`, `post-three.md`. Then either delete post-six and post-seven or rewrite each around something Bob actually did — e.g. post-six becomes _"How I Structure a Next.js Project That Has to Talk to P6"_, with the real folder tree (`/services/p6`, `/lib/evm`) and an explanation of where the schedule parser lives. A thin post with nothing proprietary in it is worth less than no post.
- **Confidence:** high

### [P0] The site claims to run local LLMs; it is a static Next.js export on Netlify
- **Where:** `content/pages/projects/boblemieux-ai.md:21`
- **Quote:** _"This site is more than a portfolio—it's a self-hosted AI lab running local language models, fine-tuned agents, and document processing pipelines."_
- **Problem:** `package.json` shows `next@^15.5.12` / `react@^19`, and the site deploys to Netlify. It is not self-hosted and it does not run local language models — the visitor is looking at a CDN-served page. Every other claim in the paragraph inherits the doubt, including _"multi-agent systems that can draft reports"_ and _"execute them end-to-end with minimal human oversight,"_ neither of which has an artifact on the page. This is the exact failure mode the AI/tech audience punishes: an unverifiable capability claim on a page they can falsify with one devtools glance. It also contradicts `post-three.md:96`, which describes the stack correctly — _"boblemieux.ai runs on Next.js with a headless CMS, deployed via Netlify."_
- **Suggested replacement:** _"This site is the front end of a personal AI lab. The site itself is a Next.js build on Netlify; the lab behind it runs on my own hardware — local models for document extraction, agent workflows that draft and summarise construction reports, and the pipelines I test here before they go near a live project. The FEC, USAspending, weather, and NYT tools elsewhere on this site all came out of it."_ Ground the claim in the artifacts that already exist.
- **Confidence:** high

### [P0] Newsletter copy is unedited starter-template text, on all seven blog posts
- **Where:** `content/pages/blog/post-one.md:33,61` — identical in post-two through post-seven
- **Quote:** `title: 'Stay up-to-date with my words ✍️'` and the checkbox label `Sign me up to receive my words`
- **Problem:** "My words" is Stackbit personal-theme boilerplate. It sits at the bottom of every blog post, and "Sign me up to receive my words" is not a sentence a project controls executive writes about himself. It is the clearest surviving fingerprint of the fork. Same family: `index.md:394` `submitLabel: "Submit 🚀"`, `info.md:288` `"Send it 🚀"`, and `post-one.md:65` `"Submit \U0001F680"` — a rocket emoji on the contact form of a heavy-industrial consultant.
- **Suggested replacement:** Section title `Get new posts by email`; checkbox label `Send me new posts`; submit label `Subscribe`. On the two contact forms, change `"Submit 🚀"` and `"Send it 🚀"` to `"Send"`. Seven files, three strings each — it removes the most template-looking copy on the site.
- **Confidence:** high

### [P1] The homepage opens with 250 words of abstraction and not a single fact
- **Where:** `content/pages/index.md:16-36` (HeroSection "Digital Leverage")
- **Quote:** _"Computers have always been my leverage—how I compress time, reduce friction, and create capability where teams used to accept limits. I don't treat 'tech' as a department or a buzzword. It's how I think: systems, signals, automation, and repeatability."_ ...and 200 more words in the same single paragraph, closing with _"It's not hype—it's the continuation of what I've always done."_
- **Problem:** This is the first thing both audiences read, and it is the one page that serves neither. For the executive there is no project, no owner, no dollar figure, no schedule outcome — nothing to assess. For the AI/tech reader it is buzzword-dense with no stack, no repo, no artifact ("agent-style systems," "extract meaning from documents," "turn raw information into decisions"). The paragraph also protests too much: a line that says _"It's not hype"_ makes the reader suspect hype. And it is a single unbroken 250-word block, which almost nobody finishes. Everything genuinely impressive about Bob — BP Whiting, Cedar Bayou, $20B programs, 45 years, four working public data tools — is buried three clicks deep.
- **Suggested replacement:** Lead with the evidence, then the thesis. _"**45 years of capital projects. Now I build the software too.**\n\nI have run schedule and earned value on programs from $300M to $4B — BP's Whiting Refinery modernization, Chevron Phillips' Cedar Bayou cracker, Harvard's Northwest Science Building, and today mission-critical data centers at Integra.\n\nSomewhere in there the tooling stopped keeping up. So I started building it: P6 extraction pipelines, turnover-readiness dashboards tracking hundreds of systems in real time, and AI workflows that read cost reports and flag the risk before the monthly meeting does. Everything on this site is something I actually shipped."_ Then let the case studies and project cards carry the detail.
- **Confidence:** high

### [P1] The Harvard case study never says what Bob did
- **Where:** `content/pages/work/harvard-brain-science.md:28,30`
- **Quote:** _"I served on the large Harvard Northwest Science Building project, a major multidisciplinary research facility in Cambridge..."_ and _"**Role — Owner's Representative, Project Controls.** Schedule tracking and alignment across multiple stakeholders, cost control and forecasting, coordination between design teams, construction teams, and end users, and support for technical systems integration within active lab environments."_
- **Problem:** "I served on" is the weakest possible verb — it places Bob somewhere near the project without claiming anything. Compare BP Whiting, which opens _"I served as Project Controls Manager... responsible for scheduling and earned value across the program"_ and gives a dollar value, a unit capacity, and an external citation. Harvard gives no project value, no square footage, no duration, no team size, and no outcome. The role paragraph is a sentence fragment — a list of nouns with no verb. Next to its two siblings this page reads like the one Bob was least involved in, which may be unfair to him.
- **Suggested replacement:** _"I ran project controls as Owner's Representative on the Harvard Northwest Science Building, a [$X]M, [X]-square-foot multidisciplinary research facility in Cambridge housing the Center for Brain Science.\n\n**Role — Owner's Representative, Project Controls.** I maintained the integrated schedule across [X] stakeholder groups, owned cost forecasting and variance reporting to the University, and coordinated design, construction, and end-user teams through [X] program changes driven by evolving research requirements — all inside active laboratory environments where a shutdown was not an option."_ Bob needs to supply the bracketed numbers; the structure is what matters.
- **Confidence:** high

### [P1] The Integra page — the current role — contains no numbers at all
- **Where:** `content/pages/work/integra.md:28-32`
- **Quote:** _"I manage schedule and earned value performance for mission-critical data center construction programs at Integra... Working in that environment means maintaining control across fast-moving, high-density data center infrastructure projects where schedule integrity, progress measurement, and execution discipline matter every day."_
- **Problem:** This is the page a hiring executive opens first, and it is the least quantified case study on the site. No MW capacity, no program value, no number of concurrent programs, no schedule duration, no SPI/CPI, no headcount. "Schedule integrity, progress measurement, and execution discipline matter every day" is a sentence that could be written by someone who has never been on a data center site. The third paragraph about Integra's integrated delivery model is genuinely good and specific — it just describes *Integra*, not *Bob*. The ratio is wrong: two-thirds of the page is about the employer.
- **Suggested replacement:** _"I own schedule and earned value across [X] concurrent mission-critical data center programs at Integra — [X] MW of combined critical load, [$X]B of construction value. I built and maintain the integrated master schedules, run the monthly EVM cycle, and own the critical-path analysis that tells leadership which programs will hit energization and which will not.\n\nData center schedules do not behave like process schedules. Density is higher, the sequence is more repetitive, and the float disappears earlier — so the controls framework has to be built to keep pace with the program rather than report on it after the fact."_ Even one real number (MW or program count) transforms this page.
- **Confidence:** high

### ROLE-LEVEL VOICE SPLIT — [P1] The site switches between "Bob" and "I" with no rule
- **Where:** `content/pages/info.md:18` (third person) vs every work case study and every project page (first person)
- **Quote:** info.md — _"Bob LeMieux is a Project Controls and Scheduling Manager with over four decades of experience..."_ vs integra.md — _"I manage schedule and earned value performance..."_ vs index.md — _"Computers have always been my leverage..."_
- **Problem:** The About page is the only third-person page on the site, and it sits between a first-person homepage and four first-person case studies. Third-person bio writing on a personal site reads as either a pasted LinkedIn summary or an affectation ("Bob LeMieux is..."). It also creates a jarring transition: the reader goes from "I bring four decades" on the homepage to "Bob LeMieux is" one click later, and back to "I served as" on the next click. Note the info.md *experience block* below is already first-person-neutral, so the split is inside a single page.
- **Suggested replacement:** Convert `info.md:18-31` to first person to match the rest of the site: _"I am a Project Controls and Scheduling Manager with 45 years across EPC, mission-critical, data center, and industrial construction. I have owned scheduling and earned value on programs from $300M to $4B and served as a controls leader on portfolios up to $20B..."_ Keep third person only if a formal bio block is wanted somewhere — but then it should be visually marked as a bio, not the page's main voice.
- **Confidence:** high

### [P1] "View all Tech Projects" leads to fewer projects than the page you came from
- **Where:** `content/pages/projects/index.md:274-276` and `content/pages/index.md:290-293` both link to `/tech-projects`; `content/pages/tech-projects.md:24-25` sets `recentCount: 6`
- **Quote:** `label: View all Tech Projects` → `url: /tech-projects`, which renders `type: RecentProjectsSection` with `recentCount: 6`
- **Problem:** `/projects` hand-lists **13** tech projects. Clicking "View all Tech Projects" takes the visitor to a page showing **6**. The call to action lies, and the visitor loses seven projects by following it. The same `recentCount: 6` cap applies to the homepage carousel, which is fine there — but a page literally named "Tech Projects" reached via "View all" must show all of them.
- **Suggested replacement:** Raise `recentCount` on `tech-projects.md` to cover every project (or remove the cap), and relabel to match reality. If the cap must stay, change the CTA to `See more Tech Projects`.
- **Confidence:** high

### [P1] The three digital-twin projects — the strongest tech work on the site — are missing from /projects
- **Where:** `content/pages/projects/earth-twin.md`, `moon-twin.md`, `exoplanet-twin.md` exist (all `date: '2025-03-01'`) but appear nowhere in the hand-built Tech Projects list at `content/pages/projects/index.md:85-272`
- **Quote:** From earth-twin.md — _"built entirely on free public data — NASA Blue Marble imagery, VIIRS night lights, ESRI satellite tiles, AWS terrain elevation, and OpenFreeMap 3D buildings... Built with MapLibre GL JS, zero API keys."_
- **Problem:** These three pages are the best AI/tech credibility assets Bob has: named data sources, a named stack, a stated constraint ("zero API keys") that a technical reader recognises as a real engineering decision, and live deployed links. They are also the most recent projects by date. Because `/projects` hand-lists its tech items rather than generating them, all three are invisible on the page a visitor actually browses — they surface only in the date-sorted `RecentProjectsSection` on the homepage and `/tech-projects`. The result is that the homepage and `/projects` show *different* sets of tech projects, which reads as an unfinished site.
- **Suggested replacement:** Add three `FeaturedItem` entries to `projects/index.md` mirroring the existing pattern, e.g. `title: Earth Twin`, `subtitle: MapLibre GL JS · NASA · OpenFreeMap`, `text: Browser-based 3D digital twin of Earth on NASA Blue Marble, VIIRS night lights, AWS terrain, and OpenFreeMap 3D buildings — orbital altitude to street level, zero API keys.` Better long-term fix: generate that list from the project files so it can never drift again.
- **Confidence:** high

### [P1] Four project pages are bare iframes with no copy at all
- **Where:** `src/pages/projects/fec.tsx`, `spending.tsx`, `weather.tsx`, `nyt.tsx`
- **Quote:** The entire visible content of `fec.tsx` is `<iframe src="/projects/fec/index.html" title="FEC Campaign Finance Explorer" ... style={{ height: '88vh' }} />`. No `<h1>`, no paragraph, no byline.
- **Problem:** A visitor clicking "Learn more" from `/projects` on the FEC, USAspending, weather, or NYT card lands on a page with no heading, no explanation, and no statement that Bob built it — just a tool filling 88% of the viewport inside the site chrome. The label says "Learn more" and there is nothing to learn. These are four of the most substantial things on the site (a contributor-to-federal-contract cross-reference with match confidence scoring is genuinely interesting work) and they are presented anonymously. The technical reader gets the artifact but no evidence of authorship; the executive gets a tool with no explanation of why a project controls person built it.
- **Suggested replacement:** Add a short header block above each iframe — one `<h1>`, one paragraph of what and why, one line of stack. For fec.tsx: _"**FEC Campaign Finance Explorer.** An OpenFEC client for contributions, committees, candidates, independent expenditures, and filings — plus a cross-reference that matches contributors against federal contract awards with a confidence score on each match. Built because the two datasets are public and nobody joins them. Static front end, Next.js API route for the key-injected FEC calls."_ Same treatment for the other three.
- **Confidence:** high

### [P1] The three work-project pages have no client, no scale, and no verifiable metric
- **Where:** `content/pages/projects/turnover-readiness.md:21`, `controls-automation.md:21`, `schedule-cost-insight.md:21` (duplicated verbatim in `work-projects.md`)
- **Quote:** _"It's eliminated hundreds of hours of manual reconciliation and reduced handover delays by surfacing issues weeks earlier than traditional tracking allowed."_ and _"These tools have become the backbone of weekly reporting for multi-hundred-million-dollar projects."_
- **Problem:** These three describe Bob's most commercially relevant work and every claim in them is unfalsifiable. "Hundreds of hours," "hundreds of systems," "weeks earlier," "multi-hundred-million-dollar," "days to minutes" — all round, all sourceless, none attached to a named project or year. An executive reads round numbers as estimates, and estimates as marketing. Worse, all three follow an identical three-move template (problem → "I built" → vague benefit), which makes them read as generated rather than reported. The tech reader gets nothing either: "AI-enabled pipeline" appears with no model, no framework, no data volume.
- **Suggested replacement:** Attach each to a real program, even anonymised. For turnover-readiness: _"On a [$X]M [sector] program I replaced the turnover spreadsheet with a dashboard covering [X] systems and [X,XXX] punch items across mechanical, electrical, instrumentation, and controls. It pulls from [source] nightly, flags incomplete predecessor paths, and gives commissioning a single ranked view of what is blocking handover. Manual reconciliation went from [X] hours a week to [X]. On the last two turnover packages it surfaced blocking items [X] weeks before the previous process would have."_ Then say which parts are Bob's and which are the client's. Specific and modest beats round and grand with this audience.
- **Confidence:** high

### [P1] "Chevron Phillips Hydrocracker" aside, the Fluor tenure has no start-date for the current role
- **Where:** `content/pages/info.md:164-166`
- **Quote:** _"**Current — Integra**\n\nSenior Construction Schedule and EVM Manager on mission-critical data center construction programs."_
- **Problem:** Every other entry in the experience list carries a date range — `2021–2024`, `2017–2021`, `1991–2017`, `1981–1991`. The current role carries the word "Current" and no start year, which leaves a visible gap between 2024 and now and forces the reader to wonder whether there is an unexplained break. `work/integra.md` has `date: '2024-06-01'` in its frontmatter, so the information exists. Separately, "Current" will silently rot — it is the kind of word that is still on a site three years after it stopped being true.
- **Suggested replacement:** `**2024–Present — Integra**`. Apply the same treatment anywhere "currently" appears: `index.md:7-8` (_"Currently leading schedule and EVM..."_) and `info.md:7-8` (_"Currently at Integra..."_) are fine as prose but should be reviewed on any role change.
- **Confidence:** high

### [P1] Post-five is a generic AI explainer with nothing of Bob's in it
- **Where:** `content/pages/blog/post-five.md:3,82-193`
- **Quote:** `title: 'AI Is So Hot Right Now 🔥'`, opening _"Artificial Intelligence has become the hottest topic in technology."_ Body includes bulleted lists such as _"- writing and debugging code / - analyzing large datasets / - summarizing long documents / - generating reports / - brainstorming ideas."_
- **Problem:** Eleven hundred words on AI containing zero references to construction, P6, EVM, Integra, Marley1, or anything Bob has built — while posts one through four all manage to ground themselves in his actual work. The title is a Zoolander reference plus a fire emoji, which is exactly the "AI transformation" register the executive audience is allergic to, and the content is exactly the buzzword-salad-with-no-artifact register the tech audience is allergic to. It is the only post on the site that fails both readers simultaneously. It is also dated `2026-03-10`, making it the **most recent** post — so it is what a returning visitor sees first.
- **Suggested replacement:** Either cut it, or rewrite it into the post only Bob can write: _"What AI Actually Did to My Reporting Cycle"_ — the monthly EVM package that took four days and now takes an afternoon, what the model gets wrong on P6 exports, where a human still has to check the critical path by hand, and why the dashboard nobody trusts is still the failure mode. Same subject, unfakeable authority.
- **Confidence:** high

### [P1] Blog URLs read `post-one` through `post-seven`
- **Where:** `content/pages/blog/post-one.md` … `post-seven.md`, and the featured-post references at `index.md:329-331`
- **Quote:** Filenames `post-one.md`, `post-two.md`, ... producing `/blog/post-four`
- **Problem:** Three distinct costs. **Credibility:** a shared link reading `boblemieux.ai/blog/post-four` looks like a site the owner never finished configuring — it is the URL equivalent of a file named `Untitled-1`. **SEO:** the slug is the strongest on-page ranking signal after the title, and these carry zero keywords; `/blog/post-two` is invisible for "composable architecture construction data" while `/blog/the-great-unbundling` is not. **Ordering:** the numbers do not even match chronology — post-two is 2026-02-10, post-three is 2026-02-17, post-one is 2026-02-24, post-four 2026-03-03, post-five 2026-03-10, then post-six and post-seven are 2024. So "post-one" is neither the first post written nor the first shown, which will confuse anyone who assumes the numbering means something.
- **Suggested replacement:** Rename to title slugs with redirects from the old paths: `how-i-started-building-in-the-ai-era`, `the-great-unbundling`, `composable-the-future-of-the-web`, `what-45-years-of-building-taught-me`, `ai-is-so-hot-right-now`, `structuring-a-nextjs-project`, `habits-of-productive-developers`. Add `_redirects` entries for `/blog/post-one` → new path so nothing already shared breaks.
- **Confidence:** high

### [P1] The four blog posts repeat the same sentence and the same three examples
- **Where:** `post-one.md:100`, `post-two.md:118`, `post-three.md:108`; examples repeated across `post-one.md:104,112` and `post-four.md:104`
- **Quote:** post-one: _"One thing decades of project work teaches you is that productivity isn't about working harder."_ post-two: _"One thing decades of working on large projects teaches you is that complex systems only succeed when they are structured carefully."_ post-three: _"One thing decades of project work teaches you is that modularity isn't optional on complex systems."_ And in both post-one and post-four: _"I've built schedule and cost extraction pipelines on top of... P6 exports... turnover readiness dashboards that track hundreds of systems in real time... Marley1 — a portable AI and compute platform designed for field-ready intelligence on small hardware."_ Post-one and post-four also close on near-identical lines: _"And like any good project, it's just getting started."_ / _"Like any good project, this is just the beginning."_
- **Problem:** Anyone who reads two posts sees the formula. The same "One thing decades of X teaches you" opener to the Lessons section appears three times; the same three artifacts (P6 pipelines, turnover dashboards, Marley1) are the entire evidence base for four separate posts; two posts end on the same sentence. The set does not cohere so much as loop. It also means the blog demonstrates exactly three things Bob has built, repeated — which makes the body of work look thinner than it is, given the site elsewhere lists thirteen tech projects.
- **Suggested replacement:** Vary the section openers (drop "One thing decades of project work teaches you" from two of the three). Give each post its own primary artifact: post-one keeps Marley1, post-two takes the P6/Procore/Excel stack it already mentions at line 98, post-three takes the AI pipeline layering, post-four takes the turnover dashboard. Cut one of the two "just getting started" closers.
- **Confidence:** high

### [P1] Instagram sits in the header next to the executive audience
- **Where:** `content/data/config.json:37-41`
- **Quote:** `"label": "Instagram", "url": "https://instagram.com/spazzmaster28"`
- **Problem:** The header carries three social links: Instagram, GitHub, LinkedIn. GitHub and LinkedIn both serve the two target audiences directly. Instagram serves neither, and the handle `spazzmaster28` is visible on hover and in the status bar — which is a jarring adjacent signal on a site pitching billion-dollar program control to construction executives. If the Instagram account is personal rather than professional, it is working against both audiences at once.
- **Suggested replacement:** Remove the Instagram link from `header.socialLinks`. If Bob wants it kept, move it to the footer only, and confirm the account content reads professionally.
- **Confidence:** med

### [P2] The homepage 3D widget is labelled with a stale internal codename
- **Where:** `content/pages/index.md:183,189` vs `public/widgets/mindmap-3d.html:6,28`
- **Quote:** Section title `Active Work — 3D Map`; iframe attribute `title="Box of Rox 3D mind map"`. The widget's own title is `Bob's Molecule — Living Graph` with the subtitle _"drag rotate · pinch/scroll zoom · tap node to focus · faint arcs = cross-domain bonds"_.
- **Problem:** Three names for one thing, and the accessible name a screen reader announces ("Box of Rox 3D mind map") is a codename that appears nowhere else on the site. The section title "Active Work — 3D Map" also gives the visitor no reason to engage — it does not say what the map shows or why they should rotate it. An interactive widget with no framing is usually scrolled past.
- **Suggested replacement:** Section title: `What I'm working on, as a graph`. Iframe title: `Bob's Molecule — interactive 3D map of active work`. Add one line of intro text above the iframe: _"Every project, tool, and experiment I have running, and how they connect. Drag to rotate, tap a node to focus."_
- **Confidence:** high

### [P2] The About page links "Center for Brain Science" to a page titled "Northwest Science Building"
- **Where:** `content/pages/info.md:24` and `:172` link to `/work/harvard-brain-science`; `content/pages/work/harvard-brain-science.md:3` is `title: Harvard Northwest Science Building`
- **Quote:** info.md — `[Harvard's Center for Brain Science](/work/harvard-brain-science)`
- **Problem:** The link text promises the Center for Brain Science, the URL slug says brain-science, and the destination page's headline says Northwest Science Building — which *houses* the Center for Brain Science, per the page body. Not wrong, but the reader experiences a small bait-and-switch and has to reconcile three names. The `/work` index and the About page's featured-project card will also both display "Harvard Northwest Science Building" while the prose above them says "Center for Brain Science."
- **Suggested replacement:** Make the link text match the destination: `[Harvard's Northwest Science Building](/work/harvard-brain-science)`, and let the case study body do the work of explaining it houses the Center for Brain Science (it already does, at line 28). Alternatively retitle the case study `Harvard Northwest Science Building — Center for Brain Science`.
- **Confidence:** high

### [P2] "THE AI WIRE" is built and deployed but linked from nowhere
- **Where:** `public/wire/index.html` exists (`<title>THE AI WIRE</title>`, `description="AI news, Drudge-style. Curated daily."`); a case-insensitive grep for "wire" across all of `content/` returns no files
- **Quote:** `<meta name="description" content="AI news, Drudge-style. Curated daily.">`
- **Problem:** A finished page shipping to production with no route into it. If it is live and genuinely updated daily, it is an asset the tech audience would find interesting and it is being wasted. If it is *not* updated daily, the description is a claim that will be visibly false to anyone who reaches the URL directly or through search — and an orphan page still gets indexed.
- **Suggested replacement:** Either add it to the Tech Projects list on `projects/index.md` (`title: The AI Wire`, `subtitle: Curated daily · static build`, with a `Launch The AI Wire` action) — after confirming it actually still updates — or remove it from `public/` so it stops being publicly reachable. Do not leave a "Curated daily" claim on a page nobody maintains.
- **Confidence:** med

### [P2] Serious work tools and kids' games share one undifferentiated grid
- **Where:** `content/pages/projects/index.md:85-272`
- **Quote:** The Tech Projects grid runs, in order: Marley1, BobLemieux.ai LLM Ecosystem, The Lynda Project, Weather Map, Federal Award Explorer, FEC Campaign Finance Explorer, VoxelCraft, Flash Frenzy, The Cheeseburgler, _"Bob & Kenny in: GAS STATION GUMMIES!"_, NYT Daily Digest, EMBERWATCH, ObstacleBoy — all in one `columns: 3` grid at the same visual weight.
- **Problem:** _"sneak around the diner, steal cheeseburgers, dodge Chef Pickles"_ and _"a 3 AM gas station trip featuring branching paths, WebAudio SFX, and halftone art"_ sit in the same grid, at the same weight, as a federal contract award explorer and a self-hosted LLM stack. The games are charming and genuinely demonstrate range — the problem is purely placement. An executive scanning for evidence of engineering judgement hits Chef Pickles between two data tools and downgrades the whole page. Note also that NYT Daily Digest and EMBERWATCH (both substantial) appear *after* three games, so the ordering actively buries the strongest items.
- **Suggested replacement:** Split into two labelled sub-sections within Tech Projects: **Data & Systems** (Marley1, LLM Ecosystem, Lynda, Weather, Spending, FEC, NYT, EMBERWATCH, and the three twins) and **Games & Experiments** (VoxelCraft, Flash Frenzy, Cheeseburgler, ObstacleBoy, Gas Station Gummies) with a one-line framing on the second — _"Things I built for my grandkids, and to learn a stack faster than a tutorial would."_ That line converts the games from a credibility risk into a personality asset.
- **Confidence:** high

### [P2] "Work Projects" content is duplicated verbatim across three pages
- **Where:** `content/pages/work-projects.md:28-88` reproduces the full body text of `projects/turnover-readiness.md:21`, `controls-automation.md:21`, and `schedule-cost-insight.md:21`; `projects/index.md:34-70` and `index.md:216-256` carry shortened variants of the same three descriptions
- **Quote:** The paragraph beginning _"Large capital projects generate thousands of completion items across mechanical, electrical, instrumentation, and controls disciplines—and tracking them in spreadsheets creates blind spots"_ appears in full in both `work-projects.md` and `turnover-readiness.md`.
- **Problem:** The same three paragraphs exist in four places with three different lengths. Any future edit has to be made four times or the site drifts out of sync — and the duplicate full-text blocks are a genuine SEO liability (`/work-projects` and `/projects/turnover-readiness` compete for the same query with the same body copy). It also means clicking "View project" from `/work-projects` delivers a page the visitor has already read word-for-word.
- **Suggested replacement:** Make `work-projects.md` a card index like `projects/index.md` — one-sentence teasers plus "View project" — and let the three project pages hold the full text. Then invest the space saved into the specifics recommended in the P1 finding above.
- **Confidence:** high

### [P2] Em-dash spacing splits the site into two styles
- **Where:** 15 unspaced em dashes across `index.md` (6), `work-projects.md` (2), `marley1.md` (2), and one each in `projects/index.md`, `lynda.md`, `boblemieux-ai.md`, `schedule-cost-insight.md`, `turnover-readiness.md` — against spaced em dashes throughout all four work case studies and all seven blog posts
- **Quote:** Unspaced — _"Computers have always been my leverage—how I compress time"_, _"spreadsheet chaos—and tracking them"_, _"assume you're sitting at a desk with power, internet, and a full workstation—but real-world work"_. Spaced — _"in Whiting, Indiana — including a new 102,000 BPD coker"_, _"Marley1 — my portable AI and compute platform — is designed the same way"_.
- **Problem:** The split maps almost exactly onto authorship: the marketing pages use closed em dashes, the case studies and blog use spaced. On a site where the whole pitch is precision and discipline, inconsistent typography across pages is a small but real tell — and the closed em dash on long lines also hurts readability at mobile widths.
- **Suggested replacement:** Standardise on the spaced em dash (` — `), matching the majority and the case studies. 15 replacements across 8 files.
- **Confidence:** high

### [P2] The contact block reads as a half-filled form
- **Where:** `content/data/config.json:97-106`
- **Quote:** `"title": "Contact details"`, `"phoneNumber": ""`, `"phoneAltText": ""`, `"address": "USA"`, `"addressAltText": "My location"`
- **Problem:** A block headed "Contact details" containing an empty phone field and the location "USA" is worse than no block. "USA" tells a prospective client nothing — it does not answer the only question they have, which is whether Bob is placeable on their program. And "My location" / "My email" as alt text is starter-template phrasing that survived the fork.
- **Suggested replacement:** Set `"address"` to a real metro and availability posture, e.g. `"Greater Boston · available for travel and remote"`. Either fill the phone field or leave it empty and retitle to `"Contact"`. Change the alt texts to `"Email"` and `"Location"`.
- **Confidence:** med

### [P2] Marley1's page is concept copy while the blog has the actual hardware
- **Where:** `content/pages/projects/marley1.md:28` vs `blog/post-three.md:96` and `post-one.md:112`
- **Quote:** marley1.md — _"a compact device running local LLMs, agent systems, and edge processing that can operate offline or on limited networks... The goal isn't to replace desktops; it's to extend capability into contexts where it's never existed before."_ post-three.md — _"The Pi 5 doesn't need to know what the Orin Nano is doing. It just needs the interface to work."_
- **Problem:** The blog names the hardware; the project page does not. Marley1 is referenced as a flagship on the homepage, in three separate blog posts, and on `/projects` — but its own page is the least specific description of it anywhere on the site. It is pure positioning: no board, no model, no power budget, no form factor beyond "palm-sized" (which appears only in post-one, not on the project page), no photo of a working unit, no status. A tech reader who follows three references to Marley1 and arrives at a page with no hardware in it concludes it does not exist yet — which may be true, in which case the page should say so.
- **Suggested replacement:** _"Marley1 is a palm-sized compute unit for AI work in places with no reliable power or network — industrial sites, remote locations, a truck. Current build: a Raspberry Pi 5 handling I/O and orchestration alongside a Jetson Orin Nano running the models, with [X]W draw and [X]h on battery. It runs [model] locally for document extraction and summarisation with no cloud round-trip, which matters as much for confidentiality as for connectivity — on most owner sites the data cannot leave the fence line anyway.\n\nStatus: [prototype / v2 in build]. Photos and build notes in the blog."_ Say plainly where it stands.
- **Confidence:** high

## Summary counts

| Priority | Count |
|---|---|
| P0 | 7 |
| P1 | 12 |
| P2 | 9 |
| **Total** | **28** |

Typos and mechanics: **13 distinct issues** (4 of them the surname), tabulated above and not double-counted in the 28.

## What to fix first

1. `config.json` and `bob-lemieux.json` — the name. Four strings, five minutes, and it is on every page.
2. The `$300M` line in `info.md` — it contradicts the best evidence on the site.
3. `Chevron Phillips Hydrocracker` → `Cedar Bayou Ethane Cracker`, both occurrences.
4. `40+ years` / `four decades` → `45 years`, five files.
5. Rewrite the homepage hero to lead with BP Whiting, Cedar Bayou, and a number. It is the page most visitors will judge everything else by.
6. Fix or delete post-six and post-seven, and repoint the homepage featured posts.
7. The `boblemieux-ai.md` local-LLM claim — one paragraph, and it is the only outright falsifiable statement on the site.
