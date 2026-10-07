# 0004: An overview agent, shown as a beetle

- Status: proposed
- Date: 2026-10-06, carving position changed 2026-10-07

## Context

Each plant shows one agent. Nothing answers "what have all of them done, and where is the whole thing going". Later, something may also coordinate the agents.

## Decision

- One more Claude Code session, started by the daemon in the repo root, without a pot. It reads `git log --all`, the worktrees' diffs and a status file the daemon writes.
- It opens as an ordinary terminal window, maximised, from hotbar slot 0, key `0`, or the carving.
- In the scene it is a beetle carved into the table top, between the seed packets. The carving is a decal with an emissive mask; its glow shows the overview's status. The table grows to make room.
- Read-only at first. Orchestration later through an MCP server on the daemon.
- Should-have. Decided at the end of week 2 whether it moves up.

## Alternatives

- Our own chat interface over the Claude API, in the side panel. Fits 400 px, but needs an API key, context assembly and streaming; a Claude Code terminal reuses what we build anyway.
- A beetle statue behind the pots. Needs a model and is often hidden from the camera; the carving is cheaper and always in view.

## Consequences

- Contracts and store allow an agent without a pot (`slot: null`) from day one, and windows refer to agents, not pots.
- Spawning (#16) must also start an agent in the repo root.
