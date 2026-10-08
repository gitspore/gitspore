"use client";

// next-themes sets the class on <html>: "light" is day, "dark" is night.
// Sonner reads the same theme through useTheme().
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
	return <NextThemesProvider {...props} />;
}
