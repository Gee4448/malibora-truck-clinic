// Shimmer skeleton primitives — used while pages fetch data so layout
// doesn't jump when content arrives (reserve the same space).

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />
}

// Matches the client dashboard layout: hero, CTA, 4 stat tiles, two list cards.
export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-[74px] rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-xl" />
        ))}
      </div>
      <ListSkeleton rows={3} />
      <ListSkeleton rows={2} />
    </div>
  )
}

// Generic card-with-rows skeleton for list pages.
export function ListSkeleton({ rows = 4 }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="divide-y divide-gray-100">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
