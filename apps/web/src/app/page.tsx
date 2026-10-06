import Scene from "@/components/Scene";
import { Button } from "@/components/ui/button";

// page.js stays a Server Component; only <Scene> runs in the browser.
export default function Home() {
	return (
		<main style={{ width: "100vw", height: "100vh" }}>
			<Button>
				<span>Toggle theme</span>
			</Button>
			<Scene />
		</main>
	);
}
