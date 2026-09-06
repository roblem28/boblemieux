# Blue Ridge Backroad — Biomes

**Status:** design only, no code.

Written because chapters do not read as distinct in play. The diagnosis is not that
eight is too few — it is that chapters vary the wrong axis. Six knobs on the same
road produce one road.

This spec adds a layer underneath chapters that changes *where you are*, not how the
road behaves.

---

## 1. The problem, stated precisely

A chapter bundles twistiness, grade, width, fog, time of day and surface. Every one
of those describes the **carriageway**. None of them touches what is either side of
it, what is above it, or what is beyond the treeline.

So all eight chapters render: a gravel road, through mixed Appalachian forest, under
a clear sky, with trees crowding to about 15 m either side. The Switchbacks carries
5× the twist of the straightest chapter — measured, real, and still not enough to
read as *a different place*, because the field of view is 85% trees and the trees
never change.

The measurement that predicted this and was not acted on: **width was dropped as a
scout trait because it does not discriminate at stage scale.** The same is true of
every chapter knob at the scale of "does this feel like somewhere new". They
discriminate over 400 m. They do not discriminate over a drive.

**Corollary worth internalising:** perceptibility is dominated by what fills the
frame, not by what the vehicle is doing. The cabin-view work found the same thing
from the other direction — a 4.1%-by-area snorkel read as a dominant obstruction
because it was the only hard vertical edge. Visual salience is not proportional to
parameter magnitude.

---

## 2. The layer

Two levels instead of one:

```
biome(s)     →  what world you are in     — trees, sky, horizon, scatter, light, water
chapter(s)   →  how the road behaves      — twistiness, grade, width, fog, surface
```

Biome changes on a **much longer wavelength** than chapter. A chapter runs ~420 m; a
biome should run **3–6 km** (**ASSUMPTION**, needs playtesting). You should drive
through six to twelve chapters inside one biome.

That ratio matters. If biomes change as often as chapters they become scenery
flicker; if they never change the game is back where it is now.

Both stay pure functions of `s` and the seed, both keyed so a chunk rebuild
reproduces them, both blended rather than snapped.

---

## 3. What a biome owns

| property | examples |
|---|---|
| **Scatter species and density** | hardwood / pine / scrub / none; trunk spacing, undergrowth |
| **Setback** | how far the treeline sits from the carriageway — the single biggest driver of how open the road feels |
| **Terrain beyond the verge** | rising bank, falling drop, flat field, water |
| **Sky and horizon** | overcast, clear, haze depth, whether a horizon is visible at all |
| **Light** | sun angle range, colour temperature, shadow length |
| **Ground colour and surface** | red clay, grey gravel, sand, blacktop patches |
| **Ambient audio** | wind in trees, water, insects, open-air silence — all procedural |
| **Set-piece pool** | which of the set-pieces can appear here, and their weights |
| **Curvature and grade envelope bounds** | a coastal shelf road is not free to be a switchback |

The last one is the coupling point with chapters: **a biome constrains the range a
chapter can set within it.** Chapter still chooses, but from a biome-appropriate
range. Otherwise you get switchbacks on a coastal shelf, which reads as broken.

---

## 4. Proposed biomes

Six, ordered by build cost. **ASSUMPTION** on the set; the point is the spread of
*look*, not the specific list.

| biome | what changes | cost |
|---|---|---|
| **Deep Forest** | Current road. Close treeline, no horizon, dappled light. The baseline. | free |
| **Ridge Run** | Treeline drops away one side, long horizon, exposed sky, wind. Big grade. | low |
| **Farmland** | Setback to 60 m+, fences, fields, barns, wide sky, flat light. | low |
| **The Quarry** | Rock walls, no vegetation, grey dust, hard shadow, sharp echo. | medium |
| **River Run** | Water alongside, bridges, mist, wet rock, reflected light. | medium |
| **Coastal Shelf** | Water plane, sea horizon, salt haze, guardrail, sand on the road. | high |

"Ridge Run" already exists as a chapter name — it should be promoted to a biome, and
the chapter renamed. That is a signal in itself: the thing that most wanted to be a
different place was already trying to be one.

**Coastal Shelf is the expensive one** and should be built last, not first. It needs
a water plane, a real horizon, reflection handling and a sky the existing renderer
may not have. Build the cheap four first and find out whether biomes fix the problem
before paying for the hard one.

---

## 5. Transitions

The hard part, and the place this will fail if it is going to.

A chapter blends over ~420 m by ramping numbers. A biome cannot ramp — you cannot
half-fade a pine into a rock wall. Three options:

1. **Crossfade scatter density.** Old species thins out over ~600 m while new species
   thickens. Works between any two vegetated biomes. Does not work to Quarry or Coast.
2. **Gate the transition on a set-piece.** The biome changes *behind* a bridge, a
   tunnel, a cutting, a ridge crest. The world is different on the other side because
   you went through something. This is the strong option — it makes the change an
   event rather than a smear, and it is how a real road does it.
3. **Gate on a fork.** See §7.

**Recommendation:** option 2 as the default, option 1 as fallback between compatible
biomes. Every biome declares which transition set-pieces it can be entered through.

This means **set-pieces stop being decoration and become structure.** A bridge is no
longer a thing you drive past; it is the seam between two worlds. That is also the
cheapest possible answer to "more cool things to see" — the things already in the
game start carrying meaning.

---

## 6. What this unblocks

- **Bridges** — become transition gates, which is a reason to build several distinct
  ones rather than one creek bridge repeated.
- **Weather** — currently cut entirely. Rain reads as a biome property with a duration,
  not a chapter knob, and only needs to work in the biomes that call for it. Ship it
  in River Run first, where wet surfaces are already thematically expected.
- **Jumps** — the road has no crests because grade noise runs on 140–430 m wavelengths.
  A jump is a *placed feature*, not noise: a short sharp grade spike, biome-gated, at
  a scheduled slot. Quarry and Farmland can carry them; Coastal Shelf cannot.
- **Set-pieces** — the pool becomes biome-specific, so a fire tower on a ridge and a
  jetty on the coast both make sense where they are.

---

## 7. Interaction with existing systems

| system | effect |
|---|---|
| **Chapters** | Survive, with their ranges constrained per biome. Rename the "Ridge Run" chapter. |
| **Timed stage** | Biomes must be **on** for a stage to be reproducible — so either lock biomes on always, or treat them like chapters (off by default, stage ignores them). Locking on is better; a biome-less road is the boring version. |
| **Mile splits** | Unaffected — biome is a function of `s` and the seed, same as everything else. |
| **Scout** | Should gain biome as a displayed trait, and probably as a requestable one. "Find me three miles on the coast" is a better request than any of the six current characters. |
| **Co-driver** | Needs no change, but could call the transition — "bridge, into the open". |
| **Director** | Gains a real lever. Picking a biome is a visible, unmissable change, which fixes the director's central weakness: its choices are currently imperceptible. |
| **Forks** | Becomes far more interesting. A junction where one branch climbs to the ridge and the other drops to the river is a genuine choice; two branches through identical forest is a coin flip. **Biomes should be built before forks.** |
| **Performance** | The unknown. More species, more distinct meshes, a water plane. Chunk budget needs measuring before the biome count grows. |

---

## 8. Phasing

**Phase 0 — prove the axis.** Build **two** biomes only: Deep Forest (existing) and
Farmland (cheapest possible contrast — setback to 60 m, no canopy, wide sky). Hard-cut
between them every 3 km with no transition handling at all.

Question it answers: **does changing the surroundings fix the sameness that changing
the road did not?** If driving from forest into open farmland does not feel like
arriving somewhere, the whole layer is wrong and stopping here costs a day.

This is the same shape as the forks Phase 0, for the same reason — the expensive part
is contingent on a perception question nobody has answered.

**Phase 1 — transitions.** Set-piece gating. Build two bridges and a cutting.

**Phase 2 — the cheap four.** Ridge Run, Quarry, plus the two above. Biome-constrained
chapter ranges. Biome-specific set-piece pools.

**Phase 3 — the expensive ones.** River Run with weather. Coastal Shelf last.

**Phase 4 — integration.** Scout biome trait, director biome lever, forks.

---

## 9. Acceptance tests

Following the rule that came out of the stage-picker bug: assert what is *on screen*,
not only what the function returns.

**Determinism**
- Same seed → identical biome sequence across 50 km.
- Chunk rebuild inside a biome and inside a transition: byte-identical.
- Biome boundaries land at the same `s` on every run.

**Distinctness — the whole point**
- Screen-space measurement per biome: fraction of frame that is sky, canopy, ground,
  road. Assert a minimum pairwise difference between every pair of biomes. If two
  biomes measure the same, they will read the same.
- Assert treeline setback differs by at least a set margin between biomes.
- This is the test that would have caught the chapter problem before it shipped.

**Constraint**
- No chapter, in any biome, sets a curvature envelope outside that biome's declared
  bounds.
- Every set-piece placed is in its biome's pool.

**Transitions**
- Every biome change coincides with a declared transition feature, or a permitted
  crossfade pair.
- No hard cut between an incompatible pair.

**Performance**
- Chunk build time and frame time inside every biome and across every transition,
  against the current forest baseline. Transitions are the worst case: two scatter
  sets live at once.

---

## 10. Open questions

1. **Does the axis actually fix it?** Phase 0. Everything else is contingent.
2. **What is the right biome wavelength?** 3–6 km is a guess. Too short is scenery
   flicker; too long and a drive stays in one biome.
3. **How many biomes before it feels varied?** Possibly four is plenty and six is
   indulgent. Build the cheap ones and find out before paying for water.
4. **Is a hard cut at a bridge better than a crossfade?** The claim in §5 is that an
   abrupt change gated by an event reads as *arrival* while a smooth one reads as
   *nothing happened*. That is a hypothesis, and Phase 0's hard cuts test it for free.
5. **Do biome-constrained chapter ranges make chapters redundant?** If a biome sets
   most of the character, eight chapters inside it may be back to the current problem
   at a smaller scale. Possibly chapters should reduce to three or four per biome.
6. **What does this cost per chunk?** Unknown, and it is the one thing that could kill
   the design outright.
