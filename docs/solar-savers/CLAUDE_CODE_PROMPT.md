Continue Solar Savers. `docs/solar-savers/SPEC.md` is authoritative; read it in full before touching code. Where this prompt conflicts with SPEC.md, SPEC.md wins — flag the conflict.

## How we work
- Implementation stays in this main session. Subagents (`ss-*`, seven of them, see `/agents`) are for verification, measurement, and deployment only.
- Subagents start with fresh context. Every delegation names the file path, the milestone, the SPEC sections, and the exact question. "Review the code" is a wasted invocation.
- Run reviewers in parallel only when independent (game-feel-critic ∥ ip-compliance-reviewer). test-engineer green before perf-gatekeeper before deploy-agent, always.
- A FAIL blocks the milestone. Fix, re-run that reviewer. Findings pass through to me verbatim — no paraphrase.
- If you and a reviewer disagree, tell me; do not silently pick a side.
- Stage only `public/games/solar-savers/` and `tests/solar-savers/`. Never `git add -A`.

## Phase 0 — reconcile
M1 and M2 are live. Write `docs/solar-savers/PLAN.md`: for each SPEC section 2–8, state whether the live code already conforms (cite lines) or what changes M3 needs. Stop and show me the plan. No code until I approve.

## Phase 1 — M3 (difficulty, shield, radar, tracking — SPEC §4, §7, §8, §3)
Implement. Then, in order: ss-test-engineer (§12 M3 tests), ss-game-feel-critic (§3, rate tracking on all three difficulties), ss-balance-auditor (§9 all three difficulties), ss-perf-gatekeeper (§11; if my Chrome is minimized report BLOCKED and ask me), ss-ip-compliance-reviewer (§13), ss-deploy-agent. Insert marker `<!-- SS-M3 -->`. Report and stop. **M3 is the feel gate — I play it before M4 starts.**

## Phase 2 — M4 (Planatron — SPEC §10)
After I say M3 passed. Implement. Gates: test-engineer, balance-auditor (boss fight winnable on MEDIUM by the scripted bot within the cannon timer), softlock-hunter (boss phase transitions, R at every state), perf-gatekeeper (boss scene gate), ip-compliance-reviewer, deploy-agent. Marker `<!-- SS-M4 -->`. Report and stop; I play it.

## Phase 3 — M5, M6
Same gate sequence per §14. Checkpoint with me after each.

## Reporting
At each stop: what shipped, every reviewer verdict line verbatim, measured numbers in a table, commit hash, deploy id, live URL 200 check. Nothing else.
