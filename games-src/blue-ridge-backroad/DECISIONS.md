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
reads the same at a fraction of the cost. The preset table still carries a
`bloom` flag, but nothing reads it; the sun and headlight glare sprites are
always on because they cost almost nothing.

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

---

## Phases 1-5 — building it

**D1.1 — The far level of detail drops trunks, not the whole tree.** The first
attempt used crossed alpha-tested billboards for distant trees. Mip-mapping an
alpha-tested cut-out plus heavy distance fog turned them into pale rectangles
standing against the sky — the exact "placeholder" look the spec rules out.
Distant chunks now instance the canopy geometry without the trunk mesh, which is
roughly 60 % of a tree's triangles. Because the instance pools are global rather
than per chunk, the far level reuses the same meshes, so this costs *fewer* draw
calls than the billboard pool did, not more. The billboard texture and material
were deleted.

**D1.2 — Time of day is a sine, not a sawtooth, and starts mid-morning.** A
sawtooth wrapped from dusk straight back to dawn, and starting at phase 0 put the
first frame in near-darkness. The day now rocks back and forth over about 13 km
of driving, starting in bright mid-morning, with golden hour at either end.

**D1.3 — Superelevation was banking into the corner.** In this right-handed,
Y-up world a positive rotation about +Y turns the vehicle *left*, so positive
curvature is a left-hand curve, whose outside is the driver's right. The bank
formula had the sign inverted and was raising the inside edge of every corner —
which reads as the road actively tipping you off it. Same class of mistake as
D1.4.

**D1.4 — One handedness convention, stated once, in the physics.** The vehicle
dynamics originally mixed conventions: lateral velocity positive to the right,
yaw rate positive to the left. That is not a right-handed set, and it produced
three real bugs at once — inverted steering, and both Coriolis coupling terms
carrying the wrong sign. `VehiclePhysics` now states the rule at the top of
`step()` and does the conversion in exactly one place: internally everything
angular is left-positive, and the public `v` field stays right-positive because
that is what the camera, dust and collision code want.

**D1.5 — The counter-steer allowance only applies to actual counter-steering.**
The architecture review asked for extra lock when the rear steps out, so a slide
can be caught. Granting it regardless of steering direction turned out to be a
spin amplifier: a small slide unlocked a large steering angle, which deepened the
slide, which unlocked more. The bonus is now gated on the steering command
opposing the rear slip angle, and the total is capped at 30 degrees.

**D1.6 — Gravity on a slope is g*sin(theta), not g*tan(theta).** The off-road
gravity used the raw height gradient, which on the steep ground beyond the ditch
exceeded what any tire could resist and dragged the truck sideways at 18 m/s.
Alongside the trig fix, the verge now eases into its full slope over the first
15 m instead of starting at 40 degrees right at the ditch lip — real roads are
graded that way, and it means running wide costs you speed instead of throwing
you down a bank.

**D1.7 — Off-road is punished with rolling resistance, not a scripted penalty.**
The spec asks for leaving the road to cost a lot of speed. Raising the rolling
resistance coefficients for the ditch and grass surfaces does that through the
existing model, so the truck bogs down and digs out rather than being clamped.

**D1.8 — Boulders stand off by their own radius.** Rocks are placed by their
centre, so large ones were overhanging the carriageway and hitting the player
with something that did not look like it was in the road. Their lateral offset
now accounts for their own scale plus clearance.

**D1.9 — The collision response absorbs energy instead of adding it.** The first
version added a bounce term to the velocity every substep the vehicle stayed in
contact, which compounded: a tree could launch the truck sideways faster than it
had been travelling. It now removes the component going into the obstacle, keeps
a small restitution, and scrubs what slides along it.

**D1.10 — `startPreview()` must not touch the `driving` flag.** It reset
`driving = false`, so restarting the loop after a stop silently cancelled
driving. Harmless in the browser, where the loop is started once at mount, but it
meant the entire automated suite was testing a stationary truck.

**D1.11 — The test harness drives with pure pursuit, not lateral error.** A
bang-bang controller on lateral offset spent its time in the trees, so the tests
measured the controller rather than the game. The harness now aims at a point up
the road, modulates the digital keys toward a target steering *angle* the way a
player taps rather than holds, and lifts off for corners. With that in place the
truck sustains 60-80 mph on the road and peaks around 130.

**D1.12 — Rendering is switchable off for the suite.** Headless Chromium runs on
SwiftShader, where drawing a frame costs far more than the physics step under
test; a 45-second simulated run took minutes. `Game.setRenderEnabled(false)` lets
the harness simulate minutes of driving in seconds and draw single frames when it
needs `renderer.info`.

**D1.13 — Committed in fewer, larger commits than the five-phase plan.** The
build was not done phase-by-phase in the end: the road, world, vehicle, UI and
audio were written together because they share the road-coordinate and
instance-pool contracts, and splitting them after the fact would have produced
intermediate commits that did not run — which the plan explicitly forbids. The
history is instead: the plan, the game, then one commit per round of review and
QA findings. Each commit builds and passes the suite.
