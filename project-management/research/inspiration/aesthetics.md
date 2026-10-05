# Aesthetics

Visual direction for gitspore. Based on `references.md`, the Pinterest boards listed there, and the render studies in `renders/`.

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

Two proposals, both built as live Three.js scenes in `renders/`. Neither is decided. They share the same scene: a geodesic dome, one glass terrarium per repo, a soil bed, branches as roots on the soil, rocks, moss, ferns, crystals, mushrooms, beetles as agents.

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

Light and post:

| | Light | Dark |
|---|---|---|
| Hemisphere | `#ffffff` / `#9a9086`, 0.32 | `#5a6a9a` / `#1a1210`, 0.7 |
| Key light | `#fffaf2`, 2.6, low from the side, shadow map 4096, radius 2 | `#aab8ff`, 0.9 |
| Environment reflections | 0.16 | 0.3 |
| Bloom | off (it catches every white surface) | strength 0.55, threshold 0.85 |
| Vignette | 0.82 (mild) | 0.35 |

Interface: rounded glass panels and tags, black or white text, red for prompts, status, repos and agents. In red-on-white the coral data and the black issues carry all meaning, without glow.

### Shared between both proposals

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

### Keeping it promptable

- The colour tables above are the tokens. Code reads them from one theme file; prompts name the meaning ("data colour", "issue colour"), not a hex value.
- One shared material module (clay, bark with veins, glass, frame). Prompts say "use the bark material", not "make it glow".
- Prefer procedural over hand-made. Only the beetle is a real asset.
- The renders in `renders/` are our own work and can be committed and referenced in prompts.

## Earlier exploration

Kept for context; superseded by the proposals above.

- Three image directions (bioluminescent tank, specimen lab, neon reef) and image-generator prompts. Generated images were not convincing; the team switched to rendering the scenes directly.
- `renders/vine-jar.*` and `vine-jar-textured.*`: a single climbing vine in a bell jar with an amber specimen HUD. Showed that branches must split and rejoin (vine, not tree) and that textures only pay off close up.
