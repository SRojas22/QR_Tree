import { describe, expect, it } from "vitest";
import { KINDS } from "../src/looks";
import { grow, rng } from "../src/trees";

describe("grow", () => {
  it.each(KINDS)("gives a %s exactly the leaves asked for", (kind) => {
    const tree = grow(kind, rng(7), 33, 1200);
    expect(tree.leaves).toHaveLength(1200);
    expect(tree.limbs.length).toBeGreaterThan(0);
    expect(tree.top).toBeGreaterThan(0);
  });

  it("grows the same tree from the same seed", () => {
    const a = grow("jacaranda", rng(42), 33, 400);
    const b = grow("jacaranda", rng(42), 33, 400);
    expect(a.leaves.map((l) => l.p.toArray())).toEqual(b.leaves.map((l) => l.p.toArray()));
  });
});
