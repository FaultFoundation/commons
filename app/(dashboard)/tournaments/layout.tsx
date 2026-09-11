import { Suspense, type ReactNode } from "react";
import { SetupBanner } from "@/components/dashboard/SetupBanner";
import { getSessionCached } from "@/lib/session";

async function TournamentSetupBanner() {
  const session = await getSessionCached();
  return session ? <SetupBanner userId={session.user.id} /> : null;
}

export default function TournamentsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}><TournamentSetupBanner /></Suspense>
      {children}
    </>
  );
}
