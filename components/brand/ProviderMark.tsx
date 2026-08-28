import type { ReactNode } from "react";

import type { LinkableProvider } from "@/lib/integrations-shared";

/**
 * Providers that ship an inline SVG brand glyph — the marks used on the OAuth
 * buttons and the integration card heads. Battle.net is excluded on purpose:
 * the org supplies it as a wide PNG wordmark, rendered directly in ProviderLogo
 * rather than as a square glyph.
 */
export type BrandProvider = Exclude<LinkableProvider, "battlenet">;

/**
 * Official Discord mark (the "clover"). Inherits `currentColor` and is sized by
 * its ancestor, so the same glyph serves both the button (1.25em) and the
 * integration tile (28px) without change.
 */
export function DiscordMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" role="presentation">
      <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

/** Official FACEIT mark (the angular swoosh), from Simple Icons. */
export function FaceitMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" role="presentation">
      <path d="M23.999 2.705a.167.167 0 00-.312-.1 1141.27 1141.27 0 00-6.053 9.375H.218c-.221 0-.301.282-.11.352 7.227 2.73 17.667 6.836 23.5 9.134.15.06.39-.08.39-.18z" />
    </svg>
  );
}

/**
 * Official start.gg mark (the two offset brackets). Two-tone by brand
 * guidelines — unlike the other marks here it does not adopt `currentColor`,
 * so it renders identically on any background.
 */
export function StartggMark() {
  return (
    <svg viewBox="0 0 40 40" role="presentation">
      <path
        fill="#3f80ff"
        d="M1.25 20h7.5A1.25 1.25 0 0 0 10 18.75v-7.5A1.25 1.25 0 0 1 11.25 10h27.5A1.25 1.25 0 0 0 40 8.75V1.25A1.25 1.25 0 0 0 38.75 0H10A10 10 0 0 0 0 10v8.75A1.25 1.25 0 0 0 1.25 20Z"
      />
      <path
        fill="#ff2768"
        d="M38.75 20h-7.5A1.25 1.25 0 0 0 30 21.25v7.5A1.25 1.25 0 0 1 28.75 30H1.25A1.25 1.25 0 0 0 0 31.25v7.5A1.25 1.25 0 0 0 1.25 40H30A10 10 0 0 0 40 30V21.25A1.25 1.25 0 0 0 38.75 20Z"
      />
    </svg>
  );
}

/**
 * Official Challonge symbol mark, drawn in `currentColor` (the source ships it
 * as an orange gradient; flattening to `currentColor` keeps it consistent with
 * the other marks here and avoids a `<linearGradient>` id collision when the
 * mark renders more than once on a page).
 */
export function ChallongeMark() {
  return (
    <svg viewBox="0 0 14.572913 9.6662521" role="presentation">
      <g transform="translate(-78.090849,-130.16281)">
        <path
          fill="currentColor"
          d="m 91.998472,130.22357 c -1.536,0.1651 -3.07446,0.30656 -4.60587,0.50376 v 0 c -1.98861,0.25577 -3.9684,0.56727 -5.88715,1.17934 v 0 c -0.87842,0.27975 -1.72967,0.61701 -2.47368,1.1751 v 0 c -0.89923,0.67487 -1.1804,1.56492 -0.72849,2.50014 v 0 c 0.67063,1.38853 1.38748,2.75449 2.08104,4.13208 v 0 c 0.0688,0.13723 0.13723,0.14288 0.26176,0.0635 v 0 c 0.56903,-0.36336 1.09537,-0.78246 1.51906,-1.30386 v 0 c 0.23566,-0.28963 0.41169,-0.63712 0.56233,-0.98143 v 0 c 0.0801,-0.1838 0.0483,-0.41663 0.0702,-0.66111 v 0 c -0.26388,0.12101 -0.46002,0.23425 -0.67028,0.30375 v 0 c -0.73801,0.24482 -1.35466,-0.17181 -1.39276,-0.94474 v 0 c -0.0392,-0.79128 0.363,-1.35926 0.99377,-1.77236 v 0 c 0.57327,-0.37606 1.23508,-0.5521 1.88842,-0.7299 v 0 c 1.03505,-0.28081 2.08456,-0.51293 3.06176,-0.97296 v 0 c 0.0342,-0.0162 0.078,-0.0127 0.12453,-0.0194 v 0 c 0.008,0.0384 0.0201,0.0653 0.019,0.0917 v 0 c -0.0123,0.52423 -0.2346,0.95039 -0.67486,1.22379 v 0 c -0.43533,0.27058 -0.91158,0.47554 -1.35538,0.73448 v 0 c -0.22084,0.12841 -0.45085,0.28046 -0.60219,0.47837 v 0 c -0.28751,0.37606 -0.0617,0.81421 0.40817,0.81703 v 0 c 0.27904,0.004 0.56021,-0.0451 0.83784,-0.0896 v 0 c 0.20285,-0.0328 0.25612,-0.0162 0.21908,0.18909 v 0 c -0.0667,0.36512 -0.13582,0.73518 -0.25929,1.08373 v 0 c -0.13053,0.36724 -0.32597,0.7119 -0.49283,1.06645 v 0 c 1.42698,-0.004 5.3414,-2.32234 5.87551,-3.49003 v 0 c -0.067,0.0187 -0.12629,0.0363 -0.18627,0.0515 v 0 c -0.42792,0.10548 -0.8576,0.16087 -1.29822,0.0691 v 0 c -0.61771,-0.12877 -0.88794,-0.65582 -0.59902,-1.21215 v 0 c 0.26071,-0.502 0.70556,-0.81315 1.18887,-1.07703 v 0 c 0.83961,-0.45967 1.64147,-0.97155 2.26377,-1.7145 v 0 c 0.18662,-0.22296 0.34502,-0.46919 0.51647,-0.7045 v 0 c -0.0138,-0.0166 -0.0275,-0.0335 -0.0413,-0.0501 v 0 c -0.20814,0.0197 -0.41628,0.0381 -0.62406,0.0607"
        />
      </g>
    </svg>
  );
}

const MARKS: Record<BrandProvider, () => ReactNode> = {
  discord: DiscordMark,
  faceit: FaceitMark,
  startgg: StartggMark,
  challonge: ChallongeMark,
};

/** Renders the brand glyph for a provider. Decorative — callers mark it aria-hidden. */
export function ProviderMark({ provider }: { provider: BrandProvider }) {
  const Mark = MARKS[provider];
  return <Mark />;
}
