# Aesthetics: terrarium proposals (archived)

Moved here on 2026-10-07 from `research/inspiration/aesthetics.md`. Georgios's first visual brief and the three terrarium proposals (bark-01, clay-02, vine-03) for concepts v1 and v2. Superseded by the planter grid proposals of concept v3; the current direction is in `research/inspiration/aesthetics.md`. Renders: `renders/` next to this file; catalogue: `proposals.html`.

## Direction (Georgios, 2026-10-05)

- Sci-fi micro flora: plants that represent data and code. No story behind them; nobody needs them to be a believable species.
- Organic and natural forms. The idea also has moss, insects and similar.
- Everything sits on a base of some sort, under a glass dome.
- Neon tones in a dark environment, with Bloom. Combined with organic forms and some nice polished details: just enough to be visible and to convince people there is more detail than there is.
- Plants are tubes along curves, generated from commit data. Procedurally, more complex meshes get scattered on them for variety.
- Feasible in the short project time. Aesthetics are a small part of the 4 weeks, even though large in effect, and they have to be largely promptable.
- All terms (vine, beetle, spore, bloom, shoot, pest...) are still open.

Later in the same session: one terrarium per repo inside a larger geodesic dome (from the "micro-Biome Station" reference), branches lying on the soil like roots, darker and more realistic than that reference, amber terminal, little metal.

## Proposals

Three proposals, all built as live Three.js scenes in `renders/`. None is decided. bark-01 and clay-02 share one scene: a geodesic dome, one glass terrarium per repo, a soil bed, branches as roots on the soil, rocks, moss, ferns, crystals, mushrooms, beetles as agents. vine-03 is a different scene: one repo as a climbing vine in a tall bell jar.

### proposal-bark-01: bioluminescent bark

Night scene. Dark textured bark with thin cyan light veins running through it; amber terminal interface.

- Renders: `renders/biome-station-frame.html`, `biome-station-frame.jpg`, `biome-station-frame-close.jpg`. Earlier steps: `biome-station-bark.*`, `biome-station.*`.
- Character: calm, nocturnal, organic. Strongest close up; the full view is dark and carried by frames and labels.

| Meaning | Colour | Where |
|---|---|---|
| Life and data | cyan `#3ef2d0` | veins in the bark, pulses, commit beads, merge flowers, spores |
| Issues | coral `#ff5a4f` | berries on short stalks |
| Agents and interface | amber `#ffb000`, dim `#6b4a1a` | beetle seam, labels, terminal, HUD |
| Night | sky `#05060c` → `#111628` → `#2a2238`, fog `#0b0d16` | background |
| Matter | CC0 textures, tinted dark | bark `bark_willow_02`, soil `forest_ground_04`, rock `rock_boulder_dry`, `rocks_ground_06` |
| Frame and dome | `#1b1a19`, `#14171d`, matte | thin, recedes into the night |

Measured share of the image (full view / close-up, interface included): neutrals 99.4% / 97.7% (dark 80.4 / 25.5, mid 18.8 / 70.2, light 0.2 / 2.0), cyan 0.2% / 1.6%, amber 0.3% / 0.4%, coral 0.0% / 0.1%.

Light and post: hemisphere `#5a6a9a`/`#1a1210` 0.9, cool key light 1.2, ACES tone mapping, Bloom strength 0.45 / radius 0.35 / threshold 0.9, vignette 0.35, fine grain. Interface: amber monospace on near-black panels, 1px amber borders, no rounding.

### proposal-clay-02: clay specimen, light and dark

Off-white plastic, like a physical lab model (reference: the white and coral clay data board). One scene with a light and a dark theme and a switch between them.

- Renders: `renders/biome-station-modes.html` (switch top right, or `?theme=light` / `?theme=dark`), `biome-station-modes-dark.jpg`, `biome-station-modes-dark-close.jpg`, light mode in `biome-station-light.jpg`, `biome-station-light-close.jpg`.
- Character: clean, legible, a specimen under study. Light mode reads like a product; dark mode looks like embers running through roots.

Forms and materials are the same in both themes. Textures only add relief (normal maps), no colour. Tones vary slightly between objects so they stay distinct.

| Meaning | Light theme | Dark theme |
|---|---|---|
| Matter (roots, soil, rocks, plants, frame, dome) | clay `#f3f0eb` `#eeebe6` `#f1eee9` `#e8e4de` `#e4e0da` `#d9d5ce`, roughness 0.5-0.8, light clearcoat | the same tones × 0.035 (charcoal plastic) |
| Data (veins, commit beads, merge flowers) | red `#ff2d1f`, painted on, petals `#ff5a4a` | the same red, glowing with Bloom |
| Issues | glossy black `#161514` | glossy bone `#e9e4dc` |
| Agents | white ceramic beetle, amber seam `#ffa000` | dark iridescent beetle `#16130f`, amber seam |
| Interface | frosted glass `rgba(255,255,255,.42)`, blur 16px, ink `#141210`, red `#e5261a` | smoked glass `rgba(18,19,25,.45)`, ink `#eeebe5`, red `#ff4a3d` |
| Background | `#f6f4f0` → `#d8d3cc`, fog `#e6e2dc` | night sky and stars, fog `#0b0d16` |

Measured share of the image (full view / close-up, interface included):

| | Light | Dark |
|---|---|---|
| Neutrals | 99.9% / 97.8% (almost all light tones) | 99.7% / 95.9% (dark 70.3 / 17.6, mid 29.4 / 78.2) |
| Red (data) | 0.1% / 2.1% | 0.3% / 3.8% |
| Amber (agents) | 0.0% / 0.1% | 0.0% / 0.1% |

Light and post:

| | Light | Dark |
|---|---|---|
| Hemisphere | `#ffffff` / `#9a9086`, 0.32 | `#5a6a9a` / `#1a1210`, 0.7 |
| Key light | `#fffaf2`, 2.6, low from the side, shadow map 4096, radius 2 | `#aab8ff`, 0.9 |
| Environment reflections | 0.16 | 0.3 |
| Bloom | off (it catches every white surface) | strength 0.55, threshold 0.85 |
| Vignette | 0.82 (mild) | 0.35 |

Interface: rounded glass panels and tags, black or white text, red for prompts, status, repos and agents. In red-on-white the coral data and the black issues carry all meaning, without glow.

### proposal-vine-03: specimen jar

One repo in a tall glass bell jar on a stone plinth. The repo grows upward as a vine; the interface around it is an amber lab instrument.

- Renders: `renders/vine-jar-textured.html`, `vine-jar-textured.jpg`, `vine-jar-textured-close.jpg`. Untextured first version: `vine-jar.*`.
- Character: vertical, precise, a specimen under observation. The strongest of the three at showing branch structure (splitting and rejoining) and where a branch could grow next. Shows one repo at a time.

| Meaning | Colour | Where |
|---|---|---|
| Commits | amber `#ffb000` | beads along every vine |
| Recent commits, growing tips | off-white `#f2e8d5` | beads near open tips |
| Merges | amber `#ffb000`, bright | knot and ring where a branch fuses back |
| Possible growth | cyan `#3ef2d0` | dashed paths fading out from active tips, particles flowing along them |
| Issues | coral `#ff5a4f` | small node clusters on vines |
| Agents | amber seam on a dark iridescent beetle | at active tips |
| Stale | dim amber `#6b4a1a`, moss `#2b2614` | drooping vines, moss on them and on the rocks |
| Background | warm black `#0b0805`, fog (exponential, 0.035) | everywhere |
| Matter | CC0 textures tinted warm and dark | vines `bark_willow_02`, plinth `rocks_ground_06`, soil `forest_ground_04`, rocks `rock_boulder_dry` |

| Thing in the repo | Shape in the scene |
|---|---|
| Repository | the bell jar on its plinth |
| `main` | central vine spiralling up through the jar |
| Branch | thinner vine coiling around `main`; merged branches fuse back into it, nested branches into their parent |
| Open branch | vine wandering outward, ending in a curled tendril |
| Stale branch | vine drooping down, mossy, dim beads |
| Activity over time | the plinth as a radial bar chart, one bar per day, recent days amber |
| Agent working | beetle at the branch tip, cyan possible paths ahead of it |

Measured share of the image (full view / close-up, interface included): neutrals 96.3% / 96.0% (dark 85.5 / 83.9, mid 10.7 / 11.9), amber 3.6% / 4.0%, coral 0.0% / 0.1%, cyan 0.0% / 0.0%.

Light and post: no tone mapping, warm ambient `#3a2814`, warm key `#ffd9a0`, amber point light inside the jar, small cyan light near the active tips. Bloom strength 0.6 / radius 0.4 / threshold 0.78, vignette 0.25, grain. Glass: rim light only (Fresnel shader), condensation dots low on the glass, a few mist sprites at the top.

Interface: amber monospace (IBM Plex Mono) on warm black, 1px dim amber boxes, no rounding. A census table (branches, merged, open, stale, commits, issues, agents), an agent radar, an agent card with a 1-bit dithered portrait rendered from the beetle model and a live waveform, an activity timeline matching the plinth chart, labels with leader lines to the vine tips.

Known weak points: the vines read as a regular coil (needs noise and gravity), beetles are small at this distance, textures only show close up, the tube winding bug is still in this render.

### Colour proportions

How the shares were measured: each screenshot scaled to 320×180; pixels with saturation above 0.4 and value above 0.3 count by hue (red/coral, amber, cyan), all others as neutral, split by luminance (dark below 0.12, light above 0.5). The interface panels are part of the image and count too.

What the numbers show: in all three proposals neutrals fill 96-99% of the image and colour is a small accent. In the full views the data colour stays under 1% (bark-01, clay-02), too little to read the repo from a distance. vine-03 has the most colour (about 4% amber) because its commit beads are larger and denser.

Suggested targets (Claude, not agreed): neutrals about 93-95%, the data colour 3-5%, every other accent at most 1%. To reach that in overview shots: larger beads and stronger veins when zoomed out, smaller when zoomed in.

### Shared by bark-01 and clay-02

**Meanings stay fixed; only colours change per proposal and theme.**

| Thing in the repo | Shape in the scene |
|---|---|
| Repository | glass terrarium on a soil bed, connected to others by cables |
| `main` | the thickest root, running the length of the bed |
| Branch | thinner root leaving `main`; merged branches grow back into it |
| Open / stale branch | free root end lifting slightly / root without light |
| Commit | bead on the root |
| Data moving | pulse travelling along the veins |
| Merge / PR | flowers at the merge point |
| Issue | berries on a stalk |
| Agent | beetle on the branch it works on, with label |

**Scene parts and how they are built**

| Part | Method | Effort |
|---|---|---|
| Roots | `CatmullRomCurve3` from data, custom tapered tube | medium |
| Veins and pulses | one shader on the bark material (procedural veins, pulses along the length) | low, done |
| Beads, moss | `InstancedMesh` | low |
| Terrarium | hexagonal prism from code, thin struts as instanced cylinders, glass | low |
| Dome | icosahedron edges as instanced struts | low |
| Flowers, crystals, mushrooms, ferns | small generated meshes | low |
| Beetle | primitives now; one modelled asset later | medium |
| Textures | CC0 from Poly Haven, loaded from their CDN | low |
| Theme switch | one table of light/dark values per material, one function to apply | low, done |
| Interface | HTML/CSS overlay, labels projected from 3D | low |

**Notes for the implementation**

- The tube builder in the early studies wound its triangles the wrong way, so the inside of the roots was visible. Fixed in `biome-station-light.html` and `biome-station-modes.html`; the dark-only studies still have it.
- Labels inside a terrarium overlap. Show branch names on hover or when zoomed in.
- In the full view the side terrariums are too small to read. The app should open zoomed in on one repo and use the station view as an overview.
- Bloom works only on dark backgrounds. In light themes, meaning has to come from colour contrast.

### Scope

Aesthetics share the 4 weeks with everything else. Suggested budget: about 15-20% of the team's time, mostly one person.

| Week | Aesthetics work | Done when |
|---|---|---|
| 1 | Pick a proposal. Port the scene parts to R3F components with the theme table. Doubles as the R3F test in the week-1 gate. | one terrarium renders from sample data |
| 2 | Parts wired to real data: roots from commits, beads, merges, issues | any repo renders |
| 3 | Beetle model, agents clickable, interface | agents visible and clickable |
| 4 | Polish only: shadows, post-processing, label behaviour | demo looks finished on our repo |

Cut first if time runs short: the theme switch (ship one theme), the geodesic dome, cables between terrariums, crystals and mushrooms, the beetle model (keep primitives).

## Earlier exploration

Kept for context; superseded by the proposals above.

- Three image directions (bioluminescent tank, specimen lab, neon reef) and image-generator prompts. Generated images were not convincing; the team switched to rendering the scenes directly.
