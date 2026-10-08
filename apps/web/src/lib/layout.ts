import type { CSSProperties } from "react";

export type SidePanelTab = "agents" | "issues" | "branches";
export type MainMode = "scene" | "focus";
export type OpenWindow = { agentId: string; minimised: boolean };

// The three settings that make every layout state (ADR 0003)
export type LayoutSettings = {
	sidePanel: SidePanelTab | null;
	mode: MainMode;
	windows: OpenWindow[];
};

// Outer grid: the panel column exists only while the panel is open
export function shellGrid({ sidePanel }: LayoutSettings): CSSProperties {
	if (sidePanel === null) {
		return {
			gridTemplateColumns: "var(--size-bookmark-width) 1fr",
			gridTemplateAreas: `"topbar topbar" "rail main"`,
		};
	}
	return {
		gridTemplateColumns: "var(--size-bookmark-width) 1fr var(--size-panel-width)",
		gridTemplateAreas: `"topbar topbar topbar" "rail main panel"`,
	};
}

// Inner grid of the main area: scene space, terminal windows, hotbar
export function mainGrid({ mode, windows }: LayoutSettings): CSSProperties {
	const visible = windows.filter((w) => !w.minimised).length;

	// No visible window: the scene gets the whole main area
	if (visible === 0) {
		return { gridTemplateRows: "1fr auto", gridTemplateAreas: `"scene" "hotbar"` };
	}
	// Focus mode: windows cover the main area
	if (mode === "focus") {
		return { gridTemplateRows: "1fr auto", gridTemplateAreas: `"windows" "hotbar"` };
	}
	// Scene mode: windows sit in a band at the bottom, the scene shows above
	return {
		gridTemplateRows: "1fr var(--size-terminal-band) auto",
		gridTemplateAreas: `"scene" "windows" "hotbar"`,
	};
}
