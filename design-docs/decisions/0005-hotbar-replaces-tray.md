# 0005: A hotbar replaces the tray of minimised windows

- Status: proposed
- Date: 2026-10-07

## Context

Minimised terminals were chips in a tray at the bottom left. The agents also appeared in the panel, the scene and the notifications. A row of slots on number keys is a pattern people know from games.

## Decision

- A hotbar at the bottom centre of the main area: slots 1–6 for the pots, slot 0 for the overview (0004).
- Each slot shows the plant, the status shape and the agent colour. Click opens the terminal; shift-click opens it beside the current one.
- A minimised window is a mark on its slot. There is no tray.
- The hotbar is MVP, because it takes over the tray's job.

## Alternatives

- Keep the tray. One more place for the same agents.
- Show slot 0 only while the overview window is open. A waiting overview with a closed window would have nowhere to turn red.

## Consequences

- Terminal tiles and the scene are 36 px shorter to make room.
- Minimise and close now differ only in whether the xterm instance stays alive. Whether we need both is open.
