"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * Renders a string as a QR code, as inline SVG.
 *
 * The library can emit its own markup (`createSvgTag`), but that returns an
 * HTML *string* and would need dangerouslySetInnerHTML — for a value we hand
 * it ourselves, that's an unnecessary hole. Reading the module grid and
 * building the SVG in JSX costs a few lines and keeps the whole component
 * inside React's escaping.
 *
 * One `<path>` for every dark module rather than thousands of `<rect>`s: a
 * TOTP URI lands around 33x33 modules, and the path form is roughly a third of
 * the DOM. The viewBox is in module units, so the CSS size is the only thing
 * that decides how big it draws.
 */
export function QrCode({
  value,
  /** Quiet zone, in modules. 4 is the spec's minimum for reliable scanning. */
  margin = 4,
  className,
  alt,
}: {
  value: string;
  margin?: number;
  className?: string;
  /** Accessible name. The manual-entry key beside it is the real fallback. */
  alt: string;
}) {
  const { path, size } = useMemo(() => {
    // Type 0 = pick the smallest version that fits. "M" corrects ~15% damage,
    // the level phone cameras are tuned for.
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();

    const count = qr.getModuleCount();
    const parts: string[] = [];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          parts.push(`M${col + margin} ${row + margin}h1v1h-1z`);
        }
      }
    }
    return { path: parts.join(""), size: count + margin * 2 };
  }, [value, margin]);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={alt}
      shapeRendering="crispEdges"
    >
      {/* Scanners want a light field behind dark modules; the dashboard is
          dark, so the quiet zone has to be painted rather than inherited. */}
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
