# Repo Cleanup Audit

**Date:** 2026-08-27
**Branch:** `site-overhaul-aug26`
**Backup tag:** `pre-cleanup-backup` → `1e90ea9` (tree clean at tag time)
**Method:** read-only. Nothing deleted. Every candidate below carries the command-level evidence that found it.

**Excluded from consideration per instruction:** `review/`, `public/games/**`, and the pages the earlier rules protect — `/wire`, the games, the comic, the mind map, and the three digital twins.

---

## Summary

| Bucket | Files | Bytes | Confidence |
|---|---:|---:|---|
| A. Orphaned Stackbit preset thumbnails | 13 | 906,980 | High |
| B. Unused starter gallery images | 4 | 112,335 | High |
| C. Unused SVG icon components | 20 | ~20,500 | Medium — see caveat |
| D. `graphcast_demo.ipynb` | 1 | 42,374 | High (misplaced, not dead) |
| E. Dead generated types | 2 exports | ~small | High |
| F. `ProjectFeedLayout` | 1 dir + wiring | ~2,000 | Medium |
| **Total** | **~41** | **~1.08 MB** | |

Duplicate-file scan found **nothing**: `sha1sum` across `public/`, `content/`, `src/`, `scripts/` produced zero repeated hashes.

---

## A. Orphaned Stackbit preset thumbnails — 13 files, 906,980 bytes

The largest single win, and the safest. Commit `8322a0f` deleted the CtaSection, QuoteSection, TestimonialsSection and MediaGallerySection components together with their models and preset JSON — but the preset *thumbnail images* those JSONs pointed at were left behind. Nothing references them now.

Evidence: for each file, `grep -rl <name> .stackbit/ | grep -v presets/images` returns 0.

| Bytes | File |
|---:|---|
| 307,041 | `.stackbit/presets/images/media-gallery-primary-2-col.png` |
| 94,415 | `.stackbit/presets/images/testimonials-secondary-big-images-list.png` |
| 75,698 | `.stackbit/presets/images/quote-transparent-left.png` |
| 75,545 | `.stackbit/presets/images/quote-transparent-centered.png` |
| 67,443 | `.stackbit/presets/images/testimonials-dark-small-images-col.png` |
| 59,661 | `.stackbit/presets/images/media-gallery-transparent-4-col.png` |
| 58,335 | `.stackbit/presets/images/cta-transparent-btn-bottom.png` |
| 52,165 | `.stackbit/presets/images/cta-transparent-btn-right.png` |
| 44,004 | `.stackbit/presets/images/quote-secondary-left.png` |
| 32,823 | `.stackbit/presets/images/testimonials-white-small-images-list.png` |
| 24,172 | `.stackbit/presets/images/cta-primary-btn-bottom.png` |
| 10,694 | `.stackbit/presets/images/divider-wide.png` |
| 4,984 | `.stackbit/presets/images/media-gallery-dark-5-col.png` |

`divider-wide.png` is the odd one out — its `DividerSection` model still exists, but no preset JSON references this particular variant thumbnail.

**Risk:** none to the site build; these are visual-editor thumbnails only, and their presets are already gone.

---

## B. Unused starter gallery images — 4 files, 112,335 bytes

Evidence: `grep -rl <name> content/ src/ public/ netlify.toml scripts/` returns 0 for each.

| Bytes | File | Refs |
|---:|---|---:|
| 37,865 | `public/images/gallery-2.jpg` | 0 |
| 29,005 | `public/images/gallery-3.jpg` | 0 |
| 26,055 | `public/images/gallery-1.jpg` | 0 |
| 18,351 | `public/images/gallery-4.jpg` | 0 |

These were the MediaGallerySection sample assets. That component is gone.

**Risk:** none. They are not referenced from any page, the sitemap, or the visual editor.

**Explicitly NOT in this bucket** — every other image in `public/images/` has at least one reference and stays:
`bob.jpg` (8 refs), `marley1.jpg` (2), `bg1/bg2/bg3.jpg` (2 each — still the featured images on five project pages), `bp-whiting.jpg`, `moontwin.jpg`, `earthtwin.jpg`, `exotwin.jpg`, `harvard-nw.jpg`, `cpchem-cedar-bayou.jpg`, `integra.jpg`, `favicon.svg`, and `about.jpg` (referenced by `content/data/team/bob-lemieux.json`).

---

## C. Unused SVG icon components — 20 files, ~20,500 bytes

Evidence: no content file sets these as an `icon:` value and no module imports them directly.

`apple`, `arrow-left`, `arrow-left-circle`, `arrow-right`, `arrow-right-circle`, `arrow-up-left`, `bluesky`, `cart`, `chevron-left`, `chevron-right`, `facebook`, `google-play`, `instagram`, `mail`, `play`, `play-circle`, `reddit`, `send`, `twitter`, `vimeo`, `youtube`

Actually rendered today (6): `github`, `linkedin` (from `config.json` social links), `close` and `menu` (direct imports in `Header`), `arrow-up-right` (direct import in `PostFeedSection` and `ProjectFeedSection`).

**Why this is worth doing:** `Social`, `Action` and `HeaderLink` resolve icons through a computed `iconMap[icon]` lookup, which webpack cannot tree-shake — so all 24 mapped icons ship in the bundle regardless of what content selects.

**Caveats, both real:**
1. **`facebook` must survive.** It is the hardcoded default at `src/components/atoms/Social/index.tsx:8` — deleting it breaks any social link authored without an explicit icon. Recommend cutting 20 and keeping `facebook`.
2. **`instagram` was in use until commit `ae07ccc`** removed it from the header. It is genuinely unreferenced now, but it is the one most likely to be wanted back.

Deleting these permanently narrows what a content author can pick in the visual editor. **Lower confidence than A or B — flag for a yes/no rather than assuming.**

---

## D. `graphcast_demo.ipynb` — 1 file, 42,374 bytes

A verbatim copy of DeepMind's public GraphCast Colab notebook, sitting at the repo root. Zero references from `content/`, `src/`, `public/`, `netlify.toml` or `package.json`. It is unrelated to the Next.js site; it lives here so a Colab badge resolves against the GitHub repo.

**Not dead so much as misplaced.** Recommend moving it to its own repo rather than deleting outright — the Colab badge inside it points at `github/roblem28/boblemieux/blob/preview/graphcast_demo.ipynb`, so deleting it breaks that link for anyone who has it.

---

## E. Dead generated types — 2 exports

Evidence: `grep -rl <name> src/ .stackbit/ | grep -v types/generated.ts` returns 0.

- `src/types/generated.ts:3` — `DataModelType`
- `src/types/generated.ts:6` — `DATA_MODEL_NAMES`

**Checked and NOT dead** (all have live references outside the file, contradicting an earlier lane's report): `SectionModels` (15), `Label` (19), `Button` (17), `MetaTag` (5), `Person` (3), `ContactBlock` (3), `ProjectFeedLayout` (5).

---

## F. `ProjectFeedLayout` — 1 directory + registry entry + resolver branch

No content file uses `type: ProjectFeedLayout`; `content/pages/projects/index.md` is a `PageLayout`. But unlike the components removed in `8322a0f`, this one still has live wiring in three places:

- `src/components/components-registry.tsx:71`
- `src/components/layouts/ProjectFeedLayout/index.tsx`
- `src/utils/static-props-resolvers.ts` — imports the type and carries a resolver branch that is never taken

Removing it means editing the resolver, and its sibling `PostFeedLayout` **is** used by `content/pages/blog/index.md`, so the two must not be confused.

**Medium confidence. Recommend deferring** unless you want the resolver simplified — the gain is ~2 KB of source and the risk is touching a working code path.

---

## Checked and found clean — no action

**Duplicate files.** `sha1sum` over `public/`, `content/`, `src/`, `scripts/` → zero repeated hashes.

**package.json dependencies.** A naive grep flags `react-dom`, `@types/glob`, `@types/react`, `@types/react-syntax-highlighter`, `prettier` and `typescript` as unreferenced — **all six are false positives.** `react-dom` is required by React and Next at runtime; the `@types/*` packages are consumed by the compiler, never imported by name; `typescript` is required by the build and by `tsc --noEmit`; `prettier` is config-driven via `.prettierrc`. Every other dependency has direct import evidence. **Nothing to remove here** — the earlier `js-yaml` removal in `8322a0f` was the only genuine case.

**Orphaned content docs.** Every markdown page under `content/pages/` routes. `content/data/team/bob-lemieux.json` is **not** orphaned — it is the `author:` on all seven blog posts (an earlier lane reported it as orphaned; that was wrong).

**Stackbit scaffolding still in use.** `stackbit.config.ts` and the remaining 36 models and 11 preset JSONs are loaded by the visual editor. Not referenced by `next build`, but not leftovers either — deleting them retires the visual editor entirely, which is a product decision, not cleanup.

**Env and config.** Every `process.env` read resolves to something live: `URL` and `DEPLOY_PRIME_URL` (Netlify, used by seo-utils and the sitemap), `FEC_API_KEY` (server-only, defined in the untracked `.env.local`), `NODE_ENV`. The dead `STACKBIT_PREVIEW` plumbing was already removed in `8322a0f`.

**Redirects.** All 7 rules in `netlify.toml` have valid targets: the three proxies point at live external sites, and `/work/systems/`, `/projects/` and `/projects/play/` all exist in the build output. No dead rules.

**Unused components.** None remain — `8322a0f` cleared them, and a fresh sweep of `sections/`, `molecules/`, `layouts/` and `atoms/` finds nothing unreferenced.

---

## Proposed deletion order (STEP 4, pending approval)

One commit per bucket, `npm run build` after each, revert any bucket that breaks the build.

1. **Bucket A** — orphaned preset thumbnails (13 files, 907 KB) — zero risk
2. **Bucket B** — gallery images (4 files, 112 KB) — zero risk
3. **Bucket E** — two dead type exports — zero risk
4. **Bucket C** — 20 SVGs, keeping `facebook` — *needs your yes/no*
5. **Bucket D** — `graphcast_demo.ipynb` — *recommend move, not delete; needs your call*
6. **Bucket F** — `ProjectFeedLayout` — *recommend deferring*

Buckets 1–3 total **~1.02 MB across 19 files** and carry no risk to the build or the site. Buckets 4–6 are judgment calls.
