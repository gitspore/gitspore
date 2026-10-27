"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import {
  saveSceneSettings,
  URL_FLAGS,
  useSceneSettings,
  type SceneOption,
  type SceneSettings,
} from "@/lib/sceneSettings";
import { selectAgents, selectRepo } from "@/lib/store/selectors";

// The settings in the side panel's place (#111): the repository and the
// scene options. Spec: GS-110 in Penpot (`settings`, `repo-card`,
// `settings-group`, `settings-row`, `section-heading`).

const SCENE_OPTIONS: {
  option: SceneOption;
  label: string;
  description?: string;
}[] = [
  { option: "shadows", label: "Shadows" },
  {
    option: "glow",
    label: "Glow",
    description: "The light around plants that need you",
  },
  {
    option: "cameraMotion",
    label: "Camera motion",
    description: "Drag to turn the camera around the table",
  },
  {
    option: "life",
    label: "Garden life",
    description: "Grass, flowers, insects and string lights around the table",
  },
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const repo = useGreenhouseStore(selectRepo);
  const agentCount = useGreenhouseStore(
    (s) => selectAgents(s).filter((a) => a.id !== "overview").length,
  );
  const openSetup = useGreenhouseStore((s) => s.openSetup);
  const { stored, flags, scene } = useSceneSettings();

  function change(next: Partial<SceneSettings>) {
    saveSceneSettings({ ...stored, ...next });
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-start justify-between px-1 pt-1">
        <h2 className="font-title text-title-panel">Settings</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-lg bg-hover hover:bg-ink/20 [&_svg]:size-5"
          aria-label="Close settings"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <Section title="Repository">
        <div className="flex items-center gap-3 rounded-xl bg-panel-2 p-3">
          <div className="min-w-0 flex-1">
            {repo ? (
              <>
                <p className="font-mono text-mono-terminal break-all">
                  {repo.path}
                </p>
                <p className="mt-2 text-ui-meta text-muted-foreground">
                  base {repo.baseBranch} · {agentCount}{" "}
                  {agentCount === 1 ? "plant agent" : "plant agents"} running
                </p>
              </>
            ) : (
              <p className="text-ui-meta text-muted-foreground">
                No repository chosen
              </p>
            )}
          </div>
          {/* The setup screen shows the daemon's refusal while agents run */}
          <Button
            variant="ghost"
            className="h-10 bg-hover px-4 font-bold text-ink hover:bg-ink/20"
            onClick={openSetup}
          >
            Change…
          </Button>
        </div>
      </Section>

      <Section title="Scene">
        <div className="flex flex-col gap-1 rounded-xl bg-panel-2 py-1">
          <SettingsRow
            label="Low power"
            description="Shadows, glow, camera motion and garden life off. For laptops that stutter."
            checked={stored.lowPower}
            onChange={(lowPower) => change({ lowPower })}
          />
          {SCENE_OPTIONS.map(({ option, label, description }) => {
            const fromUrl = flags[option] !== undefined;
            return (
              <SettingsRow
                key={option}
                label={label}
                description={
                  fromUrl
                    ? `Set by ?${URL_FLAGS[option]} in the URL`
                    : description
                }
                // Shows what the scene draws: off in low power, the URL's value
                checked={scene[option]}
                disabled={fromUrl || stored.lowPower}
                onChange={(on) => change({ [option]: on })}
              />
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// `section-heading` above its card or group
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-3 pt-2 text-ui-row">{title}</h3>
      {children}
    </section>
  );
}

// `settings-row`: label and description left, switch right. The label
// wraps the row, so a click on the text flips the switch too
function SettingsRow({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-4 px-3 py-2 has-data-disabled:opacity-50">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-ui-row">{label}</span>
        {description && (
          <span className="text-ui-meta text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={(on) => onChange(on)}
      />
    </label>
  );
}
