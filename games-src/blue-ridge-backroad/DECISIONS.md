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

---

## Code review findings applied

A second subagent reviewed the implementation with fresh context. Its findings
and what was done:

**D2.1 — Re-scattering a chunk left stale colliders behind.** Flipping a chunk's
level-of-detail band released its instance blocks and re-scattered it, but never
reset `colliderCount`, and the two passes consume the shared RNG differently. The
result was rock colliders from the discarded layout surviving with no rocks
attached: you got stopped by nothing, thirty metres from anything. Chunks now
record a `baseColliderCount` after their event registers, and scatter resets to
it. This happens during ordinary forward driving, so it was a live bug.

**D2.2 — The touch control ref callbacks had unstable identity.** A fresh arrow
function per render meant React tore the listeners down and rebuilt them on every
unrelated state change — tapping Sound, opening Settings. Since the callback's
`activeId` lives in its closure, a held control was released and could never come
back, because the finger was already down and no further `pointerdown` would
arrive. Wrapped in `useCallback`.

**D2.3 — `Sky.dispose()` leaked the shadow map.** Each quality change builds a
new `Sky`; the old one's depth render target (16 MB at 2048) was stranded.
`LightShadow.dispose()` is now called.

**D2.4 — Frame-loop allocations removed.** `resolveInputTargets` returned a fresh
object every substep and now writes into a caller-owned record; the Pacejka curve
and the load-sensitivity helper were closures rebuilt per substep and are now
module-scope functions; the engine's harmonic array literal was inside the
per-frame oscillator loop; `ChunkManager.update` allocated a two-element tuple per
chunk per frame by destructuring a Map iteration, and `queryCollision` allocated
an iterator on every substep to then discard all but three chunks — it now walks
a cached near-chunk list.

**D2.5 — Slopes are differentiated from a macro cross-section.** `crossSlope`
central-differenced the full `crossHeight`, which includes ruts and potholes, so
a few centimetres of surface texture became roughly a tenth of a g of lateral
gravity flipping sign every few metres. `crossHeightMacro` omits the fine relief
and is what gravity resolves against; the relief is still felt, through the
per-wheel ground height, which is where it belongs.

**D2.6 — Two latent leaks and a NaN path closed.** A trunk instance block was
allocated even when the foliage allocation had failed, orphaning it permanently
on the next iteration. `EventBuilder` wrote colliders past the end of the array
while still advancing the count, and `queryCollision` used `|| 1e-4`, which
treats NaN as falsy — a phantom collider would have written NaN straight into the
vehicle position and killed the run. Colliders now go through a bounds-checked
`Chunk.addCollider`, and the distance guard is `Math.max`.

**D2.7 — Spawn moved to s = 420 and chunk indices clamped at zero.** `RoadPath`
clamps below its start, so chunks at negative indices built every row from the
same `s = 0` frame: a zero-area road with all of its trees stacked on one point,
colliders included. Reversing from the old spawn reached it in about five
seconds.

**D2.8 — WebGL context loss is handled.** Backgrounding a phone tab or memory
pressure drops the GL context routinely; without `webglcontextlost` /
`webglcontextrestored` handlers the canvas stays black for the rest of the
session and the renderer warns every frame.

**D2.9 — Audio thumps are edge-triggered, and the context recovers.** `impact`
and `landing` decay over several frames, so testing the level alone fired a fresh
three-node thump every frame for the duration of one bump. An `onstatechange`
handler now resumes a context that iOS suspended for a call or Siri, which
otherwise silences the game for the session.

**D2.10 — Shadow casters cut back, and `lodDistance` is actually used.** Every
instanced pool cast shadows, and each pool's shadow pass draws its whole count —
forest a kilometre ahead, far outside a 45-120 m shadow camera. Conifer canopies
(alpha-tested, the most expensive thing in the pass), undergrowth and logs no
longer cast. Separately, the LOD band was hard-coded at three chunks on every
preset; it now derives from `preset.lodDistance`, so mobile really does carry
detailed trees a shorter distance than desktop, as documented.

**D2.11 — Event set-pieces are merged by material.** A fire tower was 76
separate meshes and a cabin 40; two or three on screen roughly doubled the
frame's draw calls, to a measured peak of 186. Each set-piece is now collapsed to
one mesh per material at build time, which brought the peak over four miles of
driving down to 119.

**D2.12 — Dead code deleted rather than left to rot.** `util/pool.ts` (nothing
imported it), several unused `Rng` and `mathx` helpers, `SPECIES_HEIGHT`,
`isDrivableSurface`, `setCockpitVisible`, `Sky.attach`, the three `setPreset`
methods superseded by the rebuild path, the unused `InputState` analogue fields,
and the preset fields `bloom`, `drawDistance` and `terrainCols` that nothing
read. `ARCHITECTURE.md` was corrected where it had drifted from the code: the
module map listed ten files that do not exist, and the sample spacing, minimum
radius, substep count and texture-caching claims were all wrong.

---

## Play-test feedback

Four changes after the first real session.

**D3.1 — Keyboard steering was far too sensitive; it is now progressive and
asymmetric.** Lock used to wind on at 3.4/s and the road wheels slewed at
4.5 rad/s regardless of speed, so a tap was very nearly full lock. Now the
driver's intent winds *on* at 2.2/s and comes *off* at 3.8/s, and the road
wheels slew at 3.0 rad/s at a standstill falling to 1.35 at 45 m/s. The
asymmetry is the important half: it is how you actually steer — lock goes on
deliberately and comes off fast — and it turns an on/off key into something
that behaves like a progressive input. Maximum lock also came down from 32 to
30 degrees.

A **Steering** setting (Relaxed / Standard / Sharp) scales only the wind-on
rate, never the available lock, so no setting can steer the truck into a spin
that the others cannot. It persists in `localStorage`.

**D3.2 — Getting unstuck off-road, in three parts.** The complaint was real: the
truck could sit in a ditch with the throttle pinned and go nowhere.
 - The transfer case now drives the front axle below walking pace and hands
   back to rear-drive above about 9 m/s. That is what a 4x4 actually does, it
   roughly doubles the traction available to crawl out, and it leaves the
   power-on rear slide at speed untouched.
 - Rolling resistance eases to a third of its value at a crawl. At speed it is
   what makes leaving the road cost you; applied in full at 1 m/s it is what
   makes the truck a paperweight.
 - Ditch and grass rolling resistance came down from 0.22/0.19 to 0.18/0.15.

Measured: from a standstill 6, 12 and 20 m off the road, the truck now covers
35-48 m in eight seconds and reaches 19-30 mph — while on-road it still peaks
above 130, so the off-road penalty is intact.

**D3.3 — A recovery, deliberately limited.** Physics alone cannot cover being
wedged against a tree, so `R` (and a button that appears only after ~1.4 s
stopped off-road) puts the truck back on the centreline, facing forward,
stopped. It keeps the odometer, so it is not a restart. The mile it is used in
is marked *assisted* and can never set a personal best — otherwise the timer
would reward using it.

**D3.4 — "Course outline" implemented as a look-ahead map plus an advisory
speed, not a track map.** The road is endless and procedurally generated, so
there is no course to lay out. Instead the HUD shows the next 360 m as a
to-scale top-down strip — the same metres-per-pixel across as along, so the
shape on screen is the shape of the road — with each segment tinted by how much
it will have to be slowed for.

The number beside it answers the actual question. For every sample ahead it
computes the speed that corner can be carried at, then walks that back through
the braking distance available to reach it, and takes the minimum. That
distinguishes a hairpin 300 m away (no action needed) from the same hairpin at
40 m (brake now), which a raw curvature readout cannot. Exceeding it turns the
panel amber and switches the caption to "Ease off". It is bounded by the
truck's own top speed rather than reporting an arbitrarily large number on a
straight.

**D3.5 — "Lap times" implemented as mile splits.** There is no lap on an endless
road. The stopwatch runs per mile instead, and because the world comes from a
fixed seed, mile 7 is always the same stretch of mountain — so a personal best
for a given mile is a real comparison rather than a coincidence. Best times per
mile index persist in `localStorage`; the HUD shows the current mile's clock,
its standing best and total elapsed, and flashes the split with a delta when a
marker is crossed. Clearing them is in Settings.

**D3.6 — The test harness had to change with the steering.** Its controller
chased an absolute road-wheel angle, which worked when lock wound on and off at
the same rate. With the new asymmetry it bled lock between taps and quietly
understeered off the road — the autopilot's peak dropped from 134 mph to 34,
which looked like a physics regression and was not. It now closes the loop on
`steerInput`, the quantity the keys actually move. Worth recording because the
failure mode was so convincingly disguised as a game bug.

---

## The fixed stage, and the interior cameras

**D4.1 — A fixed two-mile stage, not laps.** `STAGE_START_S = 1000`, two miles
long, on the same seeded road every time — so a time is a real comparison. The
truck is held on the line and the clock starts on the first touch of the
throttle: no countdown, because a time trial is restarted constantly and making
the player sit through "3, 2, 1" every retry taxes the thing they are doing.
Starting on *movement* was tried first and was worse — any camber rolls a
stationary truck away and starts the clock behind your back, which is why the
truck is now held with a handbrake while armed.

**D4.2 — A live delta against your own best run.** The best run stores its
elapsed time at 24 checkpoints along the stage; the HUD interpolates between
them to show how far up or down you are *at this point on the road*. That is the
number that makes a time trial worth repeating — a final time alone tells you
nothing until it is over.

**D4.3 — `RoadPath.rewind()`.** Restarting the stage after a long free drive
placed the truck at whatever the oldest surviving road sample happened to be:
the sample ring prunes behind the vehicle, and the stage's own road had been
discarded. Generation is deterministic and forward-only, so the fix is to
regenerate from the origin — a few hundred samples, microseconds — whenever a
teleport targets a distance the ring no longer holds. Without it the premise of
a repeatable stage is simply false, and it fails silently.

**D4.4 — The interior cameras were broken in four separate ways.** Reported from
play: hood and cockpit showed "way too zoomed in and all you can see is the
blue". It turned out to be a stack of independent faults, each of which alone
would have ruined the view:

 1. *Anchors inside the bodywork.* The hood camera sat inside the windshield
    glass (z 0.85–1.15) and the cockpit camera 13 cm above the dash top, close
    enough that the dash's top face filled the screen.
 2. *Vertical field of view.* Three's `fov` is vertical, and the interior
    cameras were on 72–88 — roughly 115 degrees horizontal at 16:9. Wide enough
    to drag the entire cab into frame.
 3. *The field of view did not snap on a camera change.* Position snapped but
    the FOV eased over about a second, so the first moment of the cockpit view
    was rendered with the chase camera's framing. This also caused a visible
    lurch every time you pressed C.
 4. *The look-into-the-corner lean was `steer * 2.4` clamped to ±0.5 rad* — up
    to 29 degrees of head turn, which at speed aimed the camera at the door
    pillar.

Beyond those, the cab is a box the camera sits *inside*, and back-face culling
cannot be relied on to hide it. The cockpit view now switches off the cab shell,
dash and seats and keeps the steering wheel — which is what a driving game does
with a separate cockpit model, and what actually makes the view read as a
cockpit. The greenhouse was also raised and the dash lowered to give the view
somewhere to sit.

**D4.5 — The suite now looks at pixels.** None of the above was catchable by
checking camera positions: every position looked reasonable. There is now a
check that samples the rendered frame in each of the three views and asserts it
is not a near-uniform slab. It needs `preserveDrawingBuffer`, which is enabled
only under the debug flag.

**D4.6 — `hardReset()` in the harness.** The suite is one long continuous drive,
so a check inherited whatever ditch the previous one finished in — which
produced several failures that looked exactly like physics regressions and were
not. State-sensitive checks now start from a defined spawn.

---

## Play-test feedback, round two

**D5.1 — The road is wider than the spec asked for.** The original brief said
16–22 ft; it is now 24–31 ft, with a wider shoulder to match. At 90 mph on
gravel the narrower road left no room to place the truck, and how it plays is
the test that matters. Recorded as a deliberate deviation rather than a drift.

**D5.2 — Camera order is chase, cockpit, hood.** Cockpit is what people reach
for after the chase view.

**D5.3 — Four difficulty levels, and they change forgiveness, not speed.**
Engine, brakes, top speed and the road are identical at every level. What varies
is grip, rear-axle bias, how hard leaving the road hurts, how much a collision
costs, and the stability assistance.

**D5.4 — The stability assist may only ever *reduce* rotation.** The first
version pulled the yaw rate toward the kinematic ideal `u·tan(δ)/L` in both
directions. At 58 mph with lock applied that ideal is over 3 rad/s — a rate no
tire could produce — so the "assist" was actively spinning the truck, and Easy
was measurably worse than Expert. It now computes the rotation grip can support
(`μg/u`, since lateral acceleration is `u·r`), takes the smaller of that and the
kinematic rate, and only pulls the yaw rate down toward it.

Measured under a deliberately abusive input — full lock and full throttle at
58 mph — peak sideways velocity is now 2.9 m/s on Easy, 4.9 on Medium, 11.2 on
Hard and 26.8 on Expert, which spins. That is the spread the levels are for.

**D5.5 — Steering lock falls away faster with speed.** The old curve still gave
19 degrees of road-wheel angle at 58 mph. That is a hairpin input; holding it
will put any vehicle round, and it was a large part of "wipes out way too easy".
Lock now reaches its 6.5-degree floor by 38 m/s instead of 55.

**D5.6 — Off-road needs a speed-dependent penalty, not just rolling
resistance.** Rolling resistance is a constant force, and against 300 kW a
constant force barely dents 100 mph — the truck was doing 102 mph through open
grass. Each surface now carries a quadratic drag multiplier as well, which caps
off-road speed around 65–70 mph while leaving the low-speed crawl-out from
D3.2 untouched.

**D5.7 — Best times are per difficulty.** An Expert time and an Easy time are
not the same achievement, and one leaderboard for both is worse than none. The
storage keys carry the level, and the version moved with the road widening,
which changed every time anyway.

---

## Play-test feedback, round three

**D6.1 — The foggy hollow is a stretch, not a moment, and its fog comes from the
schedule.** It lasted about a second because the density was a falloff from the
set-piece's *position* — a 90 m radius around a point, peaking instantaneously.
It is now 320 m of road with a 200 m plateau at full density, and the value is
computed by `RoadPath.fogAt(s)` from the deterministic schedule rather than from
the mesh.

That last part matters for more than tidiness: the hollow is longer than the
streaming window is deep behind the vehicle, so tying visibility to a loaded
object made the fog vanish the moment the chunk holding it was released — which
is roughly when you were in the middle of it. A pure function of `s` has no such
edge.

Visibility drops to about 50 m inside, which at speed is under a second of road.
The course-ahead strip still works, so there is a way through if you read it and
slow down — the fog takes away your eyes, not your instruments.

The mist banks are now laid out along the road in world space rather than
clustered at a point, because over 300 m the road curves well away from the
straight line the node is oriented along.

**D6.2 — The grey band at the bottom of the screen was the road, not the GPU.**
Reported as "maybe the screen or vid card can't keep up". It was not a
performance problem: at 60 fps the near road was washing out to a flat grey
sheet. Two causes, both about a surface seen at a grazing angle:

 - anisotropic filtering was only 4x on Balanced, so a few metres ahead of the
   bumper the sampler dropped to a low mip and averaged the gravel to nothing.
   It is now 16/8/2 by preset, clamped to what the GPU actually supports;
 - and there was nothing in the road's *vertex* colours at metre scale to
   survive that averaging. Two more noise scales were added, both kept well
   above the 2 m row spacing so they do not alias.

Worth recording that the first hypothesis — dust particles filling the lower
screen — was wrong, and cheap to disprove: hiding the particle systems changed
the bottom strip's mean brightness by 0.5 out of 255.
