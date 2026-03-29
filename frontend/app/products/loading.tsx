import { Skeleton } from "@/components/ui/skeleton";

export default function ProductsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:py-12">
      <Skeleton className="mb-6 h-3 w-48" />
      <div className="lg:grid lg:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)] lg:gap-12">
        <aside className="mb-10 hidden lg:block">
          <Skeleton className="h-96 w-full rounded-2xl" />
        </aside>
        <div>
          <Skeleton className="mb-4 h-4 w-32" />
          <Skeleton className="mb-8 h-14 max-w-xl" />
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-80 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
