"use client";

import { AdminSellerLocationMap } from "@/components/admin/admin-seller-location-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminVerificationExpandedPanelProps } from "@/types";

export function AdminVerificationExpandedPanel({
  entry,
  rejectReasonById,
  onRejectReasonChange,
  onReject
}: AdminVerificationExpandedPanelProps) {
  return (
    <>
      <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-(--accent)">
        Seller details
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2.5 rounded-md border border-(--border) bg-(--surface) p-4 text-xs text-(--muted)">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">Account</p>
          <p>
            <span className="font-semibold text-foreground">Seller account ID: </span>
            <span className="font-mono text-[11px]">{entry.sellerId}</span>
          </p>
          <p>
            <span className="font-semibold text-foreground">Email: </span>
            {entry.seller?.email ?? "—"}
          </p>
          <p>
            <span className="font-semibold text-foreground">Full name: </span>
            {entry.seller?.fullName ?? "—"}
          </p>
          <p>
            <span className="font-semibold text-foreground">Permit request ID: </span>
            <span className="font-mono text-[11px]">{entry.id}</span>
          </p>
          <p>
            <span className="font-semibold text-foreground">Status: </span>
            Waiting for review
          </p>
        </div>
        <div className="space-y-2.5 rounded-md border border-(--border) bg-(--surface) p-4 text-xs text-(--muted)">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
            Business profile
          </p>
          <p>
            <span className="font-semibold text-foreground">Business name: </span>
            {entry.profile?.businessName ?? "—"}
          </p>
          <p>
            <span className="font-semibold text-foreground">Contact number: </span>
            {entry.profile?.contactNumber ?? "—"}
          </p>
          <p>
            <span className="font-semibold text-foreground">Address: </span>
            {entry.profile?.address ?? "—"}
          </p>
          {entry.profile ? (
            <AdminSellerLocationMap
              latitude={entry.profile.shopLatitude}
              longitude={entry.profile.shopLongitude}
              address={entry.profile.address}
              className="mt-3 border-t border-(--border) pt-3"
            />
          ) : null}
          {entry.profile?.profileImageUrl ? (
            <p>
              <span className="font-semibold text-foreground">Profile image: </span>
              <a
                href={entry.profile.profileImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-(--accent) hover:underline"
              >
                Open link
              </a>
            </p>
          ) : null}
          {entry.profile?.storeBackgroundUrl ? (
            <p>
              <span className="font-semibold text-foreground">Store background: </span>
              <a
                href={entry.profile.storeBackgroundUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-(--accent) hover:underline"
              >
                Open link
              </a>
            </p>
          ) : null}
        </div>
        <div className="space-y-2.5 rounded-md border border-(--border) bg-(--surface) p-4 text-xs text-(--muted)">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
            Permit & payouts
          </p>
          {entry.permitObjectPath ? (
            <p>
              <span className="font-semibold text-foreground">File path (system): </span>
              <span className="break-all font-mono text-[10px]">{entry.permitObjectPath}</span>
            </p>
          ) : null}
          <p>
            <span className="font-semibold text-foreground">Permit link: </span>
            <span className="break-all font-mono text-[10px]" title={entry.permitFileUrl}>
              {entry.permitFileUrl.length > 96
                ? `${entry.permitFileUrl.slice(0, 96)}…`
                : entry.permitFileUrl}
            </span>
          </p>
          {entry.note ? (
            <p>
              <span className="font-semibold text-foreground">Seller note: </span>
              {entry.note}
            </p>
          ) : (
            <p>
              <span className="font-semibold text-foreground">Seller note: </span>
              —
            </p>
          )}
          <div className="border-t border-(--border) pt-2">
            <p className="mb-1 font-semibold text-foreground">
              Payout methods ({entry.paymentMethods.length})
            </p>
            {entry.paymentMethods.length === 0 ? (
              <p>None on file.</p>
            ) : (
              <ul className="list-inside list-disc space-y-1">
                {entry.paymentMethods.map((m) => (
                  <li key={m.id}>
                    {m.methodName} · {m.accountName} ({m.accountNumber})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 border-t border-(--border) pt-4 md:max-w-xl">
        <Label
          htmlFor={`reject-${entry.id}`}
          className="text-[10px] uppercase tracking-[0.14em] text-(--muted)"
        >
          Decline and ask for a new permit
        </Label>
        <Input
          id={`reject-${entry.id}`}
          value={rejectReasonById[entry.id] ?? ""}
          onChange={(event) => onRejectReasonChange(entry.id, event.target.value)}
          placeholder="Explain what the seller should fix (required to decline)"
          className="mt-2 border-(--border) bg-(--surface) text-foreground"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3 border-red-500/40 text-red-400 hover:bg-red-500/10"
          onClick={() => void onReject(entry.id)}
        >
          Decline request
        </Button>
      </div>
    </>
  );
}
