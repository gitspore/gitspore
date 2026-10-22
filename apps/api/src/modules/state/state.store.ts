import {
  applyPatch,
  GreenhouseState,
  PatchOp,
  RepoInfo,
  StatePatch,
} from "@gitspore/shared";
import { Injectable } from "@nestjs/common";

type PatchListener = (patch: StatePatch) => void;
type ResetListener = () => void;

@Injectable()
export class StateStore {
  private state: GreenhouseState = {
    version: 0,
    repo: null,
    agents: [],
    issues: [],
  };
  private readonly listeners: PatchListener[] = [];
  private readonly resetListeners: ResetListener[] = [];

  snapshot(): GreenhouseState {
    return structuredClone(this.state);
  }

  apply(ops: PatchOp[]): StatePatch | null {
    if (ops.length === 0) return null;

    const patch: StatePatch = { version: this.state.version + 1, ops };
    const result = applyPatch(this.state, patch);

    if (result.status !== "applied") {
      throw new Error(`State patch ${patch.version} was ${result.status}`);
    }

    this.state = result.state;

    for (const listener of this.listeners) listener(patch);

    return patch;
  }

  /**
   * Starts the state over for the repo gitspore works in: agents and issues
   * belonged to the old one. Patches can't say that, so reset listeners
   * hear about it and send a snapshot.
   */
  setRepo(repo: RepoInfo | null): void {
    this.state = {
      version: this.state.version + 1,
      repo,
      agents: [],
      issues: [],
    };
    for (const listener of this.resetListeners) listener();
  }

  onPatch(listener: PatchListener): void {
    this.listeners.push(listener);
  }

  onReset(listener: ResetListener): void {
    this.resetListeners.push(listener);
  }
}
