"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminSellerLocationMap } from "@/components/admin/admin-seller-location-map";
import { AdminConsoleShell } from "@/components/admin/admin-console-shell";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import {
  deleteAdminUser,
  getAdminUserDetail,
  listAdminUsers,
  suspendAdminUser,
  unsuspendAdminUser
} from "@/lib/api/endpoints";
import { formatVerificationStatusLabel } from "@/lib/admin-display";
import type { AdminUserDetailData, AdminUserListItem, ListPaginationMeta } from "@/types";

const PAGE_SIZE = 10;

function readStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("miza_user");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string };
    return typeof parsed.id === "string" ? parsed.id : null;
  } catch {
    return null;
  }
}

function roleLabel(role: AdminUserListItem["role"]): string {
  if (role === "admin") return "Admin";
  if (role === "seller") return "Seller";
  return "Buyer";
}

export default function AdminUsersPage() {
  const { requestConfirm, dialog: confirmDialog } = useConfirmDialog();
  const [rows, setRows] = useState<AdminUserListItem[]>([]);
  const [pagination, setPagination] = useState<ListPaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AdminUserDetailData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);

  const load = useCallback(
    async (requestedPage: number, opts?: { showSuccessToast?: boolean }) => {
      setLoading(true);
      try {
        const res = await listAdminUsers({ page: requestedPage, limit: PAGE_SIZE });
        setRows(res.data);
        setPagination(res.pagination);
        if (res.pagination.page !== requestedPage) {
          setPage(res.pagination.page);
        }
        if (opts?.showSuccessToast) {
          toast.success("Users list refreshed.");
        }
      } catch {
        setRows([]);
        setPagination(null);
        toast.error("Could not load users.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setSelfId(readStoredUserId());
  }, []);

  useEffect(() => {
    void load(page);
  }, [page, load]);

  async function openProfile(userId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await getAdminUserDetail(userId);
      setDetail(res.data);
      toast.success("Profile loaded.");
    } catch {
      toast.error("Could not load profile.");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  async function onSuspend(id: string) {
    const ok = await requestConfirm({
      title: "Suspend this account?",
      description: "They will be blocked from signing in until you lift the suspension.",
      confirmLabel: "Suspend",
      destructive: true
    });
    if (!ok) return;
    try {
      await suspendAdminUser(id);
      toast.success("Account suspended.");
      await load(page);
      if (detail?.user.id === id) {
        setDetail((d) => (d ? { ...d, user: { ...d.user, suspended: true } } : d));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suspend failed");
    }
  }

  async function onUnsuspend(id: string) {
    const ok = await requestConfirm({
      title: "Lift suspension?",
      description: "This account will be able to sign in again.",
      confirmLabel: "Unsuspend"
    });
    if (!ok) return;
    try {
      await unsuspendAdminUser(id);
      toast.success("Suspension lifted.");
      await load(page);
      if (detail?.user.id === id) {
        const { suspended: _x, ...rest } = detail.user;
        setDetail((d) => (d ? { ...d, user: rest } : d));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unsuspend failed");
    }
  }

  async function onDelete(id: string, email: string) {
    const ok = await requestConfirm({
      title: "Delete account permanently?",
      description: `This will remove ${email}. This cannot be undone.`,
      confirmLabel: "Delete account",
      destructive: true
    });
    if (!ok) return;
    try {
      await deleteAdminUser(id);
      toast.success("Account deleted.");
      setDetailOpen(false);
      setDetail(null);
      await load(page);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const pg = pagination ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  const verificationSubmissionsToShow = useMemo(() => {
    if (!detail?.verifications.length) return [];
    if (detail.verificationStatus === "approved") {
      return detail.verifications.filter((v) => v.status !== "rejected");
    }
    return detail.verifications;
  }, [detail]);

  return (
    <AdminConsoleShell activeNav="users">
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">User accounts</h1>
            <p className="text-xs text-(--muted)">
              Suspend, unsuspend, delete accounts, or open a profile summary.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(page, { showSuccessToast: true })}
            disabled={loading}
            className="text-xs font-semibold uppercase tracking-wider text-(--accent) hover:underline disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <section className="overflow-hidden rounded-md border border-(--border) bg-(--surface)">
          <div>
            {loading && rows.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-(--muted)">Loading users…</div>
            ) : rows.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-(--muted)">No users found.</div>
            ) : (
              <>
                <div className="md:hidden">
                  <div className="space-y-3 p-3">
                  {rows.map((row) => {
                    const isSelf = row.id === selfId;
                    return (
                      <div
                        key={row.id}
                        className="rounded-md border border-(--border) bg-(--surface) p-4 shadow-sm"
                      >
                        <p className="font-medium text-foreground">{row.email}</p>
                        {row.fullName ? (
                          <p className="mt-0.5 text-xs text-(--muted)">{row.fullName}</p>
                        ) : null}
                        <p className="mt-1 font-mono text-[10px] text-(--muted)">{row.id}</p>
                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-(--muted)">
                          <span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                              Role
                            </span>
                            <span className="ml-1.5 text-foreground">{roleLabel(row.role)}</span>
                          </span>
                          {row.role === "seller" ? (
                            <span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                Permit status
                              </span>
                              <span className="ml-1.5 text-foreground">
                                {formatVerificationStatusLabel(row.verificationStatus)}
                              </span>
                            </span>
                          ) : null}
                          <span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                              Account
                            </span>
                            <span className="ml-1.5">
                              {row.suspended ? (
                                <span className="font-medium text-amber-400">Suspended</span>
                              ) : (
                                <span className="text-foreground">Active</span>
                              )}
                            </span>
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 border-(--border) bg-transparent text-xs"
                            onClick={() => void openProfile(row.id)}
                          >
                            Profile
                          </Button>
                          {row.suspended ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 border-(--accent)/40 text-xs text-(--accent)"
                              disabled={isSelf}
                              onClick={() => void onUnsuspend(row.id)}
                            >
                              Unsuspend
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 border-amber-500/40 text-xs text-amber-400"
                              disabled={isSelf}
                              onClick={() => void onSuspend(row.id)}
                            >
                              Suspend
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 border-red-500/40 text-xs text-red-400"
                            disabled={isSelf}
                            onClick={() => void onDelete(row.id, row.email)}
                          >
                            Delete
                          </Button>
                        </div>
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
                    disabled={loading}
                  />
                </div>
                <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-(--border) text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                    <th className="px-4 py-3 md:px-5">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Seller verification</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isSelf = row.id === selfId;
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-(--border) bg-(--surface) hover:bg-(--surface-elevated)/40"
                      >
                        <td className="px-4 py-3 md:px-5">
                          <span className="font-medium text-foreground">{row.email}</span>
                          {row.fullName ? (
                            <span className="mt-0.5 block text-xs text-(--muted)">{row.fullName}</span>
                          ) : null}
                          <span className="mt-1 block font-mono text-[10px] text-(--muted)">{row.id}</span>
                        </td>
                        <td className="px-4 py-3 align-top text-(--muted)">{roleLabel(row.role)}</td>
                        <td className="px-4 py-3 align-top text-(--muted)">
                          {row.role === "seller"
                            ? formatVerificationStatusLabel(row.verificationStatus)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {row.suspended ? (
                            <span className="text-xs font-medium text-amber-400">Suspended</span>
                          ) : (
                            <span className="text-xs text-(--muted)">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 border-(--border) bg-transparent text-xs"
                              onClick={() => void openProfile(row.id)}
                            >
                              Profile
                            </Button>
                            {row.suspended ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-(--accent)/40 text-xs text-(--accent)"
                                disabled={isSelf}
                                onClick={() => void onUnsuspend(row.id)}
                              >
                                Unsuspend
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-amber-500/40 text-xs text-amber-400"
                                disabled={isSelf}
                                onClick={() => void onSuspend(row.id)}
                              >
                                Suspend
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 border-red-500/40 text-xs text-red-400"
                              disabled={isSelf}
                              onClick={() => void onDelete(row.id, row.email)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
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
                    disabled={loading}
                  />
                </div>
              </>
            )}
          </div>

          {(loading && rows.length === 0) || rows.length === 0 ? (
            <AdminTablePagination
              page={pg.page}
              totalPages={pg.totalPages}
              total={pg.total}
              limit={pg.limit}
              onPageChange={setPage}
              disabled={loading}
            />
          ) : null}
        </section>
      </div>

      {detailOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-user-profile-title"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-md border border-(--border) bg-[#0a0d12] p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2 id="admin-user-profile-title" className="text-base font-semibold text-foreground">
                User profile
              </h2>
              <button
                type="button"
                onClick={() => {
                  setDetailOpen(false);
                  setDetail(null);
                }}
                className="rounded-md px-2 py-1 text-xs text-(--muted) hover:bg-(--surface-elevated) hover:text-foreground"
              >
                Close
              </button>
            </div>
            {detailLoading ? (
              <p className="mt-6 text-sm text-(--muted)">Loading…</p>
            ) : detail ? (
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex flex-col gap-4 border-b border-(--border) pb-4 sm:flex-row sm:items-start">
                  {detail.profile?.profileImageUrl ? (
                    <img
                      src={detail.profile.profileImageUrl}
                      alt={`Profile photo — ${detail.user.email}`}
                      className="mx-auto h-24 w-24 shrink-0 rounded-full border border-(--border) object-cover sm:mx-0"
                    />
                  ) : (
                    <div className="mx-auto flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-dashed border-(--border) bg-(--surface) text-center text-[10px] font-semibold uppercase tracking-wider text-(--muted) sm:mx-0">
                      No photo
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1 text-(--muted)">
                    <p>
                      <span className="font-semibold text-foreground">Email: </span>
                      {detail.user.email}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Role: </span>
                      {roleLabel(detail.user.role)}
                    </p>
                    {detail.user.fullName ? (
                      <p>
                        <span className="font-semibold text-foreground">Name: </span>
                        {detail.user.fullName}
                      </p>
                    ) : null}
                    <p>
                      <span className="font-semibold text-foreground">Account: </span>
                      {detail.user.suspended ? "Suspended" : "Active"}
                    </p>
                    {detail.verificationStatus ? (
                      <p>
                        <span className="font-semibold text-foreground">Permit status: </span>
                        {formatVerificationStatusLabel(detail.verificationStatus)}
                      </p>
                    ) : null}
                  </div>
                </div>
                {detail.profile ? (
                  <div className="rounded-md border border-(--border) bg-(--surface) p-3 text-xs text-(--muted)">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                      Business
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Business name: </span>
                      <span className="text-foreground">{detail.profile.businessName}</span>
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold text-foreground">Phone number: </span>
                      {detail.profile.contactNumber}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold text-foreground">Location / address: </span>
                      {detail.profile.address}
                    </p>
                    <AdminSellerLocationMap
                      latitude={detail.profile.shopLatitude}
                      longitude={detail.profile.shopLongitude}
                      address={detail.profile.address}
                      className="mt-3 border-t border-(--border) pt-3"
                    />
                  </div>
                ) : null}
                {detail.paymentMethods.length > 0 ? (
                  <div className="rounded-md border border-(--border) bg-(--surface) p-3 text-xs">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                      Payout methods
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-(--muted)">
                      {detail.paymentMethods.map((m) => (
                        <li key={m.id}>
                          {m.methodName} · {m.accountName}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {verificationSubmissionsToShow.length > 0 ? (
                  <div className="rounded-md border border-(--border) bg-(--surface) p-3 text-xs text-(--muted)">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                      Past permit submissions
                    </p>
                    <ul className="space-y-2">
                      {verificationSubmissionsToShow.map((v) => (
                        <li key={v.id} className="border-b border-(--border) pb-2 last:border-0">
                          <span className="font-medium text-foreground">
                            {formatVerificationStatusLabel(v.status)}
                          </span>
                          {v.rejectionReason ? (
                            <span className="mt-1 block text-amber-400/90">{v.rejectionReason}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  {detail.user.id !== selfId ? (
                    <>
                      {detail.user.suspended ? (
                        <Button
                          type="button"
                          size="sm"
                          className="bg-(--accent) text-[#031018]"
                          onClick={() => void onUnsuspend(detail.user.id)}
                        >
                          Unsuspend
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-amber-500/50 text-amber-400"
                          onClick={() => void onSuspend(detail.user.id)}
                        >
                          Suspend
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-red-500/50 text-red-400"
                        onClick={() => void onDelete(detail.user.id, detail.user.email)}
                      >
                        Delete account
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-(--muted)">You cannot modify your own account here.</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {confirmDialog}
    </AdminConsoleShell>
  );
}
