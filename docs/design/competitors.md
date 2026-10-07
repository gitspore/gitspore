# Competitors

Tools that already run several coding agents side by side. Taken from their websites and READMEs on 2026-10-07.

## At a glance

| | gitspore | Agent Office | Conductor | herdr | Paperclip |
|---|---|---|---|---|---|
| What it is | 3D greenhouse, one plant per agent | 3D cartoon office, one desk per agent | Mac app for parallel agents | Background server that owns agent terminals | Agents run as a company |
| Look | 3D scene + terminal windows | 3D office, 2D "lite" view | Native app | Terminal UI | Web app, like Linear |
| Agents | Claude Code | Claude Code, Codex, Cursor and 5 more | Claude Code, Codex, Cursor | 22, incl. Claude Code, Codex, Cursor | Any (Claude, Codex, Gemini, …) |
| One worktree per agent | yes | yes | yes | – | – |
| Shows "waiting for you" | wilting plant, red rim, timer | red beacon | – | "blocked" state | approvals, budget alerts |
| GitHub issues as tasks | seed packets | cork boards | – | – | own ticket system |
| Review and merge | bloom on merge | agents open and merge PRs | in-app review and merge | – | – |
| Multiplayer | no | yes (voice, shared terminals) | – | – | – |
| Runs | local daemon | local or own server | macOS | macOS, Linux, Windows, SSH | local or cloud |
| Licence | not set yet | MIT | – | Apache 2.0 | MIT |

– means their site doesn't say.

Links: [Agent Office](https://github.com/AgentSystemLabs/agent-office) · [Conductor](https://www.conductor.build/) · [herdr](https://herdr.dev/) · [Paperclip](https://paperclip.ing/)

## What each one means for us

- **Agent Office** is the closest. It has the same core loop as ours, also in 3D: issues on a board, one agent per worktree, a red signal when an agent waits. It was one of our first influences. It aims at teams in a shared office with voice. We aim at one developer and one question: who needs me now.
- **Conductor** has the same flow without a scene: parallel worktrees, then review and merge. Mac only.
- **herdr** does the job of our daemon (ADR 0001) and has almost our states. Its site shows no scene, issues or merge.
- **Paperclip** manages agents as staff with budgets and approvals. Cost per agent is an idea for the Agents tab later.

## Where gitspore differs

1. **Waiting is the whole design.** The plant gets worse the longer you leave an agent alone (0–15 s, 15–60 s, over 60 s). On their sites, the others show waiting as a flag that looks the same at 5 seconds and at 5 minutes.
2. **One developer, calm look.** No office, no avatars, no voice. One table you read in a second.
3. **Issue to merge in one place.** Seed packet, pot, plant, bloom. Only Agent Office covers the same path.

Risk: Agent Office supports more agents and is open source. Point 1 is what we have that it doesn't, and the user study in week 4 should test it.
