---
name: tokens-update
description: Copy the design tokens and typographies from Penpot (gitspore_v01) into apps/web/src/theme/tokens.json and typography.json, regenerate the theme files with npm run tokens, and check the diff. Use after a token or typography changed in Penpot, or when asked to sync, dump or update the tokens.
---

# Update the tokens from Penpot

Penpot is the source; `apps/web/src/theme/tokens.json` and `typography.json` are exact copies; everything else is generated ([ADR 0008](../../../design-docs/decisions/0008-generated-theme-files.md)). Never sync from the repo back into Penpot, and never edit `tokens.css`, `tailwind.css`, `tokens.ts` or `design-docs/design/tokens.html` by hand.

## Before you start

- The Penpot MCP server must be connected, with `gitspore_v01` open (`design-docs/design/penpot.md`, "Every session"). If the Penpot tools are missing, stop and tell the user.
- Read the Penpot high-level overview once per session before calling `execute_code`.
- Work on a ticket branch, not `main`.

## The four sets

`tokens.json` has four sets ([ADR 0010](../../../design-docs/decisions/0010-token-layers-and-base-scales.md)): `cozy-06/base` (palette, spacing, size, radius and opacity scales), `cozy-06/shared` (both modes), `cozy-06/day` and `cozy-06/night`. The dump below loops over all sets, so a new set comes along.

- Raw values only in base and the content groups (`color.agent.*`, `color.art.*`, `color.xterm.*`), plus `shadow.*`, `border.*`, `font.*`, `size.panel-width`, `size.terminal-min-width` and `space.focus-offset`. Every other token points into base. `npm run tokens` fails otherwise; fix the token in Penpot.
- When a shape needs a spacing, size or radius, bind a base token (`space.4`, `size.10`, `radius.lg`), not a new component token. A component token is only for a handle code or a layout rule needs.

## 1. Dump from Penpot

Run this with `mcp__penpot__execute_code`. It returns `tokens.json` and `typography.json` in the repo format:

```js
const cat = penpot.library.local.tokens;
const nest = (tokens) => {
  const root = {};
  for (const t of tokens) {
    const parts = t.name.split(".");
    let node = root;
    for (const p of parts.slice(0, -1)) node = node[p] ??= {};
    node[parts.at(-1)] = { $value: t.value, $type: t.type };
  }
  return root;
};
const tokens = {};
for (const s of cat.sets) tokens[s.name] = nest(s.tokens);
tokens.$themes = cat.themes.map((t) => ({
  name: t.name,
  group: t.group,
  selectedTokenSets: Object.fromEntries(
    t.activeSets.map((s) => [s.name, "enabled"]),
  ),
}));
tokens.$metadata = {
  tokenSetOrder: cat.sets.map((s) => s.name),
  activeThemes: ["mode/day"],
};
const fam = { Fredoka: "title", Figtree: "ui", "JetBrains Mono": "mono" };
const typography = {
  $description:
    "Penpot library typographies of gitspore_v01 (not tokens in Penpot). Sizes and letter spacing in px, line height unitless.",
};
for (const t of penpot.library.local.typographies) {
  (typography[t.path] ??= {})[t.name] = {
    fontFamily: `{font.${fam[t.fontFamily]}}`,
    fontSize: Number(t.fontSize),
    fontWeight: Number(t.fontWeight),
    lineHeight: Number(t.lineHeight),
    letterSpacing: Number(t.letterSpacing),
    textTransform: t.textTransform || "none",
  };
}
return {
  tokens,
  typography,
  unknownFonts: penpot.library.local.typographies
    .filter((t) => !fam[t.fontFamily])
    .map((t) => t.fontFamily),
};
```

If `unknownFonts` is not empty, a typography uses a new font: add it to `fam` above and to `FONT_STACKS` in `apps/web/scripts/tokens.mjs`, and tell the user next/font in `layout.tsx` needs it too.

## 2. Write and generate

1. Write `tokens` to `apps/web/src/theme/tokens.json` and `typography` to `apps/web/src/theme/typography.json`.
2. `npx prettier --write apps/web/src/theme/*.json`
3. `npm run tokens`

The script fails on an unknown reference, a reference cycle, math in a value, a Tailwind name clash, a raw value outside base and the content groups, or an alpha colour off the opacity steps (10, 20, 35, 50 %). Fix the token in Penpot, not in the JSON.

## 3. Check

- `git diff apps/web/src/theme/tokens.json apps/web/src/theme/typography.json` shows exactly the change the user made in Penpot, nothing else. Key order may move if a token was deleted and re-added; values must not change unexpectedly. If the diff has changes nobody asked for, show them to the user before going on.
- `npm run tokens:check`, `npx prettier --check .`, `npm run typecheck --workspace @gitspore/web`.
- Mention which tokens changed and that the user can look at `design-docs/design/tokens.html`.
- A new token group or a renamed token may need an edit in `design-docs/design/components.md` (Layers, Names, Groups) and in the components that use it.

Commit the JSON and the generated files together, only when the user asks.

## Penpot gotchas

- Ask before changing tokens, typographies or components in Penpot; they belong to the whole file.
- Writing back the same value does not unbind a token from a shape; change the value, then set it back.
- `applyTypography` on a text removes its fill token; re-apply the colour token afterwards.
- Leave `mode/day` active when you finish.
