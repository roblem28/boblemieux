# Blue Ridge Backroad — Decisions Log

Every judgment call made while building this, with the reason. Newest phase last.

---

## Phase 0 — planning

**D0.1 — Source lives in `games-src/`, build output is committed to `public/games/`.**
The existing games in `public/games/` are single hand-written HTML files, but this
one is a Vite app. Netlify runs only the root Next.js build, so it will never run
Vite; therefore the built bundle has to be in the repo. Source in
`games-src/blue-ridge-backroad/`, `build.outDir` pointed at
`../../public/games/blue-ridge-backroad`. Nothing outside those two directories
is touched.

**D0.2 — No react-three-fiber.** React renders the title screen, HUD, touch
controls and settings; Three.js owns the frame loop imperatively. r3f's
reconciler would put diffing and allocation inside the frame budget for no gain,
since the scene is built by generators rather than JSX. Dependencies are exactly
`react`, `react-dom`, `three` — nothing else.

**D0.3 — All assets procedural, zero binary files.** Textures are generated on a
canvas at load; the vehicle, trees, rocks and structures are built from code;
audio is synthesised with Web Audio. Consequences: no glTF/GLB, no Draco, no
KTX2/Basis anywhere in the project — those compression paths exist to shrink
downloaded binaries and there are none. The whole game is ~1 MB of JS. This is a
deliberate deviation from the spec's "glTF/GLB, Draco, KTX2" line, taken because
it makes the game strictly smaller, fully offline, and free of any licensing
question about third-party models.

**D0.4 — No post-processing / EffectComposer.** The spec asks for "conservative
bloom". An `EffectComposer` costs a full-screen render target, breaks WebXR
stereo, and is the single most expensive thing on mobile. Instead: ACES filmic
tone mapping plus additive sprite glare on the headlights and the sun disc, which
reads the same at a fraction of the cost. The `glare` preset flag turns the
sprites off on mobile.

### Architecture review findings applied

A subagent reviewed `ARCHITECTURE.md` with fresh context before any code was
written. Its material findings and what was done about them:

**D0.5 — Chunk-local geometry.** At 100 km of driving, float32 world coordinates
have ~8 mm resolution, which would show up as vertex wobble and shadow acne. All
chunk geometry (road, terrain) and all instance matrices are built relative to
the chunk's own origin, and the chunk `Object3D` carries the world offset in
float64. Fixed at the source rather than papered over.

**D0.6 — Analytic vertex normals, never `computeVertexNormals()`.** Per-chunk
normal computation gives boundary vertices only the triangles inside their own
chunk, producing a lighting stripe every 100 m. Normals are derived from the road
frame and the analytic cross-section derivative, so adjacent chunks agree exactly.

**D0.7 — Suspension is cosmetic; grip uses analytic load transfer.** The original
design had spring forces *and* an analytic load-transfer model, which
double-counts. Now: the tire model gets `Fz` from static load ± analytic
longitudinal/lateral transfer, and grip falls off with load
(`mu_eff = mu * (1 - k*Fz/Fz0)`) so transfer actually changes handling. The visual
suspension is driven by body acceleration and per-wheel terrain height with no
force feedback into the sim. One model per phenomenon.

**D0.8 — Tire relaxation length + low-speed kinematic blend.** A raw Pacejka
slip-angle model divides by longitudinal velocity and turns into an enormous stiff
spring near standstill, which jitters and spins at 120 Hz. Three guards: the
denominator is clamped to `max(|vx|, 2.5)`; lateral force is low-passed with a
relaxation length (sigma ≈ 0.5 m, time constant sigma/v); and below 4 m/s the
model blends to kinematic steering with direct lateral-velocity decay. Reverse is
an explicit gear with a velocity dead-band at zero, so braking cannot integrate
straight through into reverse.

**D0.9 — Minimum curve radius raised from 55 m to 115 m.** At 55 m and mu ≈ 0.95,
the cornering limit is ~46 mph, which makes the spec's 155 MPH top speed fiction.
The generator now uses a slow, low-curvature octave for the overall shape and
reserves tight radii for short, low-amplitude wiggles, and the envelope opens
genuine straights where high speed is reachable. Bank is clamped to 5.2 degrees
and rate-limited along `s` so the ribbon mesh and the analytic height function
stay within a few millimetres of each other.

**D0.10 — Discovery events flatten the road through a deterministic schedule.**
Because samples are generated strictly forward and never regenerated, deciding to
place a bridge after the geometry exists would drop it mid-corner on a 9% grade.
Instead the event schedule is a pure function of `s` (evaluated per ~620 m slot),
so `curvatureAt`/`gradeAt` can taper toward zero across an event's span *while*
generating. Events land on straight, flat road by construction.

**D0.11 — Instanced pools allocate one contiguous block per chunk.** A per-instance
free list fragments, and `InstancedMesh.count` then has to cover the highest used
index, so holes still cost vertex work. Blocks are fixed-size and per-chunk, so
recycling keeps `count` tight. `frustumCulled = false` on every pool — one mesh
has one bounding sphere and would otherwise cull the entire forest at once.

**D0.12 — Collision is a cheap radius test, not swept spheres.** Trees, rocks and
structures register a position and radius; the vehicle does a distance test
against the live chunk lists and responds with a push-out impulse, a speed penalty
and a suspension kick. A full swept-sphere solver is not worth its bug surface in
a game with no crash model.

**D0.13 — Fixed timestep is preset-dependent.** 1/120 s on high and balanced,
1/60 s on mobile, max 8 substeps, raw frame delta clamped to 0.1 s. The original
"1/120, max 4 substeps" silently discards time below 30 FPS, which reads to the
player as the engine losing power.

**D0.14 — Time of day is clamped to dawn→dusk, not a full 24 h cycle.** A real
night cycle means minutes of an unplayable black screen. The sun sweeps a
golden-morning-to-late-afternoon arc; headlights exist as emissive lenses plus
additive light-cone meshes rather than shadow-casting spotlights.

**D0.15 — Rain is cut; fog/haze variation stays.** The spec lists "changing
weather"; a full precipitation system (particles, wet-road friction, spray,
wiper) is more than the remaining budget allows to do well. Atmospheric density
and colour vary continuously along the drive, and the "foggy hollow" discovery
event is a real weather moment. Logged as a known limitation rather than shipped
half-built.

**D0.16 — Telemetry store uses a version counter.** `useSyncExternalStore` with a
mutable snapshot object either never re-renders (same reference) or throws
("getSnapshot should be cached"). `getSnapshot` returns an integer version that
the 10 Hz publisher bumps; the HUD reads fields off the mutable record during
render.

**D0.17 — StrictMode stays off, but `Game.dispose()` is real.** HMR remounts
anyway, so a genuine teardown was written rather than relied on not happening.

**D0.18 — The "zero allocation" rule is scoped to the substep and render paths.**
Applying it to chunk building and UI code would cost most of the build budget for
no measurable gain; chunk builds happen ~0.7 times per second.
