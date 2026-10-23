"use client";

import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { agentByKey, issueTitle } from "@/lib/store/selectors";
import { HotbarSlot } from "./HotbarSlot";

// The hotbar at the bottom centre of the main area (ADR 0005): the pots on
// keys 1–6, a separator, the overview on 0. Keys are in useHotbarKeys.

const POT_KEYS = [1, 2, 3, 4, 5, 6];

export function Hotbar() {
  return (
    <div
      role="toolbar"
      aria-label="Pots, keys 1 to 6, and the overview, key 0"
      className="flex items-center gap-2 rounded-2xl bg-panel px-3 py-2 text-ink shadow-lg"
    >
      {POT_KEYS.map((key) => (
        <Slot key={key} hotkey={key} />
      ))}
      <span aria-hidden className="h-14 w-0.5 bg-line" />
      <Slot hotkey={0} />
    </div>
  );
}

// One slot with its agent, window and selection from the store
function Slot({ hotkey }: { hotkey: number }) {
  const agent = useGreenhouseStore(agentByKey(hotkey)) ?? undefined;
  const title = useGreenhouseStore(issueTitle(agent?.issueNumber ?? null));
  const minimised = useGreenhouseStore(
    (s) =>
      s.layout.windows.find((w) => w.agentId === agent?.id)?.minimised ?? false,
  );
  // Outlined: the window the user works in, so only one slot at a time
  const focused = useGreenhouseStore(
    (s) => !!agent && s.focusedAgentId === agent.id,
  );
  const pressSlot = useGreenhouseStore((s) => s.pressSlot);

  return (
    <HotbarSlot
      hotkey={hotkey}
      agent={agent}
      issueTitle={title}
      selected={focused}
      minimised={minimised}
      onPress={(beside) => pressSlot(hotkey, { beside })}
    />
  );
}
