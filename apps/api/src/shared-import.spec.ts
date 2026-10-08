import { BRANCH_PREFIX, MAX_SLOTS, PRODUCT_NAME } from "@gitspore/shared";

describe("@gitspore/shared", () => {
  it("resolves from the API workspace", () => {
    expect(PRODUCT_NAME).toBe("GitSpore");
    expect(MAX_SLOTS).toBe(6);
    expect(BRANCH_PREFIX).toBe("spore/");
  });
});
