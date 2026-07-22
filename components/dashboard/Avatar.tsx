/**
 * A person's picture or a team's logo, with initials as the fallback.
 *
 * Shared component (no directive): server pages and client editors both render
 * it. People are circles, teams are rounded squares — the same distinction the
 * cropper draws, so what you framed is what you get.
 *
 * Plain <img> on purpose: next/image is off site-wide (`images.unoptimized`
 * in next.config.ts), and these are already served at exactly one size.
 */
export function Avatar({
  src,
  name,
  shape = "circle",
  size = "md",
}: {
  src?: string | null;
  /** Drives the initials fallback and the alt text. */
  name: string;
  shape?: "circle" | "team";
  size?: "sm" | "md" | "lg";
}) {
  const classes = ["ff-avatar", `ff-avatar--${size}`];
  if (shape === "team") classes.push("ff-avatar--team");

  return (
    <span className={classes.join(" ")}>
      {src ? (
        // Decorative: every avatar sits beside the name it belongs to, so
        // announcing it again would just be noise.
        <img src={src} alt="" loading="lazy" decoding="async" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}

/** Up to two letters: "Alpha Squad" → "AS", "overfault" → "OV". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
