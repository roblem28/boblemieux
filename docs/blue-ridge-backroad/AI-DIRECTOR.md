# Blue Ridge Backroad — AI Director

**Status:** design, not built. Revised after review; the review changed the shape
of it substantially, and the changes are noted where they land.

The original question: *can a locally-hosted LLM be linked to a running browser
driving game and change the world as you drive?*

The revised answer: yes, but "change the world" is the wrong ambition. The model
should **choose** and **name**, not perturb. Almost everything worth having is
either deterministic code (and should not involve a model at all) or a selection
problem (where the search is cheap and only the taste is hard).

---

## 1. What the game is, technically

A browser 3D driving game: an endless procedurally generated Appalachian gravel
back road. Vite + TypeScript + React 19 + Three.js. No game engine, no physics
library, no react-three-fiber. It builds to a static bundle (~800 KB) served from
a plain static host — no server component at all, which was a hard requirement.

Three properties matter here:

**The world is a pure function of distance and a seed.** There is no stored
terrain. Everything is computed from `s`, distance along the road in metres:

| function | returns |
|---|---|
| `curvatureAt(s)` | horizontal curvature, rad/m, from summed noise octaves under a slow envelope |
| `gradeAt(s)` | longitudinal slope |
| `widthAt(s)` | carriageway width (7.3–9.4 m) |
| `fogAt(s)` | fog density, 0 on open road, 1 inside a foggy hollow |
| `eventSlot(n)` | which set-piece, if any, sits at scheduled slot `n` (~every 640 m) |

Heading and elevation are running integrals of curvature and grade, held in a ring
buffer, generated strictly forward and pruned behind the vehicle.

**Chunks are deterministic and disposable.** The road streams in 100 m chunks.
Each chunk's scatter is seeded by `hash(worldSeed, chunkIndex)`, so a chunk looks
identical however many times it streams in or out — and chunks *are* rebuilt
mid-drive when their level-of-detail band changes.

**There is already a slow telemetry channel.** A mutable record published at 10 Hz
carries speed, odometer, gear, road position, off-road state, mile and stage
timing, and a 360 m course-ahead preview (30 curvature samples plus a computed
advisory speed). The game object is on `window.brb` under a `?debug` flag.

Physics runs a fixed 120 Hz step (60 on mobile); rendering is on
`setAnimationLoop`.

---

## 2. The revised shape: three layers, only one of which is a model

| layer | what it is | needs a model? |
|---|---|---|
| **Co-driver** | pace notes from the course-ahead data | **No.** Pure function. |
| **Scout** | picks stretches of road matching a requested character | Search in code; model only names and justifies. |
| **Conditions** | surface, weather, time of day — diegetic, announced | Model picks a named chapter. |

The original draft had this backwards: it made pace notes the flagship model
feature and difficulty adaptation a headline. Both were wrong. Pace notes are a
closed grammar over data the game already computes, and hidden difficulty
adaptation is the one thing a driving game must not do (§5).

---

## 3. Hard constraints

### 3.1 Latency rules out anything in the loop

A round trip is 0.3–3 s; physics is 8.3 ms per step. The model can never be *in*
the loop. It is a director on a slow cadence — and with the chapter schema (§6)
its output is small enough that this is comfortable rather than tight.

### 3.2 Mixed content blocks the obvious deployment

The game is served over HTTPS; a browser refuses to call `http://box:11434` from
an HTTPS page. Options:

- **Run the game locally** (dev server on `127.0.0.1`) — works today, needs only
  CORS on the model host. Best for experimenting.
- **TLS on the model host** — Tailscale Serve or a Cloudflare tunnel. This is the
  recommended route for the deployed site.
- **A serverless proxy to a hosted model** — works, but reintroduces the server
  component the project deliberately avoided.

### 3.3 A mutating world breaks the timing system

Mile splits and the fixed 2-mile stage store personal bests per difficulty. Those
mean something *only* because the road is identical every run. Consequences:

- the director never touches the timed stage;
- anything it generates records its seed, and times are compared only within the
  same seed;
- this is a large part of why **selection beats perturbation** (§7).

### 3.4 Determinism is load-bearing

Chunks are rebuilt mid-drive. Anything the director decides must be stored **keyed
by chunk or slot index** and fed back through the same generators — never applied
imperatively to live objects. Otherwise a level-of-detail rebuild silently reverts
it, intermittently, and it will present as a streaming bug.

### 3.5 SpeechSynthesis cannot be routed into the AudioContext

In Chrome and Safari, Web Speech output does not surface as an `AudioNode`. There
is no bandpass, no radio treatment, no ducking against the engine. This — not the
timbre — is the real constraint on co-driver voice (§8).

---

## 4. Layer one: the co-driver (no model)

Pace notes are a **pure function** of `previewOffset[30]` / `previewSeverity[30]`
over a closed grammar: direction, severity, and the linking words — *tightens*,
*opens*, *into*, *over crest*, *don't cut*, *long*.

Deterministic, zero latency, unit-testable, and it works whether or not any model
is reachable — which also makes it the natural fallback layer when the director
is down (§9).

**One gap to close first.** Real notes need more than the severity array:

- *tightens / opens* is the **derivative** of curvature along the preview, not its
  magnitude;
- *crest / dip* needs elevation. `CoursePreview` already computes a `rise[]`
  array, but telemetry does not publish it. Small fix, needed before notes can
  call crests.

Lead time matters: a note has to be spoken 2–4 s before the corner, so the call is
issued at a distance of `speed × lead`. At 40 m/s the 360 m preview is 9 s of
road, which is ample.

---

## 5. Difficulty: adjust conditions, never handling

Invisible rubber-banding reads as patronising in driving games specifically,
because the player attributes grip to their own input. Take grip away silently and
they feel cheated; add it silently and the achievement is hollow.

The fix is to reclassify the knob. **Grip is a surface property, not a difficulty
property.** Gravel genuinely varies — damp, greasy, freshly graded, loose over
hardpack. Announced by the co-driver and surfaced on the HUD, the same float stops
being a hidden hand and becomes information the player uses.

So:

- `stability`, `rearBias`, `catchLock` are **locked to the chosen preset**. The
  director never touches how the truck behaves.
- `gripScale` and `offRoadDrag` may move, **only** as weather and surface, and
  **only** when announced.

That resolves the adaptive-difficulty question outright rather than answering it.

---

## 6. The patch: named chapters, not free floats

Six independent floats is theatre — most combinations produce changes no player
can perceive. Perceptibility, roughly ranked:

> time of day > fog > event schedule > width > curvature envelope > grip

(Width sits high on empirical grounds: it was the first thing a play-tester
noticed and complained about in this project.)

So the patch is **one named chapter plus a slot schedule**, where each chapter is
an authored bundle of envelope / grade / width / fog / time-of-day:

```jsonc
{
  "chapter": "closing_in",
  "slots": [{ "n": 14, "event": "foggy_hollow" }],
  "surface": "greasy",
  "reason": "three spins in the last mile, all on tightening corners"
}
```

Roughly eight chapters. The model picks; a ramp interpolates between them.
Validation becomes trivial, every change is perceptible by construction, and the
output drops to ~40 tokens, which makes the cadence comfortable on modest hardware
(§10).

---

## 7. Layer two: the scout, and the fork primitive

### 7.1 Search in code, taste in the model

The road is already infinite and deterministic. Evaluating candidate stretches
against a requested profile — *"fast start, technical finish"* — is just sampling
`curvatureAt` over candidate windows. That is microseconds of arithmetic and needs
no model at all.

The model's job is only to **name and justify** the pick from a shortlist. Search
in code, taste in the model. This is cheaper, higher hit-rate, and preserves
comparable times completely, because a selected stretch is still the same road
every time you drive it.

### 7.2 Forks make selection visible

The weakness of pure selection is that it is invisible — the world silently
becomes a different world. A **junction** fixes that: a fork in the road is
in-fiction justification for splicing to a different seed offset, and a branch is
recorded as a seed, so determinism survives.

This is the strongest single addition to the design. It is also the largest piece
of work in it, and the reason deserves stating plainly: **`RoadPath` is
one-dimensional.** Distance along the road is *the* coordinate; heading and
elevation are its integrals. A genuine fork makes that a tree, and every consumer —
streaming, projection, the collision query, the timing system — assumes a line.

A way to keep it one-dimensional:

- both branches are drawn for ~120 m past the junction, the untaken one built as a
  **cosmetic stub** by a temporary generator;
- the player's lateral position at the junction plane decides the branch;
- at that moment the seed offset changes and `s` simply continues;
- the stub is released like any other chunk.

That gets a visible, meaningful choice without turning the road model into a
graph. Worth prototyping before committing to anything more ambitious.

---

## 8. Co-driver voice

Given §3.5, radio treatment is off the table. But real pace notes are delivered
flat, fast and clipped — satnav dryness is closer to authentic delivery than
dramatic voice acting would be. Accept it:

- `rate ≈ 1.35`, `pitch ≈ 0.85`
- pick a specific voice by name, with a fallback chain
- break the project's no-binary-assets rule **only** if that loses a direct A/B

---

## 9. Failure behaviour

The game must be completely unaffected by a slow, offline or nonsensical model.

- **Silent stop**, plus **ramp-home**: the last valid patch decays to neutral over
  ~4 chunks rather than persisting forever.
- One in-flight request maximum; 2 s hard timeout; no retries during a drive;
  exponential backoff on the director itself.
- A schema violation counts as a timeout — no partial application.
- The co-driver keeps working throughout, because it is deterministic.

**Cadence: two clocks.** Propose on triggers, apply on boundaries. Floor 45 s
between applied patches, ceiling ~3 min forced refresh, hysteresis on triggers (a
spin count must clear its threshold twice). Mile markers are the natural commit
points — they already exist and already mean something to the player.

---

## 10. Hardware and model

*(Conditional on what the box actually is — adjust if the hardware differs.)*

**Validity should come from constrained decoding, not model quality.** A GBNF
grammar under llama.cpp, or Ollama's `format` with a JSON schema. Under that, a
3–4B model emits valid patches reliably.

Judgement about pacing wants more: 7–8B, e.g. Qwen3-8B or Llama-3.1-8B at Q4_K_M.

A Jetson Orin Nano 8GB fits 8B-Q4 at roughly 10–15 tok/s. A 150-token patch would
be 10–15 s — inside a 30 s cadence but uncomfortably tight. The chapter schema
(§6) cuts output to ~40 tokens, which makes it comfortable. A Pi 5 is not the box
for this.

Run the director on the Jetson and expose it over Tailscale Serve, which also
solves the TLS problem in §3.2.

---

## 11. Deliberately ruled out

- **Returning JavaScript to `eval`.** The obvious reading of "change the game as it
  goes", and a bad idea: arbitrary code execution driven by model output, and a
  direct injection path the moment the model reads untrusted text.
- **Hidden difficulty adaptation.** §5.
- **Free-float patches.** §6 — imperceptible, and hard to validate.
- **A model in the pace-note path.** §4 — it is a pure function; a model would add
  latency, nondeterminism and cost for nothing.
- **Mutating live chunks imperatively.** §3.4.
- **The director touching the timed stage.** §3.3.
- **Regenerating geometry per frame.** §3.1.

---

## 12. Remaining open questions

Most of the original list is now answered. What is genuinely still open:

1. **Do eight chapters actually feel distinct in play**, or does the ramp between
   them smear the differences out? Only testable by building them.
2. **Does the fork read as a choice** or as an arbitrary junction? A choice needs
   some basis — a sign, a glimpse of what is down there, a co-driver remark.
3. **How much does the scout need to see** to pick well? Curvature alone, or
   curvature plus elevation plus event density?
4. **Does announcing the surface change actually land**, or does the player ignore
   the callout and still attribute the grip change to themselves?

---

## 13. Build order

1. **Deterministic pace-note generator** — closed grammar, no model, plus
   publishing `rise[]` in telemetry. Standalone value, and it is the fallback
   layer everything else leans on.
2. **Chapter definitions and the ramp** — no model either. Prove the eight
   chapters are perceptibly different by switching them by hand.
3. **The scout's scoring function** — sample `curvatureAt` over candidate windows.
   Still no model; it can pick with a heuristic.
4. **The director module** — endpoint-optional, schema-validated, ramp-home,
   two-clock cadence. This is where a model first appears, and by now it is only
   choosing among things already known to work.
5. **Forks** — last, and prototyped as a cosmetic stub first.

Note the ordering: the model is step four of five. If steps one to three are
built and the model never arrives, the game is still better than it is today.
