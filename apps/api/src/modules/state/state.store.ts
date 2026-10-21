import {
  applyPatch,
  GreenhouseState,
  PatchOp,
  RepoInfo,
  StatePatch,
} from "@gitspore/shared";
import { Injectable } from "@nestjs/common";

type PatchListener = (patch: StatePatch) => void;

@Injectable()
export class StateStore {
  private state: GreenhouseState = {
    version: 0,
    repo: null,
    agents: [],
    issues: [],
  };
  private readonly listeners: PatchListener[] = [];

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
   * Sets the repo gitspore works in. Patches don't carry the repo, so
   * clients see it in their next snapshot.
   */
  setRepo(repo: RepoInfo | null): void {
    this.state = { ...this.state, version: this.state.version + 1, repo };
  }

  onPatch(listener: PatchListener): void {
    this.listeners.push(listener);
  }
}
