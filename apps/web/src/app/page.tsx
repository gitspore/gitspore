import Scene from "@/components/Scene";
import AppShell from "@/components/shell/AppShell";

// page.js stays a Server Component; only <Scene> runs in the browser.
export default function Home() {
	return (
		<main style={{ width: "100vw", height: "100vh" }}>

			<div className="fixed inset-0 z-0">
				<Scene />
			</div>

			{/* Interface layer on top of the scene */}
			<AppShell />
		</main>
	);
}
