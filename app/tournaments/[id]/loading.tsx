// Route-segment loading screen for a single tournament (internal or the branded
// external view). Shown while the page resolves its reads — including the
// atomic cen-sql snapshot batch for external tournaments — so opening one never
// flashes an empty page.
export default function Loading() {
  return (
    <div className="ff-bubble-grid" aria-busy="true" aria-label="Loading tournament">
      <div className="ff-skel ff-skel-hero" />
      <div className="ff-skel-bubble">
        <div className="ff-skel ff-skel-line ff-skel-line--head" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="ff-skel ff-skel-line" key={i} />
        ))}
      </div>
    </div>
  );
}
