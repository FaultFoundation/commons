// Route-segment loading screen for the Tournaments list. Next renders this as
// the Suspense fallback while the page's server component resolves its D1 +
// cen-sql reads — so navigating in (or reloading while the projection is being
// rewritten) shows a skeleton grid, never a blank frame.
export default function Loading() {
  return (
    <div className="ff-dash ff-skel-page" aria-busy="true" aria-label="Loading tournaments">
      <div className="ff-bubble-grid">
        <div className="ff-skel ff-skel-hero" />
        <div className="ff-tcard-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="ff-skel-card" key={i}>
              <div className="ff-skel ff-skel-card__banner" />
              <div className="ff-skel-card__body">
                <div className="ff-skel ff-skel-line ff-skel-line--sm" />
                <div className="ff-skel ff-skel-line" />
                <div className="ff-skel ff-skel-line ff-skel-line--sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
