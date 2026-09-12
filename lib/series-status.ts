/** External snapshots can outlive their end date. Keep series lifecycle based
 * on the complete membership, even when a filter hides one of its games. */
export function seriesStatus(events: { status: string; source?: string | null; endsAt?: number | null }[], now: number) {
  const statuses = events.map((event) => {
    const status = event.status?.trim().toLowerCase() ?? "";
    if (["completed", "complete", "finished", "finalized", "cancelled", "canceled"].includes(status)) return "completed";
    if (event.source && event.endsAt != null && event.endsAt < now) return "completed";
    return status;
  });
  const done = statuses.filter((status) => status === "completed").length;
  const concluded = events.length > 0 && done === events.length;
  const live = statuses.includes("active");
  const registering = statuses.includes("registration");
  return {
    done,
    total: events.length,
    concluded,
    status: concluded ? "Concluded" : live ? "Live" : registering ? "Registration open" : "Upcoming",
    statusLive: live || registering,
  };
}
