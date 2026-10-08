"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

// Day/night switch. Moves into SettingsMenu (light, dark, system) later.
export default function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const isNight = resolvedTheme === "dark";

	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={isNight ? "Switch to day" : "Switch to night"}
			onClick={() => setTheme(isNight ? "light" : "dark")}
		>
			{/* Both icons render; CSS shows the right one, so server and client markup match */}
			<SunIcon className="dark:hidden" />
			<MoonIcon className="hidden dark:block" />
		</Button>
	);
}
