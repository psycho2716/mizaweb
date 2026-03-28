import * as React from "react";
import { cn } from "@/lib/utils";

type SpanProps = React.HTMLAttributes<HTMLSpanElement>;

export function Badge({ className, ...props }: SpanProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-(--accent)/35 bg-(--accent)/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-(--accent)",
        className,
      )}
      {...props}
    />
  );
}
