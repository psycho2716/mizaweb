"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminConsoleShell } from "@/components/admin/admin-console-shell";
import { AdminVerificationExpandedPanel } from "@/components/admin/admin-verification-expanded-panel";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { Button } from "@/components/ui/button";
import {
    approveVerification,
    getAdminOverview,
    getAdminVerificationPermitUrl,
    listPendingVerifications,
    rejectVerification
} from "@/lib/api/endpoints";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { cn } from "@/lib/utils";
import type { AdminOverviewData, AdminVerificationItem, ListPaginationMeta } from "@/types";

const PAGE_SIZE = 10;

function StatCard({
    label,
    value,
    hint,
    hintTone = "muted"
}: {
    label: string;
    value: string | number;
    hint: string;
    hintTone?: "muted" | "accent" | "warn";
}) {
    const hintClass =
        hintTone === "accent"
            ? "text-(--accent)"
            : hintTone === "warn"
              ? "text-amber-400/90"
              : "text-(--muted)";
    return (
        <div className="rounded-md border border-(--border) bg-(--surface) p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                {label}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
            <p className={cn("mt-1 text-xs", hintClass)}>{hint}</p>
        </div>
    );
}

export default function AdminVerificationsPage() {
    const { requestConfirm, dialog: confirmDialog } = useConfirmDialog();
    const [queue, setQueue] = useState<AdminVerificationItem[]>([]);
    const [pagination, setPagination] = useState<ListPaginationMeta | null>(null);
    const [page, setPage] = useState(1);
    const [overview, setOverview] = useState<AdminOverviewData | null>(null);
    const [overviewError, setOverviewError] = useState("");
    const [queueError, setQueueError] = useState("");
    const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({});
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [queueLoading, setQueueLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadOverview = useCallback(async (): Promise<boolean> => {
        try {
            const res = await getAdminOverview();
            setOverview(res.data);
            setOverviewError("");
            return true;
        } catch {
            setOverview(null);
            setOverviewError("Could not load overview.");
            toast.error("Could not load overview.");
            return false;
        }
    }, []);

    const loadQueue = useCallback(async (requestedPage: number): Promise<boolean> => {
        setQueueLoading(true);
        try {
            const res = await listPendingVerifications({ page: requestedPage, limit: PAGE_SIZE });
            setQueue(res.data);
            setPagination(res.pagination);
            if (res.pagination.page !== requestedPage) {
                setPage(res.pagination.page);
            }
            setQueueError("");
            return true;
        } catch {
            setQueue([]);
            setPagination(null);
            setQueueError("Could not load verification queue.");
            toast.error("Could not load verification queue.");
            return false;
        } finally {
            setQueueLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadOverview();
    }, [loadOverview]);

    useEffect(() => {
        void loadQueue(page);
    }, [page, loadQueue]);

    useEffect(() => {
        setExpandedId(null);
    }, [page]);

    const refreshAll = useCallback(async () => {
        setRefreshing(true);
        try {
            const [queueOk, overviewOk] = await Promise.all([loadQueue(page), loadOverview()]);
            if (queueOk && overviewOk) {
                toast.success("Dashboard updated.");
            }
        } finally {
            setRefreshing(false);
        }
    }, [loadQueue, loadOverview, page]);

    async function handleApprove(id: string) {
        const entry = queue.find((e) => e.id === id);
        const label = entry?.profile?.businessName ?? entry?.seller?.email ?? id;
        const ok = await requestConfirm({
            title: "Approve seller verification?",
            description: "This marks the seller as verified.",
            confirmLabel: "Approve"
        });
        if (!ok) return;
        try {
            await approveVerification(id);
            toast.success(`Approved ${label}`);
            await refreshAll();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Approve failed");
        }
    }

    async function openPermitDocument(verificationId: string) {
        try {
            const { url } = await getAdminVerificationPermitUrl(verificationId);
            window.open(url, "_blank", "noopener,noreferrer");
            toast.success("Permit opened in a new tab.");
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Could not open permit document. Check storage and backend configuration.";
            toast.error(message);
        }
    }

    async function handleReject(id: string) {
        const reason = rejectReasonById[id]?.trim();
        if (!reason) {
            toast.error("Rejection reason is required.");
            return;
        }
        const entry = queue.find((e) => e.id === id);
        const label = entry?.profile?.businessName ?? entry?.seller?.email ?? id;
        const ok = await requestConfirm({
            title: "Reject this verification?",
            description: "The seller can submit a new permit after rejection.",
            confirmLabel: "Reject",
            destructive: true
        });
        if (!ok) return;
        try {
            await rejectVerification(id, reason);
            toast.success(`Rejected — seller can resubmit: ${label}`);
            setRejectReasonById((p) => {
                const next = { ...p };
                delete next[id];
                return next;
            });
            await refreshAll();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Reject failed");
        }
    }

    const pending = overview?.pendingVerifications ?? 0;
    const verified = overview?.verifiedSellers ?? "—";
    const unverified = overview?.unverifiedSellers ?? "—";
    const pg = pagination ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

    return (
        <AdminConsoleShell activeNav="verifications">
            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard
                        label="Pending verifications"
                        value={pending}
                        hint={pending ? "Awaiting review" : "Queue is clear"}
                        hintTone={pending ? "accent" : "muted"}
                    />
                    <StatCard
                        label="Verified sellers"
                        value={verified}
                        hint="Approved business verification"
                        hintTone="muted"
                    />
                    <StatCard
                        label="Unverified sellers"
                        value={unverified}
                        hint="Not yet approved (includes pending / rejected / no submission)"
                        hintTone="warn"
                    />
                </div>

                {overviewError ? (
                    <p className="text-xs text-amber-400/90">{overviewError}</p>
                ) : null}

                <section className="overflow-hidden rounded-md border border-(--border) bg-(--surface)">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--border) px-4 py-4 md:px-5">
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">
                                Verification requests
                            </h2>
                            <p className="text-xs text-(--muted)">
                                {queueError ||
                                    "Open the permit, then approve or reject with a reason for resubmission."}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void refreshAll()}
                            disabled={refreshing || queueLoading}
                            className="text-xs font-semibold uppercase tracking-wider text-(--accent) hover:underline disabled:opacity-50"
                        >
                            {refreshing ? "Refreshing…" : "Refresh"}
                        </button>
                    </div>

                    <div>
                        {queueLoading && queue.length === 0 ? (
                            <div className="px-5 py-12 text-center text-sm text-(--muted)">
                                Loading queue…
                            </div>
                        ) : queue.length === 0 ? (
                            <div className="px-5 py-12 text-center text-sm text-(--muted)">
                                No pending requests on this page. Sellers appear here after they
                                submit a permit for review.
                            </div>
                        ) : (
                            <>
                                <div className="md:hidden">
                                    <div className="space-y-3 p-3">
                                    {queue.map((entry) => {
                                        const open = expandedId === entry.id;
                                        const business = entry.profile?.businessName ?? "—";
                                        const email = entry.seller?.email ?? "—";
                                        const name = entry.seller?.fullName ?? "";
                                        return (
                                            <div
                                                key={entry.id}
                                                className="overflow-hidden rounded-md border border-(--border) bg-(--surface)"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setExpandedId(open ? null : entry.id)
                                                    }
                                                    className="flex w-full items-start gap-2 p-4 text-left"
                                                >
                                                    {open ? (
                                                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-(--muted)" />
                                                    ) : (
                                                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-(--muted)" />
                                                    )}
                                                    <span className="min-w-0">
                                                        <span className="font-medium text-foreground">
                                                            {business}
                                                        </span>
                                                        <span className="mt-0.5 block text-xs text-(--muted)">
                                                            {email}
                                                        </span>
                                                        {name ? (
                                                            <span className="mt-0.5 block text-xs text-(--muted)/80">
                                                                {name}
                                                            </span>
                                                        ) : null}
                                                        <span className="mt-1 block font-mono text-[10px] text-(--muted)">
                                                            {entry.id}
                                                        </span>
                                                    </span>
                                                </button>
                                                <div className="flex flex-wrap gap-2 border-t border-(--border) px-4 py-3">
                                                    <span className="mr-auto inline-flex items-center rounded-sm bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                                                        Pending
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 border-(--border) bg-transparent text-xs text-foreground"
                                                        onClick={() =>
                                                            void openPermitDocument(entry.id)
                                                        }
                                                    >
                                                        View permit
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        className="h-8 bg-(--accent) text-xs font-semibold uppercase tracking-wide text-[#031018] hover:brightness-110"
                                                        onClick={() =>
                                                            void handleApprove(entry.id)
                                                        }
                                                    >
                                                        Approve
                                                    </Button>
                                                </div>
                                                {open ? (
                                                    <div className="border-t border-(--border) bg-[#0c1018] px-4 py-4">
                                                        <AdminVerificationExpandedPanel
                                                            entry={entry}
                                                            rejectReasonById={rejectReasonById}
                                                            onRejectReasonChange={(id, value) =>
                                                                setRejectReasonById((previous) => ({
                                                                    ...previous,
                                                                    [id]: value
                                                                }))
                                                            }
                                                            onReject={(id) => void handleReject(id)}
                                                        />
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                    </div>
                                    <AdminTablePagination
                                        page={pg.page}
                                        totalPages={pg.totalPages}
                                        total={pg.total}
                                        limit={pg.limit}
                                        onPageChange={setPage}
                                        disabled={queueLoading || refreshing}
                                    />
                                </div>
                                <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[640px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-(--border) text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                                        <th className="px-4 py-3 md:px-5">Seller</th>
                                        <th className="px-4 py-3">Role</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queue.map((entry) => {
                                        const open = expandedId === entry.id;
                                        const business = entry.profile?.businessName ?? "—";
                                        const email = entry.seller?.email ?? "—";
                                        const name = entry.seller?.fullName ?? "";
                                        return (
                                            <Fragment key={entry.id}>
                                                <tr className="border-b border-(--border) bg-(--surface) hover:bg-(--surface-elevated)/40">
                                                    <td className="px-4 py-3 md:px-5">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setExpandedId(
                                                                    open ? null : entry.id
                                                                )
                                                            }
                                                            className="flex w-full items-start gap-2 text-left"
                                                        >
                                                            {open ? (
                                                                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-(--muted)" />
                                                            ) : (
                                                                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-(--muted)" />
                                                            )}
                                                            <span>
                                                                <span className="font-medium text-foreground">
                                                                    {business}
                                                                </span>
                                                                <span className="mt-0.5 block text-xs text-(--muted)">
                                                                    {email}
                                                                </span>
                                                                {name ? (
                                                                    <span className="mt-0.5 block text-xs text-(--muted)/80">
                                                                        {name}
                                                                    </span>
                                                                ) : null}
                                                                <span className="mt-1 block font-mono text-[10px] text-(--muted)">
                                                                    {entry.id}
                                                                </span>
                                                            </span>
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3 align-top">
                                                        <span className="inline-block border border-(--accent)/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-(--accent)">
                                                            Seller
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 align-top">
                                                        <span className="inline-flex items-center rounded-sm bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                                                            Pending
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 align-top text-right">
                                                        <div className="flex flex-wrap justify-end gap-2">
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-8 border-(--border) bg-transparent text-xs text-foreground hover:bg-(--surface-elevated)"
                                                                onClick={() =>
                                                                    void openPermitDocument(
                                                                        entry.id
                                                                    )
                                                                }
                                                            >
                                                                View permit
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                className="h-8 bg-(--accent) text-xs font-semibold uppercase tracking-wide text-[#031018] hover:brightness-110"
                                                                onClick={() =>
                                                                    void handleApprove(entry.id)
                                                                }
                                                            >
                                                                Approve
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {open ? (
                                                    <tr className="border-b border-(--border) bg-[#0c1018]">
                                                        <td
                                                            colSpan={4}
                                                            className="px-4 py-4 md:px-5"
                                                        >
                                                            <AdminVerificationExpandedPanel
                                                                entry={entry}
                                                                rejectReasonById={
                                                                    rejectReasonById
                                                                }
                                                                onRejectReasonChange={(
                                                                    id,
                                                                    value
                                                                ) =>
                                                                    setRejectReasonById(
                                                                        (previous) => ({
                                                                            ...previous,
                                                                            [id]: value
                                                                        })
                                                                    )
                                                                }
                                                                onReject={(id) =>
                                                                    void handleReject(id)
                                                                }
                                                            />
                                                        </td>
                                                    </tr>
                                                ) : null}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                                </div>
                                <div className="hidden md:block">
                                    <AdminTablePagination
                                        page={pg.page}
                                        totalPages={pg.totalPages}
                                        total={pg.total}
                                        limit={pg.limit}
                                        onPageChange={setPage}
                                        disabled={queueLoading || refreshing}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {(queueLoading && queue.length === 0) || queue.length === 0 ? (
                        <AdminTablePagination
                            page={pg.page}
                            totalPages={pg.totalPages}
                            total={pg.total}
                            limit={pg.limit}
                            onPageChange={setPage}
                            disabled={queueLoading || refreshing}
                        />
                    ) : null}
                </section>
            </div>
            {confirmDialog}
        </AdminConsoleShell>
    );
}
