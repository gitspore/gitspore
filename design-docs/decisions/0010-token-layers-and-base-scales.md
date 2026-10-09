# 0010: Token layers, base scales and units

- Status: proposed
- Date: 2026-10-09

## Context

By 2026-10-09 the Penpot file had 316 tokens. Spacing had 44 tokens with 15 values, radius 17 with 9, and 125 colours were raw hex. Values were measured per component (top bar padding 16 left, 20 right), so the same 8 px existed under 11 names and nothing told a designer which value to pick next. ADR 0008 recorded this as "spacing tokens are named per component … they don't follow a scale".

## Decision

- Three layers. `cozy-06/base` holds the only raw interface values: the palette, spacing, size, radius and opacity scales. Semantic tokens point into base; day and night differ only in which base token they point to. Component tokens exist only where code or a layout rule needs a handle, and point into base too.
- Base names follow Tailwind: `space.N` and `size.N` = N × 4 px, radius `xs sm lg xl 2xl full`, opacity in percent. Spacing 4 8 12 16 24; radius 2 4 8 12 16; opacity 10 20 35 50.
- Content palettes keep raw values in their own groups: `color.agent.*`, `color.art.*` (plant, pot, logo), `color.xterm.light/dark.*`. Interface tokens never point into them.
- Only interface colours get Tailwind classes.
- CSS uses rem for spacing, sizes, radii and font sizes, em for letter-spacing, px for borders, shadows and the terminal.
- Exceptions with their reasons: `size.terminal-min-width` (computed from 80 columns), `size.panel-width` (layout limit), `space.focus-offset` (ring geometry), `mono/terminal` 13 px, `border.*` and `shadow.*` without a base layer.

## Alternatives

- T-shirt names for spacing and size. In Tailwind v4 `max-w-*` and `w-*` read `--spacing-*` first, so `--spacing-sm` breaks shadcn's `max-w-sm`.
- No palette layer: semantic tokens hold the hex. 35 fewer tokens, but nothing stops near-duplicates; six pairs had already crept in.
- Keep per-component tokens and only round the values. Fewer changes, but the next component would get its own values again.

## Consequences

- Supersedes ADR 0008's bullet "Spacing tokens are named per component … they don't follow a scale". The rest of ADR 0008 stands.
- 194 token entries instead of 316; Tailwind's colour autocomplete shows 20 colours instead of 136.
- `npm run tokens` fails on a raw value outside base and the content groups.
- Padding, margin and gap in Penpot bind `space.N`; a new value needs a reason or a new step.
