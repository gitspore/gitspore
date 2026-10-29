import { measureCell } from "./font";

const FONT = { fontFamily: "monospace", fontSize: 10, lineHeight: 1 };
const ESTIMATE = { width: 6, height: 12 };

// Jest runs without a browser: a document whose canvas gives these metrics
function withCanvas(metrics: Partial<TextMetrics> | null) {
  const context = metrics && { font: "", measureText: () => metrics };
  globalThis.document = {
    createElement: () => ({ getContext: () => context }),
  } as unknown as Document;
}

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

describe("measureCell", () => {
  it("measures the width of W and the font's height", () => {
    withCanvas({
      width: 9,
      fontBoundingBoxAscent: 14,
      fontBoundingBoxDescent: 3.5,
    });
    expect(measureCell(FONT)).toEqual({ width: 9, height: 18 });
  });

  it("estimates the cell without a 2D canvas", () => {
    withCanvas(null);
    expect(measureCell(FONT)).toEqual(ESTIMATE);
  });

  it("estimates what the browser can't measure", () => {
    withCanvas({ width: 0 });
    expect(measureCell(FONT)).toEqual(ESTIMATE);
  });
});
