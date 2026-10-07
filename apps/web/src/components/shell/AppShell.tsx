"use client";

const HOTBAR_SLOTS = ["1", "2", "3", "4", "5", "6"];

export default function AppShell() {
	return (
		// pointer-events-none lets clicks on empty areas reach the scene
		<div className="app-shell pointer-events-none fixed inset-0 z-10">
			<header className="pointer-events-auto rounded-md bg-sky-500/30 p-2 text-white text-lg [grid-area:topbar]">
				top bar
			</header>

			<nav className="pointer-events-auto rounded-md bg-amber-500/30 p-2 text-white text-lg [grid-area:rail]">
				rail
			</nav>

			{/* main stays click-through; only the blocks inside it catch clicks */}
			<section className="relative rounded-md border-2 border-dashed border-white/40 p-2 text-white text-lg [grid-area:main]">
				main

				{/* Hotbar: bottom centre of the main area (ADR 0005) */}
				<div className="hotbar pointer-events-auto absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-xl bg-violet-500/30 p-1.5">
					{HOTBAR_SLOTS.map((key) => (
						<div key={key} className="hotbar-slot grid place-items-center rounded-lg bg-white/30 font-mono">
							{key}
						</div>
					))}
					{/* Separator before the overview slot */}
					<div className="h-10 w-0.5 bg-white/50" />
					<div className="hotbar-slot grid place-items-center rounded-lg bg-white/30 font-mono">0</div>
				</div>

				{/* Notification corner: Sonner will place real cards here later */}
				<div className="pointer-events-auto absolute right-0 bottom-0 rounded-md bg-rose-500/30 p-2 text-xs">
					notifications
				</div>
			</section>

			<aside className="pointer-events-auto rounded-md bg-emerald-500/30 p-2 text-white text-lg [grid-area:panel]">
				side panel
			</aside>
		</div>
	);
}
