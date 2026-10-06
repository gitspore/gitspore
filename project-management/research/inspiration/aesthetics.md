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

### Keeping it promptable

- The colour tables above are the tokens. Code reads them from one theme file; prompts name the meaning ("data colour", "issue colour"), not a hex value.
- One shared material module (clay, bark with veins, glass, frame). Prompts say "use the bark material", not "make it glow".
- Prefer procedural over hand-made. Only the beetle is a real asset.
- The renders in `renders/` are our own work and can be committed and referenced in prompts.

## Planter grid proposals (concept v3)

Two directions for `concept/v3_planter-grid.md`, built as one live render: `renders/planter-grid.html`. Switches at the top select the style (cozy greenhouse or plant lab), the theme, and the branch graph overlay (G). Without `data-theme` the page follows the system setting. Screenshots: `planter-grid-cozy-day.jpg`, `-cozy-night.jpg`, `-lab-light.jpg`, `-lab-dark.jpg`.

Both share the layout: 3D stage, branch graph as an absolute overlay on the stage's left (the camera shifts right while it is open), sidebar with vitality and pots, docked terminal under the stage. The render is interactive: click pots, drag seed packets onto the empty pot, answer, restart and merge from the terminal. The waiting agent wilts in real time: rim pulse, droop at 15 s, wilted at 60 s. Status colours and agent colours are CSS tokens; the 3D scene reads the same tokens.

Agent colours: every agent has one colour from a fixed set of 8 per style and theme, picked with the swatches in the terminal header (taken colours are disabled). It shows as a thin band at the foot of the pot, a dot on the name tag, a square in the sidebar and terminal, and the branch colour in the graph. Status keeps the rim, the plant and the sidebar dot.

Garden map: a blueprint pinned to the back wall (cozy) or a small plate on a stand at the front right of the bench (lab). It shows one circle per pot in its agent colour, dashed for the empty pot. Clicking it opens or closes the branch graph, like G and the toolbar button.

The branch graph in the render is drawn by hand to look like `commit-graph` output. Branches use the agent colour; a small dot in the branch label shows status. With the real package, agent colours per branch need an adapter (it colours by lane index) and dark mode needs override CSS. Details in v3.

### proposal-cozy-04: cozy greenhouse, day and night

Terracotta pots on a wooden potting bench inside a white-framed greenhouse, foliage outside. Day is sunlit, night has string lights and glowing rims. Every status has its own colour.

| Meaning | Day | Night |
|---|---|---|
| Working (sprout, watering can) | green `#4f9a45` | `#7cc96b` |
| Waiting (rim pulse, wilt) | yellow `#d99a1e` | `#f5bd3c` |
| Error (grey plant, red rim) | red `#c9442f` | `#ff6a50` |
| Ready for review (bud) | teal `#2f9c8f` | `#4fd1bf` |
| Merged (bloom) | pink `#c2458e` | `#ff6fc0` |
| `main` in the graph | brown `#7b6a52` | `#b49a78` |
| Agent colours (8) | `#3f5f8f` `#5f9cc0` `#8a73b8` `#82466f` `#3a3530` `#9a8a4e` `#5b6876` `#4d4a7a` | `#7d9fd0` `#8cc2e0` `#b39ee0` `#c27fae` `#e8dcc4` `#c9b77a` `#9aa8b6` `#8f8cc8` |
| Interface | paper `#f6f2e7` on sage `#dfe3d6`, ink `#2e2a22`, Nunito + JetBrains Mono, round corners | `#1f1b16` on `#12110e`, ink `#f1e6d2` |
| Matter | terracotta `#b8613a`, wood `#8d5c36`-`#9a6a42`, soil `#3b2a1e`, frame `#efe9dc` | same, frame `#6b6153` |
| Light and post | sun 2.6, hemisphere 1.0, no Bloom | moon 0.55, three warm point lights, string of bulbs, Bloom 0.55 / threshold 0.8 |

Character: friendly and readable at a glance, close to the brief's mockups. Five hues compete with the warm scene, so the status colours have to stay saturated.

### proposal-lab-05: plant lab, light and dark

Clay-02 carried over: off-white or charcoal clay, a ribbed glass vault, plants as clay stalks with bead tips. Colour only means something needs you (red) or an agent is working (amber); everything else is neutral.

| Meaning | Light | Dark |
|---|---|---|
| Working (amber tips, drone) | amber `#d98a00` | `#ffa000` |
| Waiting, error (red tips, stalks bend or collapse) | red `#e5261a` | `#ff4a3d` |
| Ready for review (pod) | ink `#2b2825` | bone `#e9e4dc` |
| Merged (open fins) | grey `#b9b3aa` | `#4a4744` |
| `main` in the graph | `#8f8981` | `#6f6b66` |
| Agent colours (8, greyed tones) | `#4f5d6b` `#7d90a5` `#6f8070` `#8a8466` `#8c7f9c` `#9a6f78` `#a89c88` `#3d3b39` | `#8a9aab` `#a6b8cc` `#a3b5a1` `#b5ae8e` `#b6a9c6` `#c79fa7` `#d8cdb9` `#cfd6d0` |
| Interface | clay-02 frosted glass, ink `#141210`, IBM Plex Mono, uppercase labels | clay-02 smoked glass, ink `#eeebe5` |
| Matter | clay-02 light tones | clay-02 tones darkened to `#1a1a1d`-`#34322f` (×0.035 was too dark for pots) |
| Light and post | clay-02 light values, no Bloom | hemisphere 1.3, key 1.7, cool rim light from behind, Bloom 0.6 / threshold 0.82 |

Waiting and error share red. They differ by shape (bent vs collapsed stalks) and by the sidebar marker (pulsing dot vs diamond). The agent colours are greyed so red stays the only strong colour.

Character: calm, precise, a specimen under study. Red is rare, so a waiting agent stands out more than in cozy-04. Georgios's preference.

### Scope

Person-days for the scene and interface look, on top of the planter grid logic in the weekly plan. The team has about 60 person-days.

| Work | cozy-04 | lab-05 |
|---|---|---|
| Environment (bench, greenhouse or vault, sky) | 1.5 | 1 |
| Pots, five plant states, wilt stages | 2.5 | 2 (one stalk function covers all states) |
| Watering can or drone, drops | 0.5 | 0.5 |
| Light and dark theme | 1 (two light setups, string lights) | 0.5 (colour table swap, as in clay-02) |
| Interface theme (sidebar, terminal, tags, packets) | 1 | 0.5 (clay-02 panels exist) |
| Branch graph overlay, colour adapter, dark CSS | 1.5-2.5 | 1.5-2.5 |
| Garden map object | 0.5 | 0.5 |
| Agent colours (palette, band, tag dot, picker) | 0.5-1 | 0.5-1 |
| **Total** | **9-10.5 days, ~16 %** | **7-8.5 days, ~13 %** |

Both fit the 15-20 % aesthetics budget. Cut first: the second theme, foliage and shelf (cozy), the vault (lab), the drops.

## Earlier exploration

Kept for context; superseded by the proposals above.

- Three image directions (bioluminescent tank, specimen lab, neon reef) and image-generator prompts. Generated images were not convincing; the team switched to rendering the scenes directly.
