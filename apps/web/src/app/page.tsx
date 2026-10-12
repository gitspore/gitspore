import AppShell from "@/components/shell/AppShell";

// page.tsx stays a Server Component. AppShell draws the scene and the
// interface on top of it.
export default function Home() {
  return (
    <main style={{ width: "100vw", height: "100vh" }}>
      <AppShell />
    </main>
  );
}
