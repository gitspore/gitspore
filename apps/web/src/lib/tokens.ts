// cozy-06 colours for the 3D scene, which can't read CSS variables.
// Same names and values as src/app/tokens.css: change both together.
// Usage: new THREE.Color(tokens[mode].color.status.waiting)

export type Mode = "day" | "night";

// The same in both modes
const shared = {
	plant: {
		leaf: "#79c05a",
		stem: "#3f7a2c",
		"droop-leaf": "#c4b54e",
		"droop-stem": "#6d7a2c",
		bare: "#8a8277",
		bud: "#e8b04a",
		"bud-line": "#8a5b00",
		petal: "#f4a6c4",
		heart: "#ffd166",
	},
	pot: {
		clay: "#c8693d",
		line: "#5a2e15",
		empty: "#c88b62",
	},
};

export const tokens = {
	day: {
		color: {
			...shared,
			"sky-top": "#f6ead1",
			"sky-bottom": "#e2c796",
			muted: "#6b5a44",
			status: {
				working: "#4f9a45",
				waiting: "#b3372a",
				error: "#8a8277",
				review: "#d99a1e",
				merged: "#c2458e",
				empty: "#6b5a44",
			},
			agent: ["#2f6db3", "#7ab6e6", "#1c2a55", "#168a8f", "#6a4cc2", "#b7a3e6", "#2b2622", "#6b4a2e"],
		},
	},
	night: {
		color: {
			...shared,
			"sky-top": "#2a3047",
			"sky-bottom": "#12151f",
			muted: "#bba98b",
			status: {
				working: "#7cc96b",
				waiting: "#ff6a50",
				error: "#9a948a",
				review: "#f5bd3c",
				merged: "#ff6fc0",
				empty: "#bba98b",
			},
			agent: ["#4f86de", "#a9d6f5", "#2f3f8f", "#3fc1c4", "#8d6ff0", "#d6c8fa", "#f1ebe0", "#b88a62"],
		},
	},
} as const;

export type AgentStatus = keyof typeof tokens.day.color.status;

// Agent colours are numbered 1-8 in Penpot (color.agent.1); the array is 0-based
export function agentColor(mode: Mode, slot: number): string {
	return tokens[mode].color.agent[slot - 1];
}
