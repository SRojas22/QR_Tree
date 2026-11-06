import QRCode from "qrcode";

/** Clear modules kept around the code so scanners can lock on. */
export const QUIET = 4;

export type Code = {
  text: string;
  /** Modules per side, without the quiet zone. */
  size: number;
  /** Plot width in world units (1 module = 1 unit), quiet zone included. */
  span: number;
  /** Dark modules as [column, row]. */
  cells: [number, number][];
};

// Level H (30% redundancy) so the code still reads under the settling leaves.
export function encode(text: string): Code {
  const m = QRCode.create(text || " ", { errorCorrectionLevel: "H" }).modules;
  const cells: [number, number][] = [];
  for (let row = 0; row < m.size; row++) for (let col = 0; col < m.size; col++) if (m.get(row, col)) cells.push([col, row]);
  return { text, size: m.size, span: m.size + QUIET * 2, cells };
}

/** World position of a module, with the code centred on the origin. Rows run along +z. */
export const cellCenter = (code: Code, col: number, row: number) => ({
  x: col - code.size / 2 + 0.5,
  z: row - code.size / 2 + 0.5,
});
