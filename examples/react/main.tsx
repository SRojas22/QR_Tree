import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { LOOKS, type Kind } from "../../src";
import { QRTree, type Mode } from "../../src/react";

const links: { label: string; value: string; kind: Kind }[] = [
  { label: "GitHub", value: "https://github.com/SRojas22/QR_Tree", kind: "guayacan" },
  { label: "Email", value: "mailto:hello@example.com", kind: "jacaranda" },
  { label: "Website", value: "https://example.com", kind: "palm" },
  { label: "Phone", value: "tel:+15555550100", kind: "flamboyan" },
];

function App() {
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("tree");
  const link = links[active];

  return (
    <main>
      <div>
        <h1>QR Tree · React</h1>
        <p>The same tree as a controlled component.</p>
        <div className="links" role="tablist" aria-label="Links">
          {links.map((l, i) => (
            <button
              key={l.value}
              role="tab"
              aria-selected={i === active}
              onClick={() => {
                setActive(i);
                setMode("tree");
              }}
            >
              {l.label} · {LOOKS[l.kind].name}
            </button>
          ))}
        </div>
        <button className="toggle" type="button" onClick={() => setMode(mode === "tree" ? "code" : "tree")}>
          {mode === "tree" ? "Show the QR code" : "Grow the tree back"}
        </button>
        <nav>
          <a href="../">← Plain JS version</a>
        </nav>
      </div>
      <QRTree value={link.value} kind={link.kind} label={link.label} mode={mode} onModeChange={setMode} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
