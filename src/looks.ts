// Four trees from Quito and Miami. Each has its own shape (see trees.ts) and a
// palette: `bloom` colours the canopy, `deep` is the dark tone a bloom turns once
// it lands as a QR module, and `bark` is [branches, trunk and main limbs].
export type Kind = "guayacan" | "jacaranda" | "palm" | "flamboyan";

export type Look = { name: string; where: string; bloom: string[]; deep: string[]; bark: [string, string] };

export const KINDS: readonly Kind[] = ["guayacan", "jacaranda", "palm", "flamboyan"];

export const LOOKS: Record<Kind, Look> = {
  guayacan: {
    name: "Guayacán",
    where: "Ecuador",
    bloom: ["#f5b301", "#ffd23f", "#f7c843", "#e8a317", "#ffe27a"],
    deep: ["#4a3405", "#3e2b04", "#55400a"],
    bark: ["#4b3a2c", "#3a2c21"],
  },
  jacaranda: {
    name: "Jacaranda",
    where: "Quito & Miami",
    bloom: ["#1f3bd8", "#3d5cf0", "#6f86ff", "#5a4fd8", "#8a9bff"],
    deep: ["#0e1a5e", "#0b154d", "#151f6e"],
    bark: ["#5d4a3c", "#45372c"],
  },
  palm: {
    name: "Royal palm",
    where: "Miami",
    bloom: ["#2f8a4a", "#3fa35a", "#6cbf5f", "#1f6b3a", "#8fd16d"],
    deep: ["#173a10", "#123009", "#1c4514"],
    bark: ["#bdb3a3", "#9a8f7f"],
  },
  flamboyan: {
    name: "Flamboyán",
    where: "Miami",
    bloom: ["#e0301e", "#f2513f", "#ff7a66", "#c8261a", "#ff9a3d"],
    deep: ["#5c1a16", "#4d1512", "#69211c"],
    bark: ["#4a3326", "#3a271d"],
  },
};
