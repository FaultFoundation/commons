"use client";

import { ProviderMark, type BrandProvider } from "@/components/brand/ProviderMark";

type Props = {
  provider: BrandProvider;
  /** Visible text, e.g. "Continue with Discord" or "Connect Discord". */
  label: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  /** Extra classes, e.g. `ff-auth__submit` to stretch to full width. */
  className?: string;
};

/**
 * The standard branded OAuth button: the site's `ff-btn` pill carrying each
 * provider's official colour and mark. Used for both sign-in ("Continue with…")
 * and account-linking ("Connect…") so every OAuth affordance reads the same
 * across the site — the reusable replacement for the old hand-rolled outline
 * pill. Presentational on purpose: the caller owns the click, since sign-in
 * (`authClient.signIn.social`) and linking (`authClient.oauth2.link`) diverge.
 */
export function OAuthButton({
  provider,
  label,
  onClick,
  type = "button",
  disabled,
  className,
}: Props) {
  return (
    <button
      className={`ff-btn ff-oauth ff-oauth--${provider}${className ? ` ${className}` : ""}`}
      type={type}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="ff-oauth__mark" aria-hidden="true">
        <ProviderMark provider={provider} />
      </span>
      {label}
    </button>
  );
}
