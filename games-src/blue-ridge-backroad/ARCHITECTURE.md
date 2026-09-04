# Blue Ridge Backroad — Architecture

A browser 3D driving game: endless procedurally generated Appalachian gravel
back road, one detailed vehicle, streamed scenery, no finish line.

Stack: **Vite + TypeScript + React 19 + Three.js**. No game engine, no
react-three-fiber, no physics library. Ships as static files under
`/games/blue-ridge-backroad/`.

---

## 1. Repository placement & build

```
games-src/blue-ridge-backroad/     <- source app (this project)
public/games/blue-ridge-backroad/  <- committed Vite build output (served by Netlify)
```

The site itself is Next.js and publishes `.next`; `public/` is copied verbatim.
Netlify does **not** run the game's build, so the built bundle is committed.
`vite.config.ts` sets `base: '/games/blue-ridge-backroad/'` and
`build.outDir: '../../public/games/blue-ridge-backroad'` with `emptyOutDir`.

Everything is bundled locally: no CDN script tags, no runtime fetches to third
parties, no external fonts. All textures are generated procedurally at load, so
the shipped payload is code only.

---

## 2. React / Three.js boundary

React owns **screens and chrome**; Three.js owns **the frame**.

- `App.tsx` holds a small state machine (`title -> driving`), renders the
  `<canvas>`, and constructs the imperative `Game` once in a mount effect.
  React never re-renders during the game loop.
- The loop publishes telemetry (speed, odometer, gear, fps) into a mutable
  telemetry store. The HUD subscribes through a **10 Hz throttled**
  `useSyncExternalStore`, so gauge updates cost ~10 React renders/sec, not 60.
- Input flows the other way through a plain mutable `InputState` object that
  both the keyboard listeners and the touch buttons write into. No React state
  is on the input path — a touch button's `pointerdown` writes the field
  directly, which is what makes true multi-touch possible.

Rationale: r3f's reconciler would put allocation and diffing inside the frame
budget for zero benefit here — the scene graph is built by generators, not JSX.

---

## 3. Module map

```
src/
  main.tsx                 React root; StrictMode off (double-mount would build the world twice)
  App.tsx                  screen state machine, canvas host, window.brb debug handle
  styles.css               all UI styling
  ui/
    TitleScreen.tsx        cinematic title + START ENGINE (also the audio unlock gesture)
    Hud.tsx                MPH dial, odometer, camera/sound/settings buttons, FPS (dev)
    TouchControls.tsx      pointer-event steering + pedals, multi-touch safe
    SettingsPanel.tsx      quality preset override, FPS toggle, controls help
    telemetry.ts           version-counter external store (useSyncExternalStore)
  game/
    Game.ts                renderer, scene, fixed-step accumulator, systems wiring, tick(dt)
    quality.ts             preset table + auto-detection + localStorage override
    input.ts               InputState, keyboard bindings, allocation-free target resolution
    road/
      RoadPath.ts          THE ROAD COORDINATE SYSTEM + cross-section + event schedule
      ChunkGeometry.ts     road ribbon and terrain skirt builders (chunk-local, analytic normals)
    world/
      ChunkManager.ts      Chunk, streaming, pooling, deterministic scatter, collision query
      Vegetation.ts        instanced pools per species, per-chunk instance blocks, rebasing
      Assets.ts            every shared texture and material, built once per preset
      Sky.ts               sky dome shader, sun, shadow camera, fog, parallax ridge layers
      events/EventBuilder.ts   the seven discovery set-pieces, pooled and merged by material
    vehicle/
      VehicleModel.ts      procedural body/glass/chrome/lights/interior/wheels, body LOD
      VehiclePhysics.ts    the model in section 6
    camera/
      CameraRig.ts         chase / hood / cockpit, spring-damped, XR-safe
    fx/
      Particles.ts         pooled point-sprite dust and gravel, origin-rebased
    audio/
      AudioEngine.ts       Web Audio graph, all procedural (section 8)
    util/
      rng.ts               mulberry32 + integer hashes
      noise.ts             value/fbm noise used by the road, terrain and textures
      textures.ts          canvas-generated albedo/normal/roughness
      mathx.ts             damping, clamp, moveTowards, smoothstep
```

Terrain, road-mesh building, wheel animation, dust and gravel do not have files
of their own: the first two live in `ChunkGeometry`, the third in
`VehicleModel.sync`, and the last two are two pools inside `Particles`.

---

## 4. Road coordinate system

The road is **arc-length parameterised**, not a `CatmullRomCurve3`. Distance
along the road `s` (metres) is the primary coordinate; every other quantity is a
function of it. This makes "distance along road", the odometer, chunk boundaries
and streaming all the same number, with no curve reparameterisation error.

### Generation

A deterministic seeded generator produces, for each sample `i` at
`s = i * STEP` (`STEP = 2 m`):

- `kappa` — horizontal curvature (rad/m): three fbm octaves of `s` under a slow
  envelope that opens genuine straights and closes twisty sections, clamped so
  the radius never drops below 115 m. That floor is set by the top speed: at
  mu ~= 1 a 55 m corner caps cornering at about 46 mph, which would make the
  stated 155 mph unreachable anywhere on the road.
- `grade` — longitudinal slope (rise/run), three octaves, clamped to +/-8.5 %.
- `bank` — superelevation derived from curvature, clamped to 5.2 degrees and
  rate-limited along `s`, so curves are banked outside-edge-high the way a real
  road is and the ruled ribbon surface stays within millimetres of the analytic
  height function.
- `width` — 5.0–6.7 m (16–22 ft), slow noise.

Curvature and grade are additionally multiplied by an event-flattening factor
(section 5), which is why a bridge is never generated mid-corner.

Heading is the running integral of curvature; elevation is the running integral
of grade. Because both are integrals, samples are built **incrementally forward**
into a table and never regenerated; the table is pruned behind the vehicle with a
base-index offset, so memory is bounded regardless of distance driven.

### The frame

`RoadPath.sample(s, out)` writes a caller-owned struct — no allocation:

| field | meaning |
|---|---|
| `s` | distance along road |
| `pos` | road centreline world position (x, y, z) |
| `tangent` | unit direction of travel |
| `right` | unit lateral in the horizontal plane, to the driver's right |
| `surfaceRight` | the same axis **rotated by the bank angle** — the surface across-vector |
| `normal` | unit road surface normal (banked) |
| `heading` | the running heading integral (never wraps) |
| `sideBias` | which side of the road the hillside rises on |
| `elevation` | centreline y |
| `curvature` | signed rad/m |
| `width` | full carriageway width |
| `bank` | superelevation angle |

Between table samples everything is linearly interpolated (heading through its
own integral, so there are no angle-wrap issues).

### World <-> road mapping

`RoadPath.project(worldPos, hintS)` does a bounded local search around the
*previous projection's* `s` — never an integrated guess, which would break in
reverse and on spins — and widens the window automatically when the nearest
sample lands on its edge, which covers teleports and resumes. It then refines
along the segment with a dot product against the tangent rather than a Newton
step: Newton on this function divides by `1 - lateral * kappa`, which is zero at
the centre of curvature, and the terrain skirt is wide enough to reach it.
Cost is O(1) and allocation-free.
`lateral` is signed metres from the centreline: `|lateral| < width/2` is the
carriageway, `< width/2 + shoulder` is the gravel shoulder, beyond that is the
drainage ditch and then open terrain — this is what the physics uses to pick a
surface friction coefficient.

Surface height anywhere is `frame.pos.y + lateral * sin(bank)` plus the terrain
skirt profile beyond the shoulder, so the vehicle, the mesh and the physics all
agree on exactly one height function.

There are two versions of it. `crossHeight` includes the fine road relief — tire
ruts, washboard, shallow potholes — and is what the mesh and the per-wheel ground
query use. `crossHeightMacro` omits it, and is what slopes are differentiated
from: differentiating a few centimetres of pothole produces a tenth of a g of
lateral gravity that changes sign every few metres, and the truck twitches down
the road.

---

## 5. Chunk lifecycle

`CHUNK_LEN = 100 m`. The manager keeps `BEHIND = 2` and `AHEAD = preset.chunksAhead`
(10 high / 8 balanced / 6 mobile), i.e. **1.0–1.3 miles** of live road.

```
vehicle s -> chunkIndex = floor(s / 100)
want = [chunkIndex - 2, chunkIndex + AHEAD]
for i in want not live:   acquire()   (at most 1 build per frame; amortised)
for i live not in want:   release()
```

The same per-frame budget also covers re-scattering a chunk whose level of
detail band changed, so a frame never builds more than one chunk's worth of
work. `lo` is clamped to 0: chunk -1 would be built entirely from the clamped
`s = 0` frame, collapsing every row onto one point.

`acquire(i)`:
1. Take a `Chunk` from the pool (or construct it on first use).
2. Ensure `RoadPath` samples exist through `(i+1)*100 + margin`.
3. Rewrite the road ribbon and terrain vertex buffers **in place**
   (`BufferAttribute.needsUpdate`) — geometry objects are never recreated, so
   there is no GPU buffer churn and no allocation.
4. Ask `Vegetation` for instance slots and write matrices for the chunk's
   deterministic scatter (seed = `hash(worldSeed, chunkIndex)`), so a given chunk
   index always looks identical.
5. Attach any discovery event whose rarity roll for this chunk index passes.
6. Build the collider list (trunk cylinders, rock spheres, structure boxes) into
   a reused array.

`release(i)` frees instance slots, returns props to their pools and parks the
chunk object; nothing is disposed until page teardown.

Build cost is capped at one chunk per frame and chunks are requested far enough
ahead that a hitch is never visible. Vertical seams are impossible because
adjacent chunks share the exact same `RoadPath` samples at their boundary —
chunk `i` ends at `s = (i+1)*100` on the identical frame chunk `i+1` starts on.

---

## 6. Physics update order

Fixed step: `dt = 1/120 s` on high and balanced, `1/60 s` on mobile, with an
accumulator, at most 8 substeps per frame and the raw frame delta clamped to
0.1 s. If a frame needs more than 8 substeps the backlog is dropped rather than
paid off, because running the simulation in slow motion for the next few seconds
reads to the player as the engine losing power. No render interpolation — at
120 Hz the visual error is sub-pixel.

Per substep:

1. **Input conditioning** — throttle/brake ramp toward target; steering input is
   rate-limited and scaled by a speed-sensitive authority curve
   `steerMax(v) = lerp(30deg, 7deg, smoothstep(0, 55 m/s, v))`.
2. **Road query** — `project()` the chassis; get the frame, the lateral offset
   and a surface type per wheel (one wheel can be on gravel and another on
   grass).
3. **Suspension** — for each of 4 wheels: ground height under the wheel from the
   height function; spring `F = k*compression - c*velocity`, clamped travel. The
   sum is heave; the moments are pitch and roll torques.
4. **Load transfer** — static load +/- longitudinal (accel/brake) +/- lateral
   (cornering) transfer, giving a per-wheel normal load `Fz`.
5. **Longitudinal** — engine torque from an RPM curve x gear ratio (5-speed auto
   with shift hysteresis) x throttle, minus brake, minus aero drag
   `0.5*rho*Cd*A*v^2`, minus rolling resistance (surface dependent), minus the
   grade component taken from the road frame.
6. **Lateral / yaw** — bicycle model: slip angles from yaw rate and lateral
   velocity; tire force from a Pacejka-lite curve `Fy = D*sin(C*atan(B*alpha))`
   scaled by `Fz` and the surface friction coefficient (packed gravel 0.95,
   loose shoulder 0.68, grass 0.5, mud 0.38). A combined-slip ellipse clips
   longitudinal and lateral together, which is what produces power-on drift on
   gravel.
7. **Integrate** — planar velocity and yaw rate in world space. The body's
   vertical position, pitch and roll come from the suspension solution, so the
   truck banks with the road and squats/dives under load.
8. **Collisions** — swept-sphere against the chunk collider list; the response is
   an impulse plus a speed penalty plus a suspension kick. No ragdoll, no
   rollover — this is a driving game, not a crash simulator.

Once per rendered frame (not per substep): wheel spin/steer visuals, camera
spring, particle emission, audio parameter smoothing, telemetry publish.

**Ordering rule:** everything reads the road frame captured in step 2 of the
current substep. No system re-queries the road mid-step, so there is exactly one
authoritative surface per step.

---

## 7. Quality presets

| | HIGH | BALANCED | MOBILE/QUEST |
|---|---|---|---|
| pixel ratio cap | 2.0 | 1.5 | 1.0 |
| shadow map | 2048, 120 m | 1024, 80 m | 512, 45 m |
| chunks ahead | 10 | 8 | 6 |
| fog / draw distance | 900 m | 700 m | 480 m |
| vegetation density | 1.0 | 0.62 | 0.34 |
| tree LOD1 switch | 140 m | 100 m | 70 m |
| dust particles | 220 | 140 | 70 |
| post-processing | bloom | none | none |
| anisotropy | 8 | 4 | 1 |
| texture size | 1024 | 512 | 256 |

Auto-detection scores the UA (mobile / Quest), `navigator.hardwareConcurrency`,
`navigator.deviceMemory` and the WebGL `UNMASKED_RENDERER` string. The result is
only a default — the settings panel overrides it and the choice persists in
`localStorage`. Changing preset resizes the shadow map, re-scatters vegetation
and adjusts fog live, without a page reload.

---

## 8. Audio

One `AudioContext`, created **inside the START ENGINE click handler**. Every
sound is synthesised — no files, so there is nothing to hotlink and nothing to
download.

- **Engine**: 3 detuned sawtooth oscillators on RPM-derived fundamentals plus a
  noise layer, through a lowpass whose cutoff tracks throttle and load, into a
  waveshaper for grit. A short gain dip plus a pitch drop is the shift effect.
- **Gravel**: white noise -> bandpass, gain proportional to speed and surface
  looseness.
- **Skid**: a second noise path opened by lateral slip magnitude.
- **Wind**: noise -> highpass, gain proportional to v^2.
- **Suspension impact**: pooled short filtered-noise thumps triggered by
  suspension velocity spikes.
- **Ambience**: a slow filtered noise bed plus sparse randomised bird blips,
  ducked by speed. Creek sound is a positional node attached to bridge events.

All continuous parameters go through `setTargetAtTime`, never per-frame
`setValueAtTime`, to keep the audio thread quiet.

---

## 9. Performance rules (enforced in review)

- **Zero allocation in the frame loop.** Scratch `Vector3`/`Quaternion`/`Matrix4`
  are module-level singletons. No `new`, no array/object literals, no closures,
  no `.map/.filter` in anything called per frame or per substep.
- Vegetation, rocks and debris live in **global `InstancedMesh` pools** with a
  free-list slot allocator, so ~20 000 plants cost ~10 draw calls, not 20 000.
- Materials and textures are created once per quality preset and shared by
  everything that uses them. Changing preset disposes the whole set and rebuilds
  it; there is no cache across presets, because the textures are generated at a
  different resolution for each.
- Shadow casting is limited: the vehicle, structures, trunks and broadleaf
  canopies cast; conifer canopies, undergrowth and fallen logs do not, because
  alpha-tested foliage is the most expensive thing in the shadow pass. The ortho
  shadow camera is bounded and follows the vehicle, snapped to texel increments
  so shadows do not crawl at speed.
- Target draw calls: < 120 HIGH, < 80 MOBILE. Target triangles: < 900 k HIGH.
- `renderer.setAnimationLoop()` (not `requestAnimationFrame`) so WebXR can drive
  the loop unchanged.

---

## 10. WebXR readiness

- The loop already runs on `setAnimationLoop`.
- The camera rig never writes `camera.rotation.z` and never scales the camera.
- The cockpit view is an `Object3D` reference frame parented to the chassis; in
  XR the headset camera would be added under that same node, so the cockpit stays
  a stable reference frame and the world moves around the player.
- No screen-space post-processing on the mobile/Quest preset (it breaks stereo).
- The Enter-VR button is deliberately out of scope for this pass; the hooks exist.
