import { ProviderMark } from "@/components/brand/ProviderMark";
import type { LinkableProvider } from "@/lib/integrations-shared";

/**
 * Brand tile for a connected-account card. Decorative — the provider name is
 * always rendered as text beside it, so these are aria-hidden.
 */
export function ProviderLogo({ provider }: { provider: LinkableProvider }) {
  return (
    <span
      className={`ff-integration__logo ff-integration__logo--${provider}`}
      aria-hidden="true"
    >
      {provider === "battlenet" ? (
        <BattleNetMark />
      ) : (
        <ProviderMark provider={provider} />
      )}
    </span>
  );
}

/**
 * Official Blizzard Entertainment wordmark, dark-background variant, supplied
 * by the org. A wordmark rather than a square glyph, so it's height-matched to
 * the Discord mark and left to find its own width — never squeezed into a
 * square. Plain <img> to match the rest of the markup (next.config sets
 * images.unoptimized).
 */
function BattleNetMark() {
  return (
    <img
      src="/brand/Blizz_Corp_RGB_DarkBkgd.png"
      alt=""
      width={240}
      height={140}
    />
  );
}
