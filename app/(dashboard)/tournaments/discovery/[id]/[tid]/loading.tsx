// The loading state for ONE tournament inside a series. The layout's hero and
// tournament strip are not part of this segment, so they stay on screen while
// this renders — the whole point of the split. It stands in for the meta bar,
// the tab strip and the first panel only.
export default function Loading() {
  return (
    <div className="ff-tpanel" aria-busy="true" aria-label="Loading tournament">
      <div className="ff-skel ff-skel-line ff-skel-line--head" />
      <div className="ff-skel-bubble">
        <div className="ff-skel ff-skel-line ff-skel-line--head" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="ff-skel ff-skel-line" key={i} />
        ))}
      </div>
    </div>
  );
}
