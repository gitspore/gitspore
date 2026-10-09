import { loadRepoConfig } from "@/config/load-repo-config";

describe("loadRepoConfig", () => {
  it("refuses to start when GITSPORE_REPO is not set", async () => {
    await expect(loadRepoConfig({})).rejects.toThrow("GITSPORE_REPO");
  });
});
