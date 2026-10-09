import { loadRepoConfig } from "./load-repo-config";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

//
//
//

describe("loadRepoConfig", () => {
  it("refuses to start when GITSPORE_REPO is not set", async () => {
    await expect(loadRepoConfig({})).rejects.toThrow("GITSPORE_REPO");
  });

  it("refuses a path that does not exist", async () => {
    const missing = join(tmpdir(), `gitspore-missing-${randomUUID()}`);

    await expect(loadRepoConfig({ GITSPORE_REPO: missing })).rejects.toThrow(
      missing,
    );
  });
});
