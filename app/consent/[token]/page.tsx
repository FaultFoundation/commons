import type { Metadata } from "next";

import { ConsentConfirm } from "./ConsentConfirm";

// Public (the parent has no account) and always per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Parental Consent",
  robots: { index: false },
};

export default async function ConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--fill">
      <div className="ff-container ff-section--tight">
        <ConsentConfirm token={token} />
      </div>
    </main>
  );
}
