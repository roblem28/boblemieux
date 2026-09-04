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

- `App.tsx` holds a small state machine: `title -> driving` (+ `paused`).
- `<GameCanvas>` mounts a `<canvas>` and constructs the imperative `Game`
  object once in an effect. React never re-renders during the game loop.
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
  App.tsx                  screen state machine
  ui/
    TitleScreen.tsx        cinematic title + START ENGINE (also the audio unlock gesture)
    Hud.tsx                MPH dial, odometer, camera/sound/settings buttons, FPS (dev)
    TouchControls.tsx      pointer-event steering + pedals, multi-touch safe
    SettingsPanel.tsx      quality preset override, FPS toggle
    telemetry.ts           throttled external store (useSyncExternalStore)
  game/
    Game.ts                renderer, scene, clock, fixed-step accumulator, systems wiring
    quality.ts             preset table + auto-detection + localStorage override
    input.ts               InputState, keyboard bindings, gamepad-ready shape
    road/
      RoadPath.ts          THE ROAD COORDINATE SYSTEM (section 4)
      RoadMesh.ts          road + shoulder + ditch ribbon builder (pooled buffers)
    world/
      ChunkManager.ts      streaming, pooling, lifecycle (section 5)
      Chunk.ts             one chunk's meshes + instance slots + collider list
      Terrain.ts           road-conforming terrain skirt geometry
      Vegetation.ts        global instanced pools per species/LOD + slot allocator
      Scatter.ts           deterministic per-chunk placement (rocks, branches, weeds)
      Mountains.ts         3 parallax ridge layers, camera-locked in XZ
      Sky.ts               gradient dome, sun disc, time-of-day driver
      events/              discovery set-pieces (bridge, cabin, gas station, ...)
    vehicle/
      VehicleModel.ts      procedural body/glass/chrome/lights/interior, LOD0/LOD1
      VehiclePhysics.ts    the model in section 6
      Wheels.ts            spin, steer, suspension travel visuals
    camera/
      CameraRig.ts         chase / hood / cockpit, spring-damped, XR-safe
    fx/
      DustSystem.ts        pooled point-sprite dust at wheel contacts
      GravelSystem.ts      pooled gravel chips with ballistic arcs
    audio/
      AudioEngine.ts       Web Audio graph, all procedural (section 8)
    util/
      rng.ts               mulberry32 + hash-based deterministic noise
      noise.ts             value/fbm noise used by road, terrain, textures
      textures.ts          canvas-generated albedo/normal/roughness, cached
      pool.ts              generic object pool + free-list slot allocator
      mathx.ts             damping, clamp, moveTowards, spring
```

---

## 4. Road coordinate system

The road is **arc-length parameterised**, not a `CatmullRomCurve3`. Distance
along the road `s` (metres) is the primary coordinate; every other quantity is a
function of it. This makes "distance along road", the odometer, chunk boundaries
and streaming all the same number, with no curve reparameterisation error.

### Generation

A deterministic seeded generator produces, for each sample `i` at
`s = i * STEP` (`STEP = 4 m`):

- `kappa` — horizontal curvature (rad/m): a sum of 4 sine octaves of `s` with
  seeded phases, clamped so the radius never drops below ~45 m (curves stay
  readable from far enough away to react).
- `grade` — longitudinal slope (rise/run), 3 octaves, clamped to +/-9 %.
- `bank` — superelevation derived from curvature and a reference speed, then
  smoothed, so curves are banked the way a real road is (outside edge high).
- `width` — 5.0–6.7 m (16–22 ft), slow noise.

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
| `right` | unit lateral, **rotated by the bank angle** |
| `normal` | unit road surface normal (banked) |
| `elevation` | centreline y |
| `curvature` | signed rad/m |
| `width` | full carriageway width |
| `bank` | superelevation angle |

Between table samples everything is linearly interpolated (heading through its
own integral, so there are no angle-wrap issues).

### World <-> road mapping

`RoadPath.project(worldPos, hintS)` does a bounded local search around the
previous frame's `s` (the vehicle cannot move more than ~2 m per substep), then
one Newton refinement against the tangent. Cost is O(1) and allocation-free.
`lateral` is signed metres from the centreline: `|lateral| < width/2` is the
carriageway, `< width/2 + shoulder` is the gravel shoulder, beyond that is the
drainage ditch and then open terrain — this is what the physics uses to pick a
surface friction coefficient.

Surface height anywhere is `frame.pos.y + lateral * sin(bank)` plus the terrain
skirt profile beyond the shoulder, so the vehicle, the mesh and the physics all
agree on exactly one height function.

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

Fixed step `dt = 1/120 s`, accumulator, max 4 substeps per frame
(spiral-of-death guard), remainder carried. No render interpolation — at 120 Hz
the visual error is sub-pixel.

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
- Materials are shared and created once; textures are cached by key.
- Shadow casting is limited to the vehicle plus near trees and structures, with a
  bounded ortho camera that follows the vehicle.
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
