import { PRODUCT_NAME, WS_EVENTS } from "@gitspore/shared";

describe("@gitspore/shared", () => {
  it("resolves from the API workspace", () => {
    expect(PRODUCT_NAME).toBe("GitSpore");
    expect(WS_EVENTS.TERMINAL_DATA).toBe("terminal:data");
  });
});
