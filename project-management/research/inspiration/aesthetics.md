# Aesthetics

Visual direction for gitspore. Based on `references.md` and the Pinterest boards listed there.

## Direction (Georgios, 2026-10-05)

- Sci-fi micro flora: plants that represent data and code. No story behind them; nobody needs them to be a believable species.
- Organic and natural forms. The idea also has moss, insects and similar.
- Everything sits on a base of some sort, under a glass dome.
- Neon tones in a dark environment, with Bloom. Combined with organic forms and some nice polished details: just enough to be visible and to convince people there is more detail than there is.
- Plants are tubes along curves, generated from commit data. Procedurally, more complex meshes get scattered on them for variety.
- Feasible in the short project time. Aesthetics are a small part of the 4 weeks, even though large in effect, and they have to be largely promptable.
- All terms (vine, beetle, spore, bloom, shoot, pest...) are still open.

## Suggestions (Claude, not agreed)

Everything below this line is input for the team's decision.

### Three directions from the images

All three keep the fixed points above (dark, neon, Bloom, organic, dome, base). They differ in palette, how much glows, and how the UI looks.

**A. Bioluminescent tank.** From the dark aquascapes, the crystal and the glass case's edges. Matte near-black base and stems; light only where something is active (a working agent, a growing tip, a bloom, an error). One cool neon (cyan or teal) for life, one warm color (amber) for attention, red for errors. Dome shown by its lit rim and reflections. UI: amber monochrome terminal style. Calm, readable, the cheapest to get right.

**B. Specimen lab.** From the cross-section poster, the violet ID card and the amber archive. Like A in the dome, but the base is cut open and shows soil layers (history as sediment, roots). UI as lab instruments: dithered images, field tables, waveforms; violet or amber. Clicking a beetle opens a "specimen card". More UI work, strongest identity.

**C. Neon reef.** From the coral clay board, the iridescent dashboard and the network graph. Denser, more colorful growth: magenta and coral with cyan, iridescent beetle shells, many particles. The most spectacular, the hardest to keep readable and fast.

Recommendation: A as the base, with two parts of B (the cut-open base and the specimen card). C's iridescent shell only on the beetle.

### Elements and how to make them

| Element | Method | Asset work |
|---|---|---|
| Base | low cylinder or rounded plinth, dark rock and soil material, a few scattered stones | CC0 textures (ambientCG, Poly Haven), stones generated or 1-2 models |
| Dome | half sphere or capsule; Fresnel rim + environment reflections | none |
| Stems | `CatmullRomCurve3` from commit data, tapered tube, shared stem shader (Fresnel rim, emissive gradient to the tip, light pulse traveling along) | none |
| Scatter on stems | positions from `curve.computeFrenetFrames()`, one `InstancedMesh` per type, random seeded by commit hash | 5-6 small meshes (leaf, pod, thorn, bud, fronds), low poly |
| Moss | `MeshSurfaceSampler` on base, stones and stale stems; density = time since last commit | 1 clump mesh or points |
| Blooms | instanced petals that open with an animation | 1 petal mesh |
| Particles / spores | `Points`, one draw call; mist when CI passes | none |
| Beetle (agent) | the one hero asset; variations by scale, color, emissive pattern | 1 model, simple animation |
| Post-processing | selective Bloom (`toneMapped={false}` on emissive parts), vignette, light grain, fog | none |

Seeding randomness with the commit hash makes the same repo always grow the same plant (needed for replay and tests).

### Scope

Aesthetics share the 4 weeks with everything else. Suggested budget: about 15-20% of the team's time, mostly one person, spread like this:

| Week | Aesthetics work | Done when |
|---|---|---|
| 1 | Style frame: dome, base, one generated stem with the shared shader, Bloom, one scatter type. Doubles as the R3F test in the week-1 gate. | one screenshot the team agrees on; palette and tokens written below |
| 2 | Parts kit wired to data: stems from real commits, scatter, blooms, simple placeholder beetle | any repo renders as a plant |
| 3 | Beetle model, moss, particles, specimen card UI | agents visible and clickable |
| 4 | Polish only: post-processing tuning, cut-open base if time, glass refraction if time | demo looks finished on our repo |

Cut order if time runs short (first to go first): glass refraction, cut-open base with layers, iridescent shell, extra insect types, moss on stems (keep on base), light pulses.

### Keeping it promptable

So that Claude or any teammate can build parts from a prompt and get a consistent result:

- One written style spec (this file) with fixed **tokens**: hex colors, emissive intensities, Bloom threshold and strength, fog distance, stem radius range. Filled in after the week-1 style frame.
- One shared stem/organic shader and one material module that every component imports. Prompts say "use the organic material", not "make it glow".
- Prefer procedural over hand-made: almost everything in the table above is code. Only the beetle and the small scatter meshes are assets.
- For the beetle: a CC0 model, a quick Blender model, or an AI 3D generator. Check the license of anything generated or downloaded before it goes into the public repo.
- Reference screenshots of the style frame (our own renders, so they can be committed) next to this file, for prompts to point at.

### Tokens

Not set yet. Candidates for direction A:

| Token | Candidate |
|---|---|
| background | `#05070a` |
| matter (base, stems) | `#11161b` |
| life (cyan) | `#3ef2d0` |
| attention (amber) | `#ffb347` |
| error (red) | `#ff3b5c` |
| UI text | amber `#ffb347` on `#05070a` |
