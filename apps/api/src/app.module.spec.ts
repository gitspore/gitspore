import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { RepoConfig } from "./config/repo-config";

describe("AppModule", () => {
  it("compiles", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RepoConfig)
      .useValue(new RepoConfig("/repo", "main"))
      .compile();

    expect(moduleRef.get(AppModule)).toBeInstanceOf(AppModule);
  });
});
