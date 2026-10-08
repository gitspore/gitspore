// Status der CI/CD-Pipeline / Vitalität des Terrariums
export type BiomeVitality =
  "flourishing" | "stable" | "parasite_infected" | "critical";

// Ein aktiver Branch / Worktree (dargestellt als Ranke / Ast)
export interface BranchNode {
  id: string;
  name: string; // z. B. "feat/auth"
  isMain: boolean; // true = dicker Hauptstamm
  worktreePath?: string; // Lokaler Pfad auf SSD
  assignedAgentId?: string; // Welcher Käfer arbeitet hier?
  hasError: boolean; // Verdorrt der Ast?
}

// Ein GitHub Issue / Glitch (dargestellt als Spore / Parasit)
export interface ParasiteSpore {
  id: string;
  issueNumber: number;
  title: string;
  targetBranch: string;
  resolved: boolean;
}

// Der AI-Agent (Gärtner-Käfer)
export interface GardenerAgent {
  id: string;
  name: string; // z. B. "AGENT_CLAUDE_01"
  model: "claude-3-7-sonnet" | "claude-code" | "custom-cli";
  currentBranchId: string;
  positionOnBranch: number; // 0.0 (Wurzel) bis 1.0 (Astspitze) für 3D-Animation
  isWorking: boolean;
}

// Gesamtzustand eines Terrariums (Repository)
export interface TerrariumState {
  repoName: string;
  repoPath: string;
  vitality: BiomeVitality;
  branches: BranchNode[];
  agents: GardenerAgent[];
  spores: ParasiteSpore[];
}
