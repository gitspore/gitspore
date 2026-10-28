import { renderToStaticMarkup } from "react-dom/server";
import { STATUS_PLANT } from "@/lib/status";
import { Plant, type PlantKind } from "./Plant";

const KINDS: PlantKind[] = [
  "working",
  "waiting",
  "wilted",
  "review",
  "merged",
  "empty",
];
const POT_RIM = 'x="8.8"';

describe("Plant", () => {
  it("draws every kind differently", () => {
    const drawings = KINDS.map((kind) =>
      renderToStaticMarkup(<Plant kind={kind} />),
    );
    expect(new Set(drawings).size).toBe(KINDS.length);
  });

  it("draws the pot unless told not to", () => {
    expect(renderToStaticMarkup(<Plant kind="working" />)).toContain(POT_RIM);
    expect(
      renderToStaticMarkup(<Plant kind="working" pot={false} />),
    ).not.toContain(POT_RIM);
  });

  it("draws only the pot when empty", () => {
    const markup = renderToStaticMarkup(<Plant kind="empty" />);
    expect(markup).toContain("--color-art-pot-empty");
    expect(markup).not.toContain("--color-art-plant");
  });

  it("wiggles only when asked", () => {
    expect(renderToStaticMarkup(<Plant kind="waiting" />)).not.toContain(
      "animate-wiggle",
    );
    expect(renderToStaticMarkup(<Plant kind="waiting" wiggle />)).toContain(
      "motion-safe:animate-wiggle",
    );
  });
});

describe("STATUS_PLANT", () => {
  it("gives the starting agent the sprout, its pot is taken", () => {
    expect(STATUS_PLANT.starting).toBe("working");
  });

  it("gives every other status its own plant", () => {
    const others = Object.entries(STATUS_PLANT).filter(
      ([status]) => status !== "starting",
    );
    expect(new Set(others.map(([, kind]) => kind)).size).toBe(5);
  });
});
