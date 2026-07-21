import type { Metadata } from "next";

export const metadata: Metadata = {
  // Absolute: the root layout's title.template doesn't apply to its own
  // segment in current Next.
  title: { absolute: "Commons - The Fault Foundation" },
  alternates: { canonical: "/" },
};

/**
 * The Commons landing page — where this app brings everyone. Intentionally
 * blank for now; tournaments, schedules, and teams land here, and Overfault
 * becomes a tab alongside them.
 */
export default function CommonsPage() {
  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--fill">
      <div className="ff-container ff-section">
        <h1>Commons</h1>
      </div>
    </main>
  );
}
