"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConfirmDialogOptions } from "@/types";

type DialogState = ConfirmDialogOptions;

export function useConfirmDialog() {
  const [state, setState] = useState<DialogState | null>(null);
  const [mounted, setMounted] = useState(false);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const finish = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, finish]);

  const requestConfirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState(options);
    });
  }, []);

  const dialog =
    mounted && state && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4"
            onClick={() => finish(false)}
            role="presentation"
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby={state.description ? "confirm-dialog-desc" : undefined}
              className={cn(
                "w-full max-w-md rounded-md border border-(--border) bg-[#0a0d12] p-5 shadow-xl",
                "text-foreground"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="confirm-dialog-title" className="text-base font-semibold text-foreground">
                {state.title}
              </h2>
              {state.description ? (
                <p id="confirm-dialog-desc" className="mt-2 text-sm text-(--muted)">
                  {state.description}
                </p>
              ) : null}
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-(--border) bg-transparent text-foreground hover:bg-(--surface-elevated)"
                  autoFocus={Boolean(state.destructive)}
                  onClick={() => finish(false)}
                >
                  {state.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  type="button"
                  className={cn(
                    state.destructive
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-zinc-100 text-zinc-900 hover:bg-white"
                  )}
                  autoFocus={!state.destructive}
                  onClick={() => finish(true)}
                >
                  {state.confirmLabel ?? "Confirm"}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return { requestConfirm, dialog };
}
