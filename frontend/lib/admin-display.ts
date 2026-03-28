/** Human-readable seller verification state for admin UI. */
export function formatVerificationStatusLabel(status: string | undefined | null): string {
    if (status == null || status === "") {
        return "—";
    }
    const key = status.toLowerCase();
    const labels: Record<string, string> = {
        unsubmitted: "Unsubmitted",
        pending: "Pending",
        approved: "Approved",
        rejected: "Rejected"
    };
    return labels[key] ?? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}
