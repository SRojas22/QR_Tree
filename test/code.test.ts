import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { cellCenter, encode, QUIET } from "../src/code";

// Paints the modules as a bitmap (quiet zone included) and reads it back.
function decode(text: string) {
  const code = encode(text);
  const px = 8;
  const side = code.span * px;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (const [col, row] of code.cells)
    for (let y = 0; y < px; y++)
      for (let x = 0; x < px; x++) {
        const i = (((row + QUIET) * px + y) * side + (col + QUIET) * px + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
  return jsQR(data, side, side)?.data;
}

describe("encode", () => {
  it.each(["https://github.com/SRojas22/QR_Tree", "mailto:hello@example.com", "tel:+15555550100"])("reads back %s", (text) => {
    expect(decode(text)).toBe(text);
  });

  it("adds the quiet zone to the span", () => {
    const code = encode("hi");
    expect(code.span).toBe(code.size + QUIET * 2);
  });

  it("centres the code on the origin", () => {
    const code = encode("hi");
    const a = cellCenter(code, 0, 0);
    const b = cellCenter(code, code.size - 1, code.size - 1);
    expect(a.x + b.x).toBeCloseTo(0);
    expect(a.z + b.z).toBeCloseTo(0);
  });
});
