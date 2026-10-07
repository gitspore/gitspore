# Aesthetics

Visual direction for gitspore. Based on `references.md`, the Pinterest boards listed there, and the render studies in `renders/`. The first brief and the terrarium proposals (bark-01, clay-02, vine-03) are archived in `archive/research/inspiration/aesthetics-terrarium-proposals.md`.

## Current

proposal-cozy-06 (below) is the proposed direction, not agreed by the team yet. Its files:

- `renders/planter-grid-layout.html`: the 3D prototype of the layout. cozy-06 by default, lab-05 in its style switch.
- `renders/cozy-06-minimal.html`: the interface study.
- `concept/v3_layout-slides/`: screenshots of the prototype.

Everything older is in `archive/research/inspiration/`: the terrarium proposals bark-01, clay-02 and vine-03, the first planter grid mockup with cozy-04 and lab-05 (`renders/planter-grid.html` there), and the proposal catalogue `proposals.html`. Kept for documentation and the portfolio, not to build from. cozy-04 and lab-05 stay described below, because cozy-06 takes its scene values from cozy-04 and the prototype still has lab-05.

## Planter grid proposals (concept v3)

Two directions for `concept/v3_planter-grid.md`, built as one live render: `archive/research/inspiration/renders/planter-grid.html` (archived). Switches at the top select the style (cozy greenhouse or plant lab), the theme, and the branch graph overlay (G). Without `data-theme` the page follows the system setting. Screenshots: `planter-grid-cozy-day.jpg`, `-cozy-night.jpg`, `-lab-light.jpg`, `-lab-dark.jpg`.

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

Character: calm, precise, a specimen under study. Red is rare, so a waiting agent stands out more than in cozy-04. Georgios's preference until cozy-06.

### proposal-cozy-06: cozy minimal, day and night

Georgios's pick on 2026-10-07, replacing his earlier preference for lab-05. Not agreed by the team yet. Record: `records/2026-10-07_cozy-minimal-proposal.md`.

The cozy-04 greenhouse scene with a quieter interface: no frames, no double lines, squarish corners, the beetle as logo. The playful part is shape and motion (plants in circles, a wiggling plant, a bobbing hotbar slot). Status takes lab-05's rule that red means "needs you" and keeps cozy colours for the other states.

- Interface study: `renders/cozy-06-minimal.html` (sections Minimal, The mark, Other ways to show status; the Enamel section is the rejected variant). Every stage is a 1440 × 900 screen of state S01.
- The 3D scene in that study is a flat placeholder. The scene is cozy-04's (`renders/planter-grid-layout.html`; first in the archived `planter-grid.html`) with the changes listed below.

**Logo.** The agent beetle seen from above. The seam between the wing cases is a lens: one line that splits and joins again, a branch and its merge. Shell, head, four legs, one leaf; nothing else, so it reads at 16 px. On the plate it is one colour plus the seam.

```svg
<svg viewBox="0 0 32 32"><!-- BODY, SEAM, SEP (= background behind the head), LEAF -->
  <path d="M7.5 15.5 L4 13.5 M7 22.5 L3.5 24 M24.5 15.5 L28 13.5 M25 22.5 L28.5 24" stroke="BODY" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <ellipse cx="16" cy="19.5" rx="9.5" ry="10.5" fill="BODY"/>
  <ellipse cx="16" cy="7.4" rx="4.3" ry="3.4" fill="BODY" stroke="SEP" stroke-width="1.6"/>
  <path d="M17 4.4 C18 1.8 21.4 .9 24.4 1.7 C22.7 4.1 20 5.2 17 4.4Z" fill="LEAF"/>
  <path d="M16 11.6 C12.4 15 12.4 23.6 16 27.6 C19.6 23.6 19.6 15 16 11.6Z" fill="SEAM"/>
</svg>
```

| Use | Day | Night |
|---|---|---|
| On the plate (logo, app icon, favicon) | plate `#2f5446`, body `#f6eedb`, seam = plate, leaf `#8fd07a` | same, seam `#ffc45e` with a soft blur copy behind it (glow) |
| Without plate | body `#b8613a`, seam and sep = background, leaf `#4f9a45` | body `#7a4a2c`, seam `#ffd27a` with glow, leaf `#7cc96b` |
| Plate corner radius | 25 % of the plate size (8 px at 32 px, 22 px at 96 px) | |

Wordmark "gitspore", always lowercase, Fredoka 600, next to the plate.

**Type.**

| Font | Use |
|---|---|
| Fredoka 600 | logo, panel titles ("Your pots"), notification titles |
| Figtree 400–800 | everything else in the interface |
| JetBrains Mono | terminal, timers, hotbar key numbers |

**Colours.** Interface tokens, the same names in both modes. The scene keeps cozy-04's matter (terracotta, wood, soil, frame) and light setups.

| Token | Day | Night | Where |
|---|---|---|---|
| `panel` / `panel-2` | `#ece6d6` / `#ddd4bf` | `#1d2621` / `#26332c` | side panel, terminal header, hotbar / segmented tab track, hotbar slots |
| `ink` / `muted` | `#2a2119` / `#6b5a44` | `#f3e7cf` / `#bba98b` | text |
| `line` | `#2f5446` | `#9cc2ad` | 2 px lines: under the terminal header, around the terminal card, hotbar separator |
| `plate` / `plate-ink` | `#2f5446` / `#f6eedb` | `#2f5446` / `#f3ead6` | logo plate, rail bookmarks, active tab |
| `accent` | `#e8b04a` | `#e8b04a` | open bookmark, selected hotbar slot, primary button |
| `hover` | `rgba(47,84,70,.08)` | `rgba(156,194,173,.08)` | hover, odd rows, icon buttons |
| `wait` / `wait-ink` | `#b3372a` / `#fff3e8` | `#c4402f` / `#fff3e8` | the waiting row, wait badge, notification, waiting hotbar slot |
| sky | `#f6ead1` → `#e2c796` | `#2a3047` → `#12151f` | behind the scene |
| terminal | light (`#fbf7ec` on `#2a2119`) | dark (`#171916` on `#e4e0d4`) | sun/moon switch per window overrides it |

**Agent colours.** Proposed 2026-10-07, not agreed. Eight per mode, all cool hues plus an ink and an umber, so none reads as a status. Checked in CIELAB: every pair is at least 22 ΔE apart, every colour at least 25 ΔE from the five status colours.

| Slot | Day | Night |
|---|---|---|
| 1 blue | `#2f6db3` | `#4f86de` |
| 2 sky | `#7ab6e6` | `#a9d6f5` |
| 3 navy | `#1c2a55` | `#2f3f8f` |
| 4 teal | `#168a8f` | `#3fc1c4` |
| 5 violet | `#6a4cc2` | `#8d6ff0` |
| 6 lavender | `#b7a3e6` | `#d6c8fa` |
| 7 ink | `#2b2622` | `#f1ebe0` |
| 8 umber | `#6b4a2e` | `#b88a62` |

With green, red, grey, yellow and pink taken, the eight lean on blue and violet. Neighbours like sky and lavender differ more by lightness than by hue.

**Status.** Five states. Each one has a plant, a colour, a word, a growth stage and a shape, so none depends on colour alone.

| State | Plant | Colour day / night | Word | Growth track (5 squares) | Shape |
|---|---|---|---|---|---|
| Working | sprout with two leaves | `#4f9a45` / `#7cc96b` | growing | 3 filled | circle |
| Waiting for you | drooping, yellowed | `wait` (row fill), glyphs `#b3372a` / `#ff6a50` | timer instead of a word | 3 filled, the third blinks | triangle |
| Error | grey bare stalk | `#8a8277` / `#9a948a` | wilted | 3 filled, grey | cross |
| Ready for review | closed yellow bud | `#d99a1e` / `#f5bd3c` | review | 4 filled | diamond |
| Merged | pink bloom | `#c2458e` / `#ff6fc0` | merged | 5 filled | five-dot flower |
| Empty pot | none, dashed circle | `muted` | pick an issue | none | dashed circle |

Changed from cozy-04: waiting is red instead of yellow, error is grey instead of red, review is yellow instead of teal, and review (bud) and merged (bloom) are separate states.

Where status shows:

- Side panel row: plant in a 38 px circle filled with the agent colour at 33 % opacity, name, word in `muted` (error in its colour), growth track. The waiting row is 76 px high, filled `wait`, with the timer in place of the word; its plant wiggles.
- Hotbar slot: the plant, the shape marker top right, the agent colour as a 4 px band at the bottom. The waiting slot is filled `wait`, shows the seconds and bobs.
- Top bar: "1 WAITING" badge in `wait`, uppercase, square dot blinking.
- Scene: the pot rim takes the status colour (waiting pulses), the plant shows the state. The pot's name tag gets the shape marker next to the agent colour dot.

The study compares four more options (plant tag, water gauge, pot rim, beetle pose). They are not part of this proposal.

**Shapes and sizes.**

| Element | Value |
|---|---|
| Side panel | 400 px, radius 12, soft shadow, no border |
| Tabs | segmented: track `panel-2` radius 8, tab radius 5, active tab `plate` |
| Rows | 52 px, radius 8; waiting row 76 px, radius 10 |
| Badges, small tags | radius 2–5 |
| Buttons | 40 px high, radius 6; icon buttons 36 px, radius 7, `hover` fill, no border |
| Terminal | a card: radius 12, 2 px `line` outline, header 42 px in `panel` with a 2 px `line` underneath; window buttons 32 px, radius 6 |
| Hotbar | `panel`, radius 14, slots 68 × 68 in `panel-2`, radius 10 |
| Rail bookmarks | 58 × 52 (open: 72), radius `0 9 9 0`, `plate`, open one `accent` |
| Notification | `wait`, radius 10, nudges sideways every 2.4 s |

Motion: wiggle (waiting plant), bob (waiting slot), blink (current growth square, wait dot), nudge (notification). All off with `prefers-reduced-motion`.

**Open.**

- Agent colours. The study uses five ad-hoc colours; two of them (amber, pink) are close to the review and merged colours. A set of 8 is proposed above; it needs the team's yes.
- Whether "merged" stays in the pot list or the pot empties on merge.
- Fredoka at small sizes in the scene's name tags, or Figtree there.

**Scope.** About cozy-04's 9–10.5 person-days. The interface is cheaper (no frames, about 0.5 days instead of 1); the bud state and the shape markers add about 0.5 days.

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

## Keeping it promptable

- The colour tables above are the tokens. Code reads them from one theme file; prompts name the meaning ("data colour", "issue colour"), not a hex value.
- One shared material module (clay, bark with veins, glass, frame). Prompts say "use the bark material", not "make it glow".
- Prefer procedural over hand-made. Only the beetle is a real asset.
- The renders in `renders/` and in the archive are our own work and can be committed and referenced in prompts.
