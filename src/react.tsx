import { useEffect, useRef, type CanvasHTMLAttributes } from "react";
import { QRTree as Scene, type Film, type Mode } from "./scene";
import type { Kind, Look } from "./looks";

export type QRTreeProps = Omit<CanvasHTMLAttributes<HTMLCanvasElement>, "children"> & {
  /** The text or URL to encode. */
  value: string;
  kind?: Kind;
  label?: string;
  look?: Partial<Look>;
  edgeText?: [string[], string[]] | false;
  /** Controlled mode. Leave it out and the tree toggles itself on click. */
  mode?: Mode;
  /** Called with the new mode when the tree is clicked. */
  onModeChange?: (mode: Mode) => void;
  duration?: number;
  film?: Partial<Film>;
  shadows?: boolean;
  maxPixelRatio?: number;
  reducedMotion?: boolean;
};

/**
 * A QR code that grows into a tree. Changing `value` or `kind` grows a new tree
 * up out of its code.
 */
export function QRTree({
  value,
  kind,
  label,
  look,
  edgeText,
  mode,
  onModeChange,
  duration,
  film,
  shadows,
  maxPixelRatio,
  reducedMotion,
  onClick,
  onKeyDown,
  ...rest
}: QRTreeProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene | null>(null);
  const tree = { kind, label, look, edgeText };
  const latest = useRef(tree);
  latest.current = tree;

  // Renderer options are read once; remount (change `key`) to change them.
  useEffect(() => {
    const s = new Scene(canvas.current!, { value, ...latest.current, mode, duration, film, shadows, maxPixelRatio, reducedMotion });
    scene.current = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planted = useRef({ value, kind, label });
  useEffect(() => {
    const s = scene.current;
    const p = planted.current;
    if (!s || (p.value === value && p.kind === kind && p.label === label)) return;
    planted.current = { value, kind, label };
    s.show(value, latest.current);
    // The new tree rises out of its own code.
    s.jump("code");
    s.setMode(mode ?? "tree");
  }, [value, kind, label, mode]);

  useEffect(() => {
    if (mode) scene.current?.setMode(mode);
  }, [mode]);

  const toggle = () => {
    const s = scene.current;
    if (!s) return;
    const next: Mode = s.mode === "tree" ? "code" : "tree";
    if (mode === undefined) s.setMode(next);
    onModeChange?.(next);
  };

  return (
    <canvas
      ref={canvas}
      role="button"
      tabIndex={0}
      aria-label={`QR code for ${label ?? value}`}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) toggle();
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!e.defaultPrevented && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          toggle();
        }
      }}
    />
  );
}

export type { Film, Kind, Look, Mode };
