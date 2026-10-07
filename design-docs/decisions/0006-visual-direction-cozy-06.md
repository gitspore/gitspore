# 0006: Visual direction cozy-06

- Status: proposed
- Date: 2026-10-07

## Context

Two directions were built for the planter grid: cozy-04 (a warm greenhouse, day and night) and lab-05 (a clean plant lab). Interface studies showed that framed, decorated panels look generic and take space from the terminals.

## Decision

- The cozy greenhouse scene with a quiet interface: no frames, no double lines, squarish corners. The playful part is shape and motion (plants in circles, a wiggling waiting plant, a bobbing hotbar slot).
- Red means only "needs you". Error is grey, review a yellow bud, merged a pink bloom. Each state also has a word, a growth stage and a shape.
- The beetle is the logo. Fredoka for logo and titles, Figtree for the interface, JetBrains Mono for the terminal.
- The terminal is light by day and dark at night, switchable per window.
- Eight agent colours per mode, all clear of the status colours.
- Values and components: [components.md](../design/components.md).

## Alternatives

- lab-05. Clean and cheaper (about 7–8.5 person-days instead of 9–10.5), but colder.
- cozy-04 with framed panels (paper, wood, enamel, a beige monitor around the terminal). Original, but busy, and the frames cost terminal space.

## Consequences

- The prototype keeps lab-05 as a second style in its settings, for comparison only.
- Name tags in the scene may need Figtree instead of Fredoka at small sizes.
