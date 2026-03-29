"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminConsoleShell } from "@/components/admin/admin-console-shell";
import { AdminSellerLocationMap } from "@/components/admin/admin-seller-location-map";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
    approveAdminLocationRequest,
    getAdminOverview,
    listAdminLocationRequests,
    rejectAdminLocationRequest
} from "@/lib/api/endpoints";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import type { AdminLocationRequestItem, AdminOverviewData, ListPaginationMeta } from "@/types";

const PAGE_SIZE = 10;

export default function AdminLocationRequestsPage() {
    const { requestConfirm, dialog: confirmDialog } = useConfirmDialog();
    const [rows, setRows] = useState<AdminLocationRequestItem[]>([]);
    const [pagination, setPagination] = useState<ListPaginationMeta | null>(null);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState<AdminOverviewData | null>(null);
    const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({});

    const loadQueue = useCallback(
        async (requestedPage: number, status: "pending" | "all") => {
            setLoading(true);
            try {
                const res = await listAdminLocationRequests({
                    page: requestedPage,
                    limit: PAGE_SIZE,
                    ...(status === "pending" ? { status: "pending" } : {})
                });
                setRows(res.data);
                setPagination(res.pagination);
                if (res.pagination.page !== requestedPage) {
                    setPage(res.pagination.page);
                }
            } catch {
                setRows([]);
                setPagination(null);
                toast.error("Could not load location requests.");
            } finally {
                setLoading(false);
            }
        },
        []
    );

    const loadOverview = useCallback(async () => {
        try {
            const res = await getAdminOverview();
            setOverview(res.data);
        } catch {
            setOverview(null);
        }
    }, []);

    useEffect(() => {
        void loadOverview();
    }, [loadOverview]);

    useEffect(() => {
        void loadQueue(page, statusFilter);
    }, [page, statusFilter, loadQueue]);

    async function handleApprove(id: string) {
        const row = rows.find((r) => r.id === id);
        const label = row?.profile?.businessName ?? row?.seller?.email ?? id;
        const ok = await requestConfirm({
            title: "Approve new shop pin?",
            description: "The seller’s public map will move to the requested coordinates.",
            confirmLabel: "Approve pin"
        });
        if (!ok) return;
        try {
            await approveAdminLocationRequest(id);
            toast.success(`Approved map update for ${label}`);
            await loadQueue(page, statusFilter);
            await loadOverview();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not approve");
        }
    }

    async function handleReject(id: string) {
        const reason = rejectReasonById[id]?.trim();
        if (!reason) {
            toast.error("Add a short note for the seller before declining.");
            return;
        }
        const row = rows.find((r) => r.id === id);
        const label = row?.profile?.businessName ?? row?.seller?.email ?? id;
        const ok = await requestConfirm({
            title: "Decline this location request?",
            description: "Their map pin will stay where it is.",
            confirmLabel: "Decline",
            destructive: true
        });
        if (!ok) return;
        try {
            await rejectAdminLocationRequest(id, reason);
            toast.success(`Declined — ${label}`);
            setRejectReasonById((p) => {
                const next = { ...p };
                delete next[id];
                return next;
            });
            await loadQueue(page, statusFilter);
            await loadOverview();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not decline");
        }
    }

    const pg = pagination ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };
    const pendingCount = overview?.pendingLocationRequests ?? 0;

    return (
        <AdminConsoleShell activeNav="location-requests">
            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-semibold text-foreground">Shop location requests</h1>
                        <p className="mt-1 max-w-xl text-sm text-(--muted)">
                            Sellers cannot move their public map pin without approval. Review proposed
                            coordinates and approve or decline.
                        </p>
                        {pendingCount > 0 ? (
                            <p className="mt-2 text-xs font-medium text-(--accent)">
                                {pendingCount} pending
                            </p>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant={statusFilter === "pending" ? "default" : "outline"}
                            size="sm"
                            className={
                                statusFilter === "pending"
                                    ? "bg-(--accent) text-[#050608]"
                                    : "border-(--border)"
                            }
                            onClick={() => {
                                setPage(1);
                                setStatusFilter("pending");
                            }}
                        >
                            Pending only
                        </Button>
                        <Button
                            type="button"
                            variant={statusFilter === "all" ? "default" : "outline"}
                            size="sm"
                            className={
                                statusFilter === "all"
                                    ? "bg-(--accent) text-[#050608]"
                                    : "border-(--border)"
                            }
                            onClick={() => {
                                setPage(1);
                                setStatusFilter("all");
                            }}
                        >
                            All statuses
                        </Button>
                        <Link
                            href="/admin/verifications"
                            className={cn(
                                buttonVariants({ variant: "outline", size: "sm" }),
                                "border-(--border)"
                            )}
                        >
                            Seller permits
                        </Link>
                    </div>
                </div>

                {loading ? (
                    <p className="text-sm text-(--muted)">Loading…</p>
                ) : rows.length === 0 ? (
                    <p className="rounded-lg border border-(--border) bg-(--surface) px-4 py-8 text-center text-sm text-(--muted)">
                        No {statusFilter === "pending" ? "pending" : ""} location requests.
                    </p>
                ) : (
                    <ul className="flex flex-col gap-4">
                        {rows.map((row) => (
                            <li
                                key={row.id}
                                className="rounded-xl border border-(--border) bg-[#080b10] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-5"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">
                                            {row.profile?.businessName ?? "Seller"}
                                        </p>
                                        <p className="text-xs text-(--muted)">{row.seller?.email}</p>
                                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                            Status:{" "}
                                            <span
                                                className={
                                                    row.status === "pending"
                                                        ? "text-amber-400"
                                                        : row.status === "approved"
                                                          ? "text-emerald-400"
                                                          : "text-red-300"
                                                }
                                            >
                                                {row.status}
                                            </span>
                                        </p>
                                    </div>
                                    {row.status === "pending" ? (
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="bg-(--accent) font-semibold text-[#050608]"
                                                onClick={() => void handleApprove(row.id)}
                                            >
                                                Approve pin
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                            Current pin (live)
                                        </p>
                                        <div className="mt-2">
                                            <AdminSellerLocationMap
                                                latitude={row.profile?.shopLatitude}
                                                longitude={row.profile?.shopLongitude}
                                                address={row.profile?.address}
                                                sectionHeading="Current"
                                                mapFrameClassName="relative z-0 h-44 w-full overflow-hidden rounded-lg border border-(--border)"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                            Requested pin
                                        </p>
                                        <div className="mt-2">
                                            <AdminSellerLocationMap
                                                latitude={row.requestedLatitude}
                                                longitude={row.requestedLongitude}
                                                address={row.profile?.address}
                                                sectionHeading="Requested"
                                                mapFrameClassName="relative z-0 h-44 w-full overflow-hidden rounded-lg border border-(--accent)/30"
                                            />
                                        </div>
                                        <p className="mt-2 text-xs tabular-nums text-(--muted)">
                                            {row.requestedLatitude.toFixed(5)},{" "}
                                            {row.requestedLongitude.toFixed(5)}
                                        </p>
                                    </div>
                                </div>

                                {row.note ? (
                                    <p className="mt-3 text-xs text-(--muted)">
                                        <span className="font-medium text-foreground">Seller note: </span>
                                        {row.note}
                                    </p>
                                ) : null}

                                {row.status === "rejected" && row.rejectionReason ? (
                                    <p className="mt-2 text-xs text-red-200/90">
                                        Reason: {row.rejectionReason}
                                    </p>
                                ) : null}

                                {row.status === "pending" ? (
                                    <div className="mt-4 border-t border-white/10 pt-4">
                                        <label
                                            className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)"
                                            htmlFor={`reject-reason-${row.id}`}
                                        >
                                            Decline note (required to decline)
                                        </label>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <Input
                                                id={`reject-reason-${row.id}`}
                                                value={rejectReasonById[row.id] ?? ""}
                                                onChange={(e) =>
                                                    setRejectReasonById((p) => ({
                                                        ...p,
                                                        [row.id]: e.target.value
                                                    }))
                                                }
                                                placeholder="Reason shown to seller context"
                                                className="max-w-md border-(--border) bg-[#050608] text-foreground"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="border-red-500/40 text-red-300"
                                                onClick={() => void handleReject(row.id)}
                                            >
                                                Decline
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}

                <AdminTablePagination
                    page={pg.page}
                    totalPages={pg.totalPages}
                    total={pg.total}
                    limit={pg.limit}
                    onPageChange={setPage}
                    disabled={loading}
                />
            </div>
            {confirmDialog}
        </AdminConsoleShell>
    );
}
