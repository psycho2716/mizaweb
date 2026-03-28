"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminTablePaginationProps } from "@/types";

const navBtnClass = cn(
  "inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-md border-2 border-zinc-500/75 bg-[#11151c] p-0 text-(--accent)",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors",
  "hover:border-(--accent) hover:bg-(--accent)/14 hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0d12]",
  "disabled:pointer-events-none disabled:border-zinc-700 disabled:bg-[#0c0f14] disabled:text-zinc-500 disabled:opacity-100"
);

export function AdminTablePagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  disabled,
  className
}: AdminTablePaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-(--border) bg-(--surface) px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5",
        className
      )}
    >
      <p className="text-xs text-(--muted)">
        {total === 0 ? (
          "No rows"
        ) : (
          <>
            Showing <span className="tabular-nums text-foreground">{from}</span>
            {" – "}
            <span className="tabular-nums text-foreground">{to}</span> of{" "}
            <span className="tabular-nums text-foreground">{total}</span>
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-(--muted)">
          Page <span className="tabular-nums text-foreground">{page}</span> of{" "}
          <span className="tabular-nums text-foreground">{totalPages}</span>
        </span>
        <button
          type="button"
          className={navBtnClass}
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
        <button
          type="button"
          className={navBtnClass}
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}
