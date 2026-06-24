# Netlify Developer Portfolio Starter (auto-annotated)

![Developer Portfolio](https://assets.stackbit.com/docs/personal-nextjs-starter-thumb.png)

This is a full-fledged portfolio website built with Next.js, Tailwind CSS, [visual editor](https://docs.netlify.com/visual-editor/overview/) and the [Git Content Source](https://docs.netlify.com/create/content-sources/git/).

The codebase showcases **how to apply annotations at scale**, meaning: how to make much of your components [highlightable in the visual editor](https://docs.netlify.com/visual-editor/visual-editing/inline-editor/) through data attributes without manually adding code throughout the codebase.

**This is achieved by:**

1. Adding an annotation property to the content objects at they're loaded (see `src/utils/content.ts`)
1. When rendering the page, each content sub-object is dynamically matched to the appropriate component. At this point, wrap each component with an annotation, based on the abovementioned content property. See `src/components/components-registry.tsx`.

**⚡ Demo:** [auto-annotated-portfolio.netlify.app](https://auto-annotated-portfolio.netlify.app)

## Deploying to Netlify

If you click "Deploy to Netlify" button, it will create a new repo for you that looks exactly like this one, and sets that repo up immediately for deployment on Netlify.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/auto-annotated-portfolio)

## Getting Started

The typical development process is to begin by working locally. Clone this repository, then run `npm install` in its root directory.

Run the Next.js development server:

```txt
cd auto-annotated-portfolio
npm run dev
```

Install the [Netlify visual editor CLI](https://www.npmjs.com/package/@stackbit/cli). Then open a new terminal window in the same project directory and run the Netlify visual editor dev server:

```txt
npm install -g @stackbit/cli
stackbit dev
```

This outputs your own Netlify visual editor URL. Open this, register or sign in, and you will be directed to Netlify's visual editor for your new project.

![Next.js Dev + Netlify visual editor dev](https://assets.stackbit.com/docs/next-dev-stackbit-dev.png)

## Next Steps

Here are a few suggestions on what to do next if you're new to Netlify Visual Editor:

- Learn [how Netlify Visual Editor works](https://docs.netlify.com/visual-editor/overview/)
- Check [Netlify visual editor reference documentation](https://visual-editor-reference.netlify.com/)

## Projects: FEC Campaign Finance Explorer

`/projects/fec` is a self-contained explorer for FEC campaign-finance data
(OpenFEC API), following the same pattern as the Federal Award Explorer
(`/projects/spending`): a static app in `public/projects/fec/` embedded via an
iframe, backed by an in-repo API route.

- **Proxy:** `src/pages/api/fec.js` — a generic, allow-listed proxy that injects
  the server-side `FEC_API_KEY`, forwards to `https://api.open.fec.gov/v1`, and
  handles 429 rate limits with backoff. The key is **never** exposed to the browser.
- **Tabs:** Contributions (Schedule A), Committees, Candidates, Independent
  Expenditures (Schedule E), Filings, and a Cross-Reference tab that joins FEC
  contributions to USAspending federal contract awards with a 0–100 match
  confidence score (name-only matches are flagged `REVIEW`).
- **Health check:** `GET /api/fec?health=1` hits `/candidates/search?q=cramer`
  to confirm the key works end to end.

### Setting `FEC_API_KEY`

Get a key at [api.data.gov/signup](https://api.data.gov/signup/).

- **Local:** add `FEC_API_KEY=your_key_here` to `.env.local` (gitignored — never commit it).
- **Production (Netlify):** add it as an environment variable, then redeploy:
  ```txt
  netlify env:set FEC_API_KEY your_key_here
  ```
  or in the UI: **Site settings → Environment variables → Add a variable**
  (key `FEC_API_KEY`, scope: all / Functions). Do not commit the key.

### Compliance & use

FEC data is provided for **research and transparency purposes only**. Under
52 U.S.C. § 30111(a)(4), contributor information (including names and addresses)
may **not** be used for commercial purposes or to solicit contributions or
donations. This is not an official government product.

## Support

If you get stuck along the way, get help in our [support forums](https://answers.netlify.com/).
