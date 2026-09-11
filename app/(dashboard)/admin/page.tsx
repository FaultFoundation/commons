import { redirect } from "next/navigation";

// The Admin tab opens on Support. The gate (and the Discord-role sync) runs on
// the sub-page it lands on, so this stays a bare redirect.
export const dynamic = "force-dynamic";

export default function AdminPage() {
  redirect("/admin/tickets/");
}
