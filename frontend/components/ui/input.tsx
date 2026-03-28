import * as React from "react";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-(--border) bg-[#080b10] px-3 py-2 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:text-(--muted)",
        className,
      )}
      {...props}
    />
  );
}
