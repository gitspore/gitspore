"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "cn";

// shadcn's switch in the cozy-06 look (GS-110 `switch`): on is a plate track
// with a plate-ink thumb, off an outline in muted. Size 40 × 24: border 2,
// padding 2, so the 16 px thumb moves 16 px. Disabled has no look of its own;
// the row around it fades (SettingsPanel). Our color.muted is Tailwind's
// muted-foreground; Tailwind's muted is shadcn's, panel-2 (globals.css)
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border-2 p-0.5 transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-plate data-checked:bg-plate data-unchecked:border-muted-foreground data-unchecked:bg-transparent data-disabled:cursor-not-allowed motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full transition-transform data-checked:translate-x-4 data-checked:bg-plate-ink data-unchecked:bg-muted-foreground motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
