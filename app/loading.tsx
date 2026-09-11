import { PageLoading } from "@/components/PageLoading";

// Covers page and nested-layout data reads while the shared header/footer stay
// mounted. More specific route loaders (such as tournaments) still take over.
export default function Loading() {
  return (
    <main className="ff-page-loading-shell">
      <PageLoading />
    </main>
  );
}
