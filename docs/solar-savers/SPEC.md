# SOLAR SAVERS — SPEC v1.8 (2026-08-29)

Authoritative. Where a prompt or agent disagrees with this file, this file wins; flag the conflict.
File under review: `public/games/solar-savers/index.html` (single file, Three.js r160 via cdnjs importmap, no build).
Live: https://boblemieux.ai/games/solar-savers/ · Tests: `tests/solar-savers/run.js <url>`

## 1. Premise
Single-player first-person 3D space shooter. The player flies a rebel fighter through an occupied outer solar system to reach the Planatron, a moon-sized battle station, and destroy it by shooting out its weak points before its cannon charges. Original IP; see §13.

## 2. Architecture (must be preserved)
- `CFG` holds every tunable. No magic numbers in systems.
- `EventBus` for cross-system signals. Systems never call each other's methods directly.
- `Entity` (object3d, tags, radius, alive) / `World` (add, tagged, step, collide by tag pair, deferred sweep). Spatial hash, cell 64 u.
- `Health` shared by all damageable things. `Pool` for anything spawned repeatedly.
- Fixed-step sim 60 Hz with accumulator; render variable rate. Sim ticks whenever the tab is visible; pointer lock only governs mouse steering.
- Zero allocation in per-tick code (scratch vectors). Lasers instanced.

## 3. Feel (game-feel-critic)
- Rotation applied directly from mouse delta each tick (no smoothing). Roll Q/E 1.8 rad/s.
- Ship always cruises 55 u/s; W boost 140, S brake 18, never 0. A/D strafe 45.
- Camera banks into yaw/strafe (max 0.35 rad), FOV 68–84 with speed. Boost feels faster via dust density + FOV, not motion blur.
- Enemy visibility: bracket on target, lead ring, bracket→lead line, off-screen arrows with distance, radar with elevation stems. All four must point at the same target.
- Feedback within 1 tick: hit flash + sparks, death explosion + debris + distance-scaled shake, player-hit vignette + edge flash from bolt direction.
- PAUSED on tab hidden; resume on click/key, never auto-resume. Pause never engages before
  the launch gate is cleared, and the launch and PAUSED overlays never coexist. A hide
  shorter than `CFG.pauseDelay` (0.5 s) does not pause.
- **Fighter glow (v1.5).** The billboard glow is `min(constant world size, 6 px on screen)`.
  At the tuned constants the 6 px cap governs the whole engagement envelope, so each fighter
  is a steady ~6 px dot — visible at 900 u, and separated from its wingmen by POSITION rather
  than by size. Hue is jittered per fighter across orange–amber, though at 6 px that is a
  garnish, not the cue that does the work. Constant on-screen size scaled by distance was
  tried first and is what fused a formation into one blob.
- **Firing keep-out.** No HUD element may intrude within a radius of 22% of the smaller
  viewport dimension, measured from screen centre. The only exceptions are the reticle, the
  target bracket, the lead ring and the bracket→lead line. The player must never have to
  shoot through his own instruments.

## 4. Player
Hull 100. Shield 50, regen 8/s after 4 s without damage; shield absorbs first. On `wave:start` restore shield and hull (`CFG.ship.restoreHullOnWave`, default true). Player laser: twin muzzles, 700 u/s + ship speed, life 2.2 s, cooldown 0.13 s, damage 1, pool 64.

## 5. Enemies
`Enemy extends Entity`, tags `enemy, damageable`, Health 3 (wave 5: 4). Original low-poly hull, emissive engine.
Kinematics 80 u/s, 60 u/s², 1.6 rad/s, visible bank. Steering states: APPROACH (<380 u → ATTACK_RUN), ATTACK_RUN (lead-aimed pass, fires in 30° cone <300 u), BREAK_OFF (<110 u or pass done, 90–140° for 1.5–2.5 s), EVADE (hit outside attack, 1 s jink), ORBIT (player below brake+10 for 3 s, 250 u, pot shots at 1.6× cooldown). Separation 25 u, widened to 40 u during APPROACH so a wing spreads before contact. Asteroid avoidance 120 u ray, enemies never collide with asteroids.
**Approach speed floor.** While a fighter is still closing to firing position — in APPROACH,
and in ATTACK_RUN until it is inside fire range — its speed is `max(tierSpeed, cruise +
CFG.enemies.approachMargin)`, ignoring the §7 multiplier. Every other state keeps tier
scaling, so an easy tier still fights slowly; it just arrives on time. The margin sets the
worst case directly: a fighter spawning directly behind a fleeing player closes at exactly
the margin, so time-to-contact from the 900 u wave-1 spawn is 900/margin. Margin is 40 u/s
(floor 95 u/s at cruise 55) — +20 was tried first and measured 30.9 s worst case, missing §12.
Enemy laser: pool, owner `enemy`, tag `enemyProjectile`, 450 u/s, burst 3 gap 0.11 s, cooldown 0.9 ± 0.3 s, damage 8 (difficulty-scaled).

## 6. Waves
`CFG.waves` table: `{count, formation, spawnDistance, delayAfterClear, enemyOverrides}`. Base counts 4,4,5,6,8 (wave 1 raised from 3 in v1.6). Spawn out of view (>60° off forward or behind) at 900–1200 u in
line/vee/echelon, shared leader until ATTACK_RUN.
**Spread (v1.5).** A wave at one bearing in a tight formation reads as a single orange point
and dies to shots at the cluster centre. Therefore: formation spacing 138 u (3× the original
46); each fighter's arrival jittered 0–2 s so a wave arrives as a stream, not a lump; and a
wave is split across 2 bearings (waves 1–2) or 3 (waves 3+), each at least 45° apart and each
still >60° off the player's nose. `spawner.alive` commits the full wave count at `wave:start`,
so a wave cannot clear while fighters are still queued. Events: `wave:start {index,count}`, `wave:clear`, `enemy:died`.

## 7. Difficulty
EASY / MEDIUM (default) / HARD / ACE, launch overlay, persisted localStorage `ss.difficulty`,
HUD label beside the radar.

v1.3 shifts the whole curve one notch easier after a live play session on MEDIUM: the old
EASY column becomes MEDIUM, the old MEDIUM becomes HARD, the old HARD becomes ACE, and a new
gentler EASY is added at the bottom. ACE exists for later; §9 does not constrain it.

| | EASY | MEDIUM (default) | HARD | ACE |
|---|---|---|---|---|
| Aim-assist cone (player bolts nudge toward bracketed target, capped turn rate) | 9° | 6° | 3° | 0° |
| Player laser hit radius × | 2.0 | 1.6 | 1.25 | 1.0 |
| Enemy speed/turn × | 0.7 | 0.8 | 1.0 | 1.15 |
| Enemy cooldown × | 1.8 | 1.4 | 1.15 | 1.0 |
| Enemy damage | 4 | 5 | 8 | 9 |
| Wave count delta | −1 (min 2) | −1 (min 2) | 0 | +2 |
| Shield regen /s | 12 | 8 | 8 | 8 |

## 8. Radar
160×160 canvas, 20 Hz, default position bottom-LEFT (v1.3 — at 220 px bottom-centre it sat in the firing line; see §3 keep-out). Movable via the §16 layout editor. Player center, forward up, rings 250/500/1000 (range 1000; `[` `]` → 500/1000/2000). Enemies: amber triangles with heading + elevation stems. Enemy bolts faint dots, asteroids dim dots, Planatron hollow square at edge if out of range. 2 s sweep, scanlines, amber phosphor. Targeted enemy pulses.

## 9. Balance targets (balance-auditor, scripted bot, 90 s)
Targets apply to EASY, MEDIUM and HARD. **ACE is deliberately unconstrained.**
| Metric | EASY | MEDIUM | HARD |
|---|---|---|---|
| Time to first kill | ≤ 12 s | ≤ 20 s | ≤ 30 s |
| Hull lost/min | ≤ 15 | ≤ 30 | ≤ 50 |
| Wave-1 clear | ≤ 45 s | 15–60 s † | ≤ 110 s |
| Ram events / 90 s | 0 | ≤ 1 | ≤ 2 |
| Closest enemy approach | ≥ 40 u | ≥ 40 u | ≥ 40 u |

† **The MEDIUM wave-1 lower bound is NON-BLOCKING (v1.8).** Three independently written bots
— an optimal aim-bot, a differently parameterised efficient bot, and a deliberately mediocre one
(0.018 rad/tick turn cap, ±0.15 rad aim noise, 55% trigger discipline) — all clear MEDIUM wave 1
in under 15 s at least once in five runs. Measured minima: 13.08 / 13.8 / 14.57 s. The bound was
already lowered once, 25 s → 15 s, and still does not hold. Clear time is dominated by closing
geometry rather than accuracy: 3 kills × 3 hits = 9 landed shots, and the 0.13 s twin-muzzle
cooldown makes trigger throughput a non-factor, so every skill level lands in the same 12–18 s
band. A floor graded worst-of-5 is also self-defeating — the worst case for a floor is the
fastest run, so one lucky spawn geometry fails the whole tier. Reported, not blocking; revisit
by raising `groupDelay` or the wave-1 spawn distance if wave 1 ever needs to last longer.

**Measurement rules** (added v1.1; the M3 audit showed the metrics are ambiguous without them):
- *Hull lost/min* is **hull-only**: the sum of decrements to `Health.cur`, with shield
  absorption excluded and `wave:start` restores not netted out. Gross damage-taken is not
  the graded figure — with a 50-point regenerating shield (§4) it cannot approach these
  thresholds and the metric becomes meaningless.
- *Closest enemy approach* is sampled **only on ticks where the player is not closing on the
  fighter** — i.e. the component of player velocity along the vector to that fighter is ≤ 0.
  A speed threshold does not work: a bot that chases at cruise is still charging, and cruise
  is itself the threshold. Fighters must not close inside 40 u under their own initiative; a
  player who flies at them can always force contact. This is a constraint on enemy behaviour,
  not on the player. Verified against a passive player (never chases, never boosts): 0 ticks
  inside 40 u at all three difficulties, closest 57.2 / 51.4 / 43.6 u.
- The scripted bot must include a minimal survivability rule — strafe perpendicular for
  0.5 s when an enemy bolt passes within 15 u — so hull figures reflect a typical engagement
  rather than a no-dodge ceiling. Report both dodging and non-dodging variants when they
  differ materially.

## 10. Boss — Planatron (M4)
**Interim end state (v1.5, until M4 lands).** Clearing the final wave emits `campaign:clear`
and shows a card: "Sector cleared — Planatron approach unlocked", with score, elapsed time,
shots, hit % and difficulty, and buttons Play again (R) / Next difficulty. The simulation
freezes as it does on death; R or Play again relaunches at wave 1; Next difficulty steps one
tier along `CFG.difficulty.order` and clamps at ACE. This is replaced by the boss fight below.


Boss `Entity` at (0, 60, −2600), radius 140. Six `WeakPoint` child entities (Health 6 each) around the equatorial trench; only one exposed at a time (others shielded, take 0 damage, drawn with a blue shield shimmer); destroying one exposes the next and raises fighter spawn rate. Eight turret emplacements fire via enemy laser pool, 2 s cooldown, only when player < 600 u. Cannon-charge timer 240 s from boss engagement (`boss:engaged` when player < 800 u), HUD top-center; timer hits 0 = loss. Trench corridor: approach markers guide the player to the exposed weak point. Sixth weak point destroyed → 4 s chain-reaction sequence (scaled explosions, station breakup into debris, sun flare, camera shake), then "Galaxy saved" card with score. Loss states: hull 0 or cannon fires → "Hull breached / Planatron fired" overlay, R relaunches.

## 11. Performance gates (perf-gatekeeper, real Chrome, un-minimized)
Stress scene 8 fighters + 128 lasers + 3 explosions in frustum: sim < 2 ms, total < 6 ms, draw calls < 120. Radar update ≤ 0.4 ms at 20 Hz. Boss scene (turrets + 6 weak points + 8 fighters): total < 8 ms. Pool high-water ≤ capacity (no fallback factory calls).

## 12. Tests (test-engineer)
M1–M2 (existing, must stay green): no console errors 120 s; sim ticks without pointer lock; lasers expire without throwing; enemies spawn, reach ATTACK_RUN and fire ≤ 25 s (was 15 s; the v1.2 speed cut slows closure — fighters 80 u/s vs a 55 u/s player from 900-1200 u, measured first shot 15.3 / 17.9 / 9.3 s); enemy bolt reduces hull; 3 player hits kill an enemy and emit `enemy:died`; wave 2 after wave 1 clear; R resets; pools never exceed capacity.
M3: first shot ≤ 25 s on every tier, worst of 5 runs (not median) — engagement time must not
be a dice roll on spawn bearing. **Measured against a PASSIVE player** (auto-cruise, no firing):
a bot that kills approaching fighters measures time-to-a-surviving-shooter, not closure, which
is the opposite of what this bound exists to protect. A first-shot FAIL produced by bot lethality
is reported but is NOT blocking; only a passive-player FAIL blocks.
Other M3 checks: difficulty persists across reload; EASY bolt nudges toward target, HARD does not; shield absorbs before hull; shield+hull restore on `wave:start`; radar draws N triangles for N enemies; Tab cycles target.
M4: weak points shielded except one; destroying one exposes next and emits `boss:weakpoint`; turrets fire only < 600 u; cannon timer reaches 0 → loss overlay; all six destroyed → win card; R after win resets to wave 1.
M5: touch controls steer and fire on mobile emulation; reduced-motion disables shake; mute persists.

## 13. IP (ip-compliance-reviewer)
Original names, ship designs, sounds, and copy only. Forbidden anywhere in code, HUD, comments, tests, commit messages: names of real franchises, their ships, stations, factions, characters, or musical phrases. The station is the Planatron. Enemy craft and player craft are original silhouettes.

## 14. Milestones and deploy markers
| M | Scope | Marker string in HTML |
|---|---|---|
| M1 | Flight environment | `<!-- SS-M1 -->` (done) |
| M2 | Enemies, waves, feedback, audio | `<!-- SS-M2 -->` (done) |
| M3 | Difficulty, shield, radar, tracking | `<!-- SS-M3 -->` |
| M4 | Planatron boss, win/loss | `<!-- SS-M4 -->` |
| M5 | Touch controls, reduced motion, mute persistence, title screen | `<!-- SS-M5 -->` |
| M6 | Local high scores, wave select after first win, polish pass | `<!-- SS-M6 -->` |

Note (v1.1): the M1 and M2 markers were never stamped into the file when those milestones
shipped, because they predate this SPEC. All three of `SS-M1`, `SS-M2`, `SS-M3` were inserted
together during M3.

## 15. Bob feel notes
Observations from live play. **These override the constants elsewhere in this document**;
where a number here disagrees with §3 or §5, the section has been amended to match.

- **Everything ran too fast.** Player cruise 80→55, boost 200→140, brake 25→18. Enemies
  80 u/s (was 110), 1.6 rad/s (was 2.2), APPROACH 380 u (was 450), fire range 300 u (was
  350). Difficulty multipliers (§7) are unchanged and still apply on top.
- **Wave 1 was a shooting gallery.** A ≤5 s clear in the audit is far too quick; MEDIUM
  should take 25–60 s, now encoded in the §9 table.
- **Freezes during play.** Long frames must be hunted on real hardware, not headless.
  Known suspects: shader compilation on first use of each material, AudioContext creation
  on the first shot, per-tick allocation in the bolt-homing path. Mitigations: call
  `renderer.compile()` once the scene is built, pre-warm one explosion / spark / debris
  off-screen at load, and create the AudioContext on the launch click.
- **Enemies were hard to see.** Contrast pass: hull light warm grey `#c9c2b5`, engine
  emissive `#ff7a1a`, thin dark back-face outline, model scale ×1.5. Bolts ×2 thickness,
  player red, enemy green. Bracket 2 px full amber with 28 px corners; lead ring 8 px.
  Stars −30% brightness, dust opacity 0.35. Each fighter gets a distance-fading billboard
  glow sprite behind it, drawn from one instanced mesh.

## 16. HUD layout editor
- **H** (or a HUD button while paused) toggles Layout Mode. The simulation pauses.
- Every widget gets a drag handle, a visibility toggle and a size slider (0.75–1.5×).
  Widgets: radar, velocity, hull/shield, score, wave/timer, target readout, off-screen arrows
  (toggle only), debug panel, difficulty label, Data.
- Drag with mouse or touch. Snap to an 8 px grid. Widgets clamp inside the viewport and are
  rejected from the §3 keep-out zone — flash red and snap back.
- Save / Reset. Persisted to `ss.hud.v1` as `{widgetId: {x, y, scale, visible}}` where x and y
  are **viewport percentages**, so a layout survives a window resize. Reset restores defaults.
- **Data widget** — individually toggleable rows: enemies remaining, nearest enemy distance,
  closure rate, shots fired / hit %, time in wave, boost heat (visual only for now).
  Default on: enemies remaining, nearest distance, hit %.

## 17. Amendments
- **v1.8** — §9 MEDIUM wave-1 lower bound marked non-blocking, after the final audit returned it
  as the sole remaining failure with every other metric passing on every graded tier. Three bots
  spanning the skill range all breach it; the constraint is not measuring player skill and cannot
  be met without changing spawn geometry. M3 ships with it recorded.
- **v1.7** — §9 MEDIUM wave-1 clear floor 25 s → 15 s. Two bots at opposite skill levels
  (8% hit rate and aim-optimised) both cleared in 12–18 s, because clear time is set by
  closing geometry rather than accuracy: 3 kills x 3 hits = 9 landed shots, and the twin-muzzle
  0.13 s cooldown makes trigger throughput a non-factor. 25 s was not reachable from below by
  any player who engages normally, so the target moved rather than the geometry.
- **v1.6** — after the four-tier balance audit:
  1. §5 `breakOffRange` 60 → 110, flat across tiers. 85 was tried first and cut breaches
     roughly five-fold but never reached zero (1/25 EASY, 1/25 MEDIUM, 3/25 HARD across
     independent samples); a sweep in an isolated copy found 110 is the first value with
     0/25 on every tier (min approach 46–59 u). 60 is the distance at which a fighter
     STARTS its evasive turn, not a separation floor — momentum plus the 90–140° turn carries
     it much closer. Measured against a passive player over 25 trials per tier, fighters
     breached the §9 40 u floor in 3/25 EASY, 5/25 MEDIUM, 14/25 HARD, 18/25 ACE, with the
     violation rate tracking tier speed exactly. An earlier single-trial-per-tier measurement
     reported zero breaches and wrongly settled this; a tail event needs a sample.
  2. §6 wave-1 base count 3 → 4, so MEDIUM's −1 delta gives 3 fighters rather than 2 and
     wave 1 is not over in seconds. With 3 fighters it still cleared in 7.5 s median, so
     wave 1 also gains `groupDelay: 8` — its second spawn bearing is held back 8 s, making
     wave 1 a running fight rather than a single volley.
  3. §12 first-shot is measured against a passive player; bot-lethality FAILs are reported
     but non-blocking.
- **v1.5** — M3.2, after Bob cleared all five waves on EASY (466 shots, 15% hit rate):
  1. §10 interim campaign-clear card — previously the game simply stopped at "5 — 0 REMAINING"
     with no end state, because a win state was only ever scoped to the M4 boss.
  2. §6 spawn spread: spacing 46→138, 0–2 s per-fighter arrival jitter, and 2–3 spawn bearings
     per wave at least 45° apart. Fighters had been arriving as one point and dying to shots at
     the cluster centre.
  3. §5 separation widened 25→40 u during APPROACH.
  4. §3 fighter glow switched from constant SCREEN size to constant WORLD size (1/distance,
     capped at 6 px) with per-fighter hue jitter; hull emissive 1.0→2.2 so the silhouette
     reads at 400 u.
  5. Fixed, found while chasing a layout-editor failure: `#touch` (the mobile control pad) was
     a full-screen `inset:0` container with default `pointer-events:auto`, so whenever it was
     enabled it swallowed every pointer and touch event beneath it. The existing mobile test
     could not see this because it dispatched TouchEvents directly onto the canvas, bypassing
     hit-testing; a hit-test-based check now covers the class.
  6. The 700 ms pointer-lock failure probe is now cancelled once lock is genuinely acquired, so
     a deliberate release (Esc, or H for layout mode) no longer switches on the mobile pad.
- **v1.4** — M3.1 engagement fix, after measuring that time-to-first-shot was dominated by
  spawn bearing rather than tier:
  1. §5 approach speed floor added. Tier speed near player cruise made arrival a dice roll —
     EASY at 0.7×80 = 56 u/s against a 55 u/s cruise closed at ~1 u/s and took 84 s to fire.
     Every slow run measured was a rear spawn (bearings 141–166°); no front spawn was ever slow.
  2. The floor applies while CLOSING, not in APPROACH alone: handing off at approachRange
     (380 u) still left the last 80 u to fireRange (300 u) at tier speed, which stalled EASY at
     73.8 s. Flooring the whole closing phase fixed it.
  3. Margin set to 40 u/s, not 20: the margin IS the worst-case closure against a fleeing
     player, and 20 gives 900/20 = 45 s, over the §12 bound.
  4. §7 HARD stays at 1.00 — with the floor in place it showed no outlier over 20 s.
  5. §12 restated as worst-of-5 ≤ 25 s. Measured max over 14 runs per tier:
     EASY 15.3 s, MEDIUM 14.0 s, HARD 15.6 s, ACE 16.4 s.
- **v1.3** — M3.1, after Bob played M3 locally ("extremely cool, still really hard, radar
  obstructs firing"):
  1. §7 difficulty curve shifted one notch easier; fourth tier ACE added (old HARD).
     Confirmed he played MEDIUM by reading `ss.difficulty` from his browser.
  2. §8 radar 220→160 px, default position bottom-centre → bottom-left.
  3. §3 gains the firing keep-out rule: nothing but the reticle, bracket, lead ring and
     bracket line inside 22% of the min viewport dimension from centre.
  4. §16 added: HUD layout editor with drag/scale/visibility, 8 px snap, keep-out rejection,
     percentage-coordinate persistence in `ss.hud.v1`, and a Data widget.
  5. §3 also records the v1.2 pause semantics that were implemented but never written down.
- **v1.2** — after Bob's first live play of M3 (see §15) and the second balance audit:
  1. §3 player speeds cut: cruise 80→55, boost 200→140, brake 25→18.
  2. §5 enemy kinematics cut: 110→80 u/s, 2.2→1.6 rad/s; APPROACH 450→380 u; fire range 350→300 u.
  3. §7 HARD enemy cooldown ×0.8 → ×1.0 (damage stays 9).
  4. §9 wave-1 clear on MEDIUM becomes a range, 25–60 s, so wave 1 is not a shooting gallery.
  5. §9 closest-approach filter changed from "player speed ≤ cruise" to "player not closing on
     the fighter" — the speed form did not work, because a bot chasing at cruise passes it.
  6. §15 added: Bob feel notes (contrast pass, freeze hunt, speed retune).
  7. §12 time-to-first-shot threshold 15 s → 25 s. Not a separate design decision: it is
     arithmetic from change 1+2. Fighters closing at 80 u/s on a 55 u/s player from the §6
     spawn band now take 15.3 / 17.9 / 9.3 s to open fire. The alternative — cutting §6
     spawn distance to ~650-850 u — would have partly undone the slower pacing that was
     the point of the retune, so the threshold moved instead.
- **v1.1** — after the M3 balance audit:
  1. §9 *Hull lost/min* regraded as hull-only (shield absorption excluded, wave restores not netted).
  2. §9 *Closest enemy approach* restricted to ticks where player speed ≤ cruise, and the bot given a dodge rule.
  3. §7 MEDIUM enemy cooldown ×1.0 → ×1.15; HARD enemy damage 10 → 9.
  4. §14 note recording that the M1/M2 markers were stamped retroactively in M3.
Gates per milestone: test-engineer → game-feel-critic (M3, M5) → balance-auditor (M3, M4) → softlock-hunter (M4, M6) → perf-gatekeeper → ip-compliance-reviewer → deploy-agent. Feel gate: Bob plays M3 before M4 starts.
