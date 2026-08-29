# SOLAR SAVERS — M3 PLAN (reconcile against SPEC v1.0)

Audit of live `public/games/solar-savers/index.html` @ commit `e49f4b0` against SPEC §2–§8.
Line citations are `index.html:NNN` at that commit.

Verdict key: **CONFORMS** · **PARTIAL** (some clauses met) · **ABSENT** (not built)

---

## §2 Architecture — CONFORMS

| Clause | Status | Evidence |
|---|---|---|
| `CFG` holds every tunable | PARTIAL | `CFG` at :174. Four magic numbers escaped into systems — see *Defects* below |
| `EventBus`, no direct cross-system calls | CONFORMS | :247; systems subscribe (`FX` :1096, `AudioFX` :1153, `HUD` :1305) |
| `Entity` / `World` (add, tagged, step, collide by tag pair, deferred sweep) | CONFORMS | `Entity` :314, `World` :369, `#sweep` deferred to end of tick |
| Spatial hash, cell 64 u | CONFORMS | `SpatialHash` :329, `CFG.hash.cell: 64` :240, constructed :372 |
| `Health` shared, `Pool` for spawned things | CONFORMS | `Health` :303, `Pool` :494; pools for lasers ×2, enemies, sparks, explosions, debris |
| Fixed-step 60 Hz + accumulator, variable render | CONFORMS | `CFG.fixedStep` :175, accumulator :1501 |
| Sim ticks whenever tab visible; pointer lock only steers | CONFORMS | :1501 gates on `paused`/`dead`, not on lock |
| Zero allocation per tick | CONFORMS | Per-instance scratch on `Enemy` (:660–672), pre-bound hash visitors, reusable fire payload :437 |
| Lasers instanced | CONFORMS | Two `InstancedMesh` :532–533; `Laser` owns a transform-only `Object3D` :507 |

**M3 work:** move the four stray constants into `CFG`. No structural change.

## §3 Feel — PARTIAL (5 of 9 clauses; the tracking clause is the bulk of M3)

| Clause | Status | Evidence / gap |
|---|---|---|
| Rotation direct from mouse delta, no smoothing | CONFORMS | :458–459, applied raw each tick |
| Roll Q/E 1.8 rad/s | CONFORMS | `rollRate: 1.8` :183, applied :460 |
| Cruise 80 / boost 200 / brake 25, never 0 | CONFORMS | :179, target select :462 |
| Strafe 45 | CONFORMS | :181 |
| Camera bank max 0.35 rad | CONFORMS | `bank: 0.35` :188, applied :477 |
| FOV 68–84 with speed | CONFORMS | :478 maps `brake→boost` onto `fov-4 → boostFov` = **68→84** |
| Boost via dust density + FOV | **PARTIAL** | FOV yes (:478). Dust count is static 900 (:984, :992) — **no density response to speed**. M3 adds it |
| Bracket · lead ring · bracket→lead line · off-screen arrows *with distance* · radar — all four on the same target | **PARTIAL** | Bracket :1223 and lead ring :1223 exist. **Missing: connecting line, distance on arrows (:1257–1265), radar entirely.** Worse, target is re-picked as *nearest on-screen* every frame (:1248–1255, :1269) so it flickers between enemies — the "same target" guarantee does not hold today |
| Feedback within 1 tick (flash+sparks, explosion+debris+shake, vignette **+ edge flash from bolt direction**) | **PARTIAL** | Flash/sparks/explosion/debris/shake all present (`FX` :1086). Vignette present (:1311). **Missing: directional edge flash indicating where the bolt came from** |
| PAUSED on hidden, resume on click/key, never auto-resume | CONFORMS | Verified by test A4/A5 |

## §4 Player — PARTIAL (laser fully conforms; shield absent)

| Clause | Status | Evidence / gap |
|---|---|---|
| Hull 100 | CONFORMS | `hp: 100` :186, :429 |
| **Shield 50, regen 8/s after 4 s without damage** | **ABSENT** | No shield concept anywhere |
| **Shield absorbs before hull** | **ABSENT** | Damage goes straight to hull (:1480, :1485) |
| **Restore shield+hull on `wave:start`, `CFG.ship.restoreHullOnWave` default true** | **ABSENT** | `wave:start` has only HUD + audio subscribers |
| Laser: twin muzzles, 700 + ship speed, life 2.2, cd 0.13, dmg 1, pool 64 | CONFORMS | `CFG.laser` :189, muzzles :443–447 |

## §5 Enemies — CONFORMS except difficulty scaling

All kinematics, all five steering states, separation and asteroid avoidance are built and measured (M2 report; tests B2/B3/B7/B8).
`Enemy` :635, `CFG.enemies` :194–221.

**One gap:** §5 says enemy laser damage is *"8 (difficulty-scaled)"*. It is currently a fixed `damage: 8` (:217). Scaling is M3 §7 work.

## §6 Waves — CONFORMS except difficulty delta

`CFG.waves` table with `{count, formation, spawnDistance, delayAfterClear, enemyOverrides}` :222–229. Base counts 3,4,5,6,8 ✓. Spawn >60° off forward at 900–1200 u ✓ (test B2 measured 104–123°). Line/vee/echelon ✓. Shared leader until ATTACK_RUN ✓. All three events emitted ✓.

**Gap:** §7's *wave count delta* (−1 EASY / +2 HARD) must apply at spawn time.

## §7 Difficulty — ABSENT (entire section is M3)

Nothing exists: no difficulty state, no launch-overlay selector, no `localStorage` key, no HUD readout, and none of the six scaled quantities.

## §8 Radar — ABSENT (entire section is M3)

No radar. HUD real estate is free: bottom-left is velocity, bottom-right is hull, top-center is wave, top-right is score — **bottom-center is unoccupied**, as §8 requires.

---

# M3 build order

1. **`CFG.difficulty`** — three named presets holding all six §7 quantities; `CFG.ship.shield`, `CFG.ship.restoreHullOnWave`, `CFG.radar`, `CFG.dust.boostDensity`. Absorb the four stray constants.
2. **Difficulty system** — `localStorage` `ss.difficulty` (default MEDIUM), selector on the launch overlay, HUD bottom-center readout, applied at wave spawn and enemy reset.
3. **Shield** — extend `Health` or add a sibling `Shield`; absorb-first at both damage sites (:1480, :1485) plus asteroid ram (:488); 4 s no-damage timer then 8/s regen; restore on `wave:start`; HUD bar above hull.
4. **Sticky targeting + Tab cycling** — target becomes explicit state on `Tracker`, not a per-frame nearest-scan. Tab cycles through on-screen enemies; target persists until dead or manually changed. This is the precondition for §3's "all four point at the same target".
5. **Tracking visuals** — bracket→lead connecting line (SVG or a rotated/scaled div), distance label on off-screen arrows, directional edge flash on player hit.
6. **Aim assist** — bolts steer toward the *bracketed* target, capped both by total cone (6°/3°/0°) and by turn rate, in `Laser.update`, zero-alloc. Hit radius scales 1.6/1.25/1.0.
7. **Radar** — 220×220 canvas, own 20 Hz accumulator (independent of render rate), player-centred forward-up, rings 250/500/1000, `[` `]` range cycling, amber triangles with heading + elevation stems, faint bolt dots, dim asteroid dots, hollow square for Planatron when out of range, 2 s sweep, scanlines, targeted enemy pulses.
8. **Dust density** responds to speed (§3).
9. **Markers** — insert `<!-- SS-M1 -->`, `<!-- SS-M2 -->`, `<!-- SS-M3 -->` (see conflict 1).

---

# Conflicts and ambiguities to flag

**1. §14 says the M1 and M2 markers are done; neither string exists in the file.**
`grep -n "SS-M" index.html` returns nothing. M1/M2 shipped before SPEC v1.0 was written. I will insert `<!-- SS-M1 -->` and `<!-- SS-M2 -->` alongside `<!-- SS-M3 -->` unless you object — but the SPEC's "(done)" is inaccurate as written.

**2. §4 hull restore vs §9 "Hull lost/min" — measurement ambiguity that changes the balance verdict.**
§4 restores hull on every `wave:start`; §9 budgets hull lost per minute over a 90 s bot run. If the auditor samples *net* hull it will read near-zero on a run spanning two wave starts, and the metric becomes meaningless. I will instruct balance-auditor to accumulate **damage taken**, not net hull delta. Confirm that reading is what you intend.

**3. §7 aim-assist: "capped turn rate" implies in-flight homing, not a launch-time nudge.**
§12's M3 test says only *"EASY bolt nudges toward target, HARD does not"*, which a launch-time nudge would satisfy. I am reading §7 as authoritative: continuous steering in `Laser.update`, capped by turn rate *and* by total deviation from the firing direction (the 6°/3°/0° cone). Flagging because it is a per-tick cost on up to 64 bolts and a §11 perf input.

**4. §3 requires all four indicators on one target; today the target is re-derived per frame.**
Not a spec conflict — a statement that the current behaviour cannot satisfy §3 without the sticky-target rework in step 4. Noting it because it is larger than it looks.

**5. §2 "no magic numbers" — four live violations.**
`index.html:488` asteroid ram damage `10`; `:477` bank damp constant `6`; `:1274` bracket scale constants `220 / 30 / 0.45 / 1.8`; `:1288` lead-cull bound. Folding these into `CFG` as part of M3.

**6. Subagent names.** The prompt and `CLAUDE_CODE_PROMPT.md` refer to `ss-*`; the files are `.claude/agents/ss-*.md` but register under unprefixed names (`test-engineer`, `perf-gatekeeper`, …). I will invoke the unprefixed names. No action needed.

**7. §8 radar needs the Planatron's position; it is currently scenery, not an entity.**
`Environment` owns it as a plain `Mesh`. M4 (§10) makes it a boss `Entity` at the same coordinates. I will have the radar read a single accessor now so M4 does not require a radar rewrite.

---

**Nothing is implemented yet. Awaiting approval before touching code.**
