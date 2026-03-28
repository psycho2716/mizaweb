import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-(--surface-elevated) ring-1 ring-white/[0.04]",
        className,
      )}
    />
  );
}
