"use client";

import { PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { useReducer } from "react";
import { useMockClient } from "@/lib/client/GreenhouseClientProvider";
import { Button } from "../ui/button";

const SPEEDS = [1, 10, 60];

// Dev tool for the mock: which scenario runs, how fast, play/pause, restart.
// Shows nothing unless the app runs on the mock client.
export default function MockOverlay() {
  const client = useMockClient();
  // The client is not React state, so a click re-renders by hand.
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  if (!client) return null;

  const act = (action: () => void) => () => {
    action();
    refresh();
  };

  return (
    <div
      role="group"
      aria-label="Mock controls"
      className="pointer-events-auto fixed right-2 bottom-2 z-50 flex items-center gap-1 rounded-panel bg-panel p-1.5 text-xs text-ink"
    >
      <span className="px-1 font-mono">mock: {client.scenarioName}</span>

      {SPEEDS.map((speed) => (
        <Button
          key={speed}
          size="xs"
          variant={client.speed === speed ? "default" : "secondary"}
          onClick={act(() => client.setSpeed(speed))}
        >
          ×{speed}
        </Button>
      ))}
      {/* A speed from the URL that is not one of the buttons. */}
      {!SPEEDS.includes(client.speed) && (
        <span className="px-1 font-mono">×{client.speed}</span>
      )}

      <Button
        size="icon-xs"
        variant="secondary"
        aria-label={client.isPaused ? "Resume" : "Pause"}
        onClick={act(() =>
          client.isPaused ? client.resume() : client.pause(),
        )}
      >
        {client.isPaused ? <PlayIcon /> : <PauseIcon />}
      </Button>
      <Button
        size="icon-xs"
        variant="secondary"
        aria-label="Restart"
        onClick={act(() => client.restart())}
      >
        <RotateCcwIcon />
      </Button>
    </div>
  );
}
