import { LOOKS, QRTree, type Kind, type Mode } from "../src";

const links: { label: string; value: string; kind: Kind }[] = [
  { label: "GitHub", value: "https://github.com/SRojas22/QR_Tree", kind: "guayacan" },
  { label: "Email", value: "mailto:hello@example.com", kind: "jacaranda" },
  { label: "Website", value: "https://example.com", kind: "palm" },
  { label: "Phone", value: "tel:+15555550100", kind: "flamboyan" },
];

const canvas = document.querySelector("canvas")!;
const list = document.querySelector(".links")!;
const button = document.querySelector<HTMLButtonElement>(".toggle")!;

const tree = new QRTree(canvas, { ...links[0], mode: "code" });
// Grow up out of the code once the page has painted.
requestAnimationFrame(() => tree.setMode("tree"));

const sync = (mode: Mode) => {
  button.textContent = mode === "tree" ? "Show the QR code" : "Grow the tree back";
  canvas.setAttribute("aria-label", mode === "tree" ? "Tree, press to show its QR code" : "QR code, press to grow the tree back");
};
const toggle = () => sync(tree.toggle());

canvas.addEventListener("click", toggle);
canvas.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggle();
  }
});
button.addEventListener("click", toggle);

links.forEach((link, i) => {
  const b = document.createElement("button");
  b.role = "tab";
  b.textContent = `${link.label} · ${LOOKS[link.kind].name}`;
  b.setAttribute("aria-selected", String(i === 0));
  b.addEventListener("click", () => {
    list.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    tree.show(link.value, link);
    tree.jump("code");
    tree.setMode("tree");
    sync("tree");
  });
  list.append(b);
});
sync("tree");
