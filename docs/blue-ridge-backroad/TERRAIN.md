# Blue Ridge Backroad — Terrain

**Status:** design only, no code. The largest change proposed on this project.

Written because Phase 0 of the biome layer measured 35 points of screen-space
difference and still did not read as arriving somewhere. The diagnosis is that
removing the forest corridor exposed the fact that there is nothing behind it.

---

## 1. The problem

The game has a road, a strip of ground either side of it, and scatter. It has no
terrain.

Every variation built so far — eight chapters, two biomes — modifies the 15 m either
side of a corridor that runs through a void. That is why:

- **Trees float.** Scatter is placed without a ground surface beneath it, which is
  the visible symptom of the same absence.
- **Farmland did not land.** It removed the corridor and there was nothing to reveal.
  Canopy fell 18.3 points into road and ground — not into *world*.
- **Sky did not move.** 32.8 vs 31.9. The chase camera already saw plenty of sky. The
  frame has always been road, verge, trees, sky and nothing in between.

There is no middle distance. Nothing at 100–2000 m. No hillside the road climbs, no
valley below, no ridge on the horizon. A driving game's entire sense of place lives
in that band and this one has none of it.

**This is the thing that would change how it looks, and nothing smaller will.**

---

## 2. The invariant that must survive

> The road is a pure function of distance and a seed.

Splits, chapters, the scout, the director and the co-driver all key off `s` and
`gradeAt(s)`. Timed comparability depends on it. Nothing in this spec may weaken it.

That rules out the obvious approach.

**Rejected — terrain first, road follows.** Generate a heightfield, then route a road
through it along low-gradient contours. This is how a real road comes to exist and it
produces the most convincing result. It also makes the road's elevation an *output*
of a 2D search rather than an integral of `gradeAt(s)`, which breaks every system
above it. Not worth it.

**Chosen — road first, terrain conforms.** `gradeAt(s)` stays authoritative. The road
surface is exactly what it is today. Terrain is a surface that is *forced* to match
the road within a corridor and free beyond it.

Nothing above this layer changes. That is the point.

---

## 3. Parameterisation

Terrain is generated in **road space `(s, u)`** — distance along, lateral offset —
not in a world-space grid.

This is the decision that makes the rest cheap:

- Determinism is inherited. Terrain is a pure function of `(s, u)` and the seed,
  exactly like everything else.
- It streams with the road, chunks with the road, prunes behind the vehicle with the
  road. No second streaming system.
- It cannot disagree with the road, because it is built from the road.

**The cost is the fold.** The road curves; a ribbon in `(s, u)` self-intersects where
`u` approaches the local turning radius. The generator clamps at 115 m minimum radius
and rarely goes below ~140 m, so:

- **Conformed ribbon: `u` up to ±80 m.** Safe against folding at 115 m radius with
  margin. **ASSUMPTION**, wants checking against the actual worst-case corner.
- Anything beyond ±80 m needs a different mechanism. See §5.

---

## 4. The corridor: cut and fill

Terrain height at `(s, u)`:

```
h(s, u) = lerp( roadSurface(s), freeTerrain(s, u), w(|u|) )
```

- `roadSurface(s)` is the existing elevation integral. Unchanged.
- `w` is 0 out to the shoulder, then ramps to 1 by the conform edge.
- **ASSUMPTION** full conformance to ±10 m, ramping to free by ±55 m.

Where free terrain sits **above** the road you get a cut bank. Where it sits
**below**, an embankment. Both fall out of the blend for free, and both are exactly
what a mountain back road looks like. This is the cheapest realism in the whole spec
— it is a consequence of the maths, not something that has to be authored.

`freeTerrain(s, u)` wants **long wavelengths and large amplitude**. The mistake to
avoid is treating it like the existing scatter noise. A hillside is tens of metres of
relief correlated over hundreds of metres. Noise at 20 m wavelength and 2 m amplitude
will read as ground texture, not as land.

**ASSUMPTION** primary wavelength 300–800 m laterally, amplitude 20–60 m. Needs the
same treatment the curvature bands got: print the distribution before choosing.

---

## 5. Middle distance and horizon

The corridor fixes floating trees and gives cut banks. **It does not fix "boring."**
±80 m is still a corridor, just a wider one with walls.

What changes the frame is seeing land at 200 m to 3 km — a ridge the road is climbing
toward, a valley opening on one side, a silhouette against the sky.

Three options, in increasing cost:

1. **Silhouette layer.** A coarse world-space heightfield, sampled sparsely, rendered
   as low-poly geometry beyond the ribbon. No collision, no scatter, no LOD beyond one
   band. Must agree with the conformed ribbon at the seam or there is a visible tear.
2. **Extended ribbon with fold handling.** Push `u` further and handle
   self-intersection explicitly. More correct, considerably harder, and the failure
   mode is geometry knots on tight corners.
3. **Full world-space terrain.** Correct, expensive, and reintroduces a second
   streaming system with its own determinism story.

**Recommendation: option 1.** It is the only one that fits the existing architecture,
and combined with the existing `fogAt(s)` it produces aerial perspective, which is
most of what sells distance.

The seam is the risk. The silhouette layer and the ribbon must be generated from the
same underlying field so they agree where they meet.

---

## 6. What this fixes and unblocks

| | |
|---|---|
| **Floating trees** | Scatter samples terrain height instead of road height. Direct fix. |
| **Biomes** | Gains its teeth. The Phase 0 finding was that openness is the *absence of a corridor*, not the presence of sky. Terrain is what makes a corridor: Ridge Run gets a wall one side and a drop the other, Quarry gets hard walls, Farmland gets genuine rolling openness rather than just missing trees. |
| **Jumps** | A crest needs a hill to sit on. Currently impossible — grade noise runs on 140–430 m wavelengths and the largest turn-over in a 360 m window is ~0.3 m. |
| **Coastal Shelf** | Becomes buildable. A shelf road is terrain — wall inland, drop seaward. Without terrain it is a texture swap. |
| **Forks** | A junction where one branch climbs and the other descends is only legible if you can see where each goes. |
| **Off-road** | Currently a drag scalar. With terrain, leaving the road means a slope, which is a real consequence without needing vehicle physics work. |

---

## 7. Explicitly out of scope

- **Vehicle-terrain physics.** Suspension is cosmetic and there is no swept-sphere
  collision. Terrain provides a height query for off-road; it does not get a
  suspension model in this work.
- **Terrain-following road routing.** §2.
- **Caves, overhangs, tunnels.** A heightfield cannot express them. A tunnel, if
  wanted, is a set-piece.
- **Terrain deformation.** Nothing writes to it.

---

## 8. Phasing

**Phase 0 — the corridor.** Conformed ribbon to ±80 m, cut and fill from the blend,
scatter sampling terrain height. One terrain character, no biome variation, no
silhouette layer.

Answers: does ground under the trees, plus banks and embankments, change the frame on
its own? It might. Cut banks on a mountain road are a strong visual and there are
currently none.

**Phase 1 — the silhouette layer.** Distant land. This is the one expected to do the
heavy lifting on "boring," and it should be measured separately so its contribution is
known rather than assumed.

**Phase 2 — biome terrain character.** Ridge, quarry, farmland get distinct terrain
profiles. Revisit the biome ordering in BIOMES.md §4, which was written on the
now-disproved assumption that sky was the mechanism.

**Phase 3 — features.** Jumps, coastal shelf, whatever the earlier phases show is
worth having.

Stop after any phase that does not move the needle. That rule already paid for itself
once.

---

## 9. Acceptance tests

**Determinism**
- Same seed → identical terrain heights across 50 km, sampled on a fixed lattice.
- Chunk evicted and rebuilt: byte-identical terrain mesh.
- Terrain height at `u = 0` equals `roadSurface(s)` to within float epsilon,
  everywhere.

**Geometry**
- No gaps or tears at chunk seams, at the conform edge, or at the silhouette seam.
- No self-intersection anywhere in the ribbon, tested against the tightest corner the
  generator can produce, not the tightest it usually produces.
- No z-fighting at the road edge.

**The floating-tree assertion**
- Every scatter instance sits within epsilon of terrain height. This is the test that
  should have existed before any of this.

**The point of the whole exercise — measured**
- Screen-space fraction of frame occupied by terrain beyond 100 m, averaged over fixed
  stretches, before and after. Currently near zero.
- Same measurement per phase, so the silhouette layer's contribution is separable from
  the corridor's.
- **Use a depth or geometry classifier, not colour.** The biome measurement had to be
  rebuilt because pale gravel is not separable from lit grass by hue, and the colour
  version understated the difference by half.

**Performance**
- Chunk build time, and draw calls as the GPU proxy, per phase, against the current
  baseline of 103 in Deep Forest.
- Terrain is the first thing on this project with a real vertex budget. Measure early;
  a ribbon at ±80 m across a 100 m chunk is a lot of triangles at naive resolution.

---

## 10. Open questions

1. **Does the corridor alone move it, or is the silhouette layer the whole answer?**
   Phase 0 answers it, and the phases are split precisely so the contributions are
   separable.
2. **What lateral amplitude reads as land rather than texture?** 20–60 m is a guess.
   Print the distribution first — the same discipline that fixed the severity bands
   and the chapter envelope.
3. **What is the vertex budget?** Unknown, and the most likely thing to kill this.
4. **Can the silhouette layer and the ribbon be made to agree at the seam** without
   generating both from a shared world-space field, which is the thing §3 avoided?
5. **Does cut-and-fill conflict with the existing grade?** The road climbs 6–18 m per
   window. Against 40 m of lateral relief that produces large banks. Whether that
   reads as dramatic or as a trench is a playtest question.
6. **Is this worth doing at all?** Honest question. It is the largest change proposed,
   the existing game is live and works, and Phase 0 of biomes already came back
   negative once. The case for it is that every previous attempt at variety failed for
   the same reason, and this is that reason.
