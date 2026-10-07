# 0002: A planter grid instead of a repo terrarium

- Status: proposed
- Date: 2026-10-06

## Context

The first concepts showed the whole repo as a terrarium: vines for branches, beetles for agents. With agents running in parallel (0001), the most useful question the scene can answer is narrower: which agent waits for me right now?

## Decision

- The scene is a greenhouse table with six pots. Each pot is one agent; its plant shows the agent's state and wilts while the agent waits.
- Open GitHub issues are seed packets. Planting one in a pot starts an agent on it.
- The repo moves to the side: a Branches tab with a commit graph, opened from a garden map object in the scene.
- A testable hypothesis: with gitspore, developers notice blocked agents faster than with terminal tabs. A user study in week 4 checks it.

## Alternatives

- The terrarium with vines and beetles. Richer picture of the repo, but it doesn't say who needs you.
- The branch graph as an overlay over the scene. Covered the pots; it became a side panel tab instead (0003).

## Consequences

- Tickets #12 (vines) and #13 (beetles) are superseded once the team agrees.
- At most six agents at once. More pots only if time is left.
