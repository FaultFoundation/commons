/** The tournament skeleton, shared by member routes inside the persistent shell. */
export function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading page content">
      <span className="screen-reader-text">Loading page content…</span>
      <div className="ff-bubble-grid ff-bubble-grid--single" aria-hidden="true">
        <div className="ff-skel ff-skel-hero" />
        <div className="ff-tcard-grid">
          {Array.from({ length: 6 }, (_, i) => (
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
