/** Shared, server-rendered status; no JavaScript or data reads needed to paint. */
export function PageLoading({ label = "Loading Your Page" }: { label?: string }) {
  return (
    <section className="ff-page-loading" role="status" aria-live="polite">
      <h1 className="ff-page-loading__title">{label}</h1>
      <p className="ff-page-loading__hint">
        Getting everything ready. This may take a few seconds.
      </p>
      <div className="ff-owload__track" aria-hidden="true">
        <div className="ff-owload__bar ff-owload__bar--indeterminate" />
      </div>
    </section>
  );
}
