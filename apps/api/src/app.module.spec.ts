import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { RepoConfig } from "./config/repo-config";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo } from "../test/git-repo";

//
//
//
describe("AppModule", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "gitspore-app-"));
    await initRepo(repo);
  });

  afterEach(() => rm(repo, { recursive: true, force: true }));

  it("compiles", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RepoConfig)
      .useValue(new RepoConfig(repo, "main"))
      .compile();

    expect(moduleRef.get(AppModule)).toBeInstanceOf(AppModule);
  });
});
