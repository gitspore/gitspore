import {
  applyPatch,
  GreenhouseState,
  PatchOp,
  StatePatch,
} from "@gitspore/shared";
import { Injectable } from "@nestjs/common";

type PatchListener = (patch: StatePatch) => void;

@Injectable()
export class StateStore {
  private state: GreenhouseState = { version: 0, agents: [], issues: [] };
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

  onPatch(listener: PatchListener): void {
    this.listeners.push(listener);
  }
}
