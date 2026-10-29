"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";

// Day/night switch in the top bar.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const isNight = resolvedTheme === "dark";

  // Any change of day and night, by this switch or the system's setting,
  // brings every terminal window back to it (#55)
  const followDayAndNight = useGreenhouseStore((s) => s.followDayAndNight);
  useEffect(() => {
    followDayAndNight();
  }, [resolvedTheme, followDayAndNight]);

  return (
    <Button
      variant="ghost"
      size="icon"
      // icon-button in components.md: size.9, radius.lg, color.hover fill
      className="size-9 rounded-lg bg-hover hover:bg-ink/20 [&_svg]:size-5"
      aria-label="Switch between day and night"
      onClick={() => setTheme(isNight ? "light" : "dark")}
    >
      {/* Both icons render; CSS shows the right one, so server and client markup match */}
      <SunIcon className="dark:hidden" />
      <MoonIcon className="hidden dark:block" />
    </Button>
  );
}
