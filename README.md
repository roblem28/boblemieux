# CurveGen

CurveGen is a standalone curve generation workspace built with Next.js and Tailwind CSS. It lets you compose mathematical expressions, preview the resulting curve, and store every experiment in a simple project-level database.

## Features

- ⚡️ Real-time plotting driven by a lightweight expression parser.
- 💾 Zero-setup persistence backed by a JSON database (`data/curves.json`).
- 🧰 REST API (`/api/curves`) for listing, creating, and deleting saved curves.
- 🎨 A polished single-page experience tuned for generative designers.

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) to explore the CurveGen workspace.

> **Note**
> `data/curves.json` seeds the app with a couple of example expressions. You can safely remove or edit them.

## Project structure

- `src/pages/index.tsx` – marketing content, workspace form, and curve library UI.
- `src/components/CurvePlot.tsx` – SVG-based plotter that samples equations.
- `src/pages/api/curves` – REST endpoints for listing, creating, and deleting curves.
- `src/lib/curve-store.ts` – file-backed data store abstraction.
- `src/utils/expression.ts` – infix expression parser and evaluator.

## Database

CurveGen ships with a file-backed JSON database so you can version control curve data alongside your code. The database lives at `data/curves.json` and is manipulated exclusively through the `curve-store` utility. Swap the implementation for SQLite, Postgres, or a hosted service without changing the UI layer.

## License

MIT © 2025 CurveGen
