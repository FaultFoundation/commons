"use client";

/**
 * Donate control for the homepage "Not-for-profit" column.
 *
 * Reuses the site's existing GiveButter *floating* widget (id `pEZdY1`, mounted
 * once in app/layout.tsx and loaded by widgets.givebutter.com) instead of
 * embedding a second widget: pEZdY1 is a floating type, so an inline
 * `<givebutter-widget>` would render another fixed pill rather than an inline
 * button. Clicking here opens that same overlay imperatively. If GiveButter's
 * element exposes neither `open()` nor a click handler on the host in this
 * build, the button no-ops — but the floating widget stays visible site-wide,
 * so donating is never blocked. Swap in a dedicated GiveButter "popup" widget
 * id here if one is created.
 */
export function DonateButton() {
  function openDonate() {
    const gb = document.querySelector("givebutter-widget") as
      | (HTMLElement & { open?: () => void })
      | null;
    if (!gb) return;
    if (typeof gb.open === "function") gb.open();
    else gb.click();
  }

  return (
    <button
      type="button"
      className="ff-btn ff-btn--accent"
      onClick={openDonate}
    >
      Donate
    </button>
  );
}
