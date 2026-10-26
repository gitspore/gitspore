"use client";

import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";

// The gear in the top bar: opens the settings in the side panel's place,
// a second click closes them (#111).
export function SettingsButton() {
  const open = useGreenhouseStore((s) => s.layout.sidePanel === "settings");
  const setSidePanel = useGreenhouseStore((s) => s.setSidePanel);

  return (
    <Button
      variant="ghost"
      size="icon"
      // icon-button in components.md: size.9, radius.lg, color.hover fill
      className="size-9 rounded-lg bg-hover hover:bg-ink/20 [&_svg]:size-5"
      aria-label="Settings"
      aria-pressed={open}
      onClick={() => setSidePanel(open ? null : "settings")}
    >
      <SettingsIcon />
    </Button>
  );
}
