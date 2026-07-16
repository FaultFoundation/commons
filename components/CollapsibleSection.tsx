import type { ReactNode } from "react";

/**
 * Collapsible rounded card built on native <details>. The anchor id
 * sits on the <details> element itself so hash navigation works before
 * hydration; HashTarget auto-expands it on TOC/deep-link navigation.
 * Stays a server component — HashTarget mutates the DOM directly, so
 * React never fights the native toggle.
 */
export function CollapsibleSection({
  id,
  heading,
  headingLevel: Heading = "h2",
  defaultOpen = false,
  children,
}: {
  id?: string;
  heading: ReactNode;
  headingLevel?: "h2" | "h3";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details id={id} className="ff-collapse" open={defaultOpen || undefined}>
      <summary className="ff-collapse__summary">
        <Heading>{heading}</Heading>
      </summary>
      <div className="ff-collapse__body ff-prose">{children}</div>
    </details>
  );
}
