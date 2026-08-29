# CLAUDE.md

## Canonical checkout

- **`~/Projects/boblemieux` on branch `main`.** This is the working copy and the
  deploy path. Netlify builds `main` and publishes to https://boblemieux.ai.
- Remote is https://github.com/roblem28/boblemieux.git.
- There is a second checkout under `~/OneDrive/Documents/GitHub/boblemieux`. It is
  **not** the working copy — it sits on an unrelated branch and is not deployed.
  Do not work in it.

## Shell & Git

- Prefer PowerShell for git on this machine.
  - PowerShell 5.1 has no `&&` / `||`. Use `A; if ($?) { B }`.
  - A here-string passed to `git commit -F-` does **not** reach stdin; write the
    message to a file and use `git commit -F <file>`.
- **Never `git add -A`.** Stage explicit paths, always.
- `ClaudeCodetoNetlifyToken.txt` is gitignored and must stay that way. Check with
  `git check-ignore -v ClaudeCodetoNetlifyToken.txt` before any commit that could
  reach the repo root.
- Commit or push only when asked. Branch first if the work is speculative.

## Layout

| What | Where |
|---|---|
| Site (Next.js) | `src/`, `content/` |
| Standalone games | `public/games/<name>/` — self-contained, served statically |
| Game tests | `tests/<name>/run.js` |
| Game specs / design docs | `docs/<name>/` |
| Subagent definitions | `.claude/agents/` |

Games under `public/games/` are plain static files served straight by Netlify;
they are not part of the Next.js build. `netlify.toml` proxies
`/games/obstacleboy/*` to a separate site — everything else under `/games/` is
served from this repo.

## Tests

```
node tests/<game>/run.js <url>
```

Playwright is a devDependency, so `npm install` is enough — no `NODE_PATH`
juggling. Chromium itself is separate: `npx playwright install chromium`.

Serve the game locally before running a suite, e.g. any static server rooted at
`public/`, then pass `http://127.0.0.1:<port>/games/<name>/?debug`. Most suites
need `?debug`, which exposes internals on `window`.

Headless Chromium runs on SwiftShader here. It is fine for behaviour, DOM and
screenshots; it is **not** valid for frame-rate or GPU numbers. Those need real
Chrome.

## Solar Savers

`docs/solar-savers/SPEC.md` is authoritative for that game — it wins over any
prompt, and every amendment is logged in its final section with the measurement
that motivated it. Read it before changing the game.
