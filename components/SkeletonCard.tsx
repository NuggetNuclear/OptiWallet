/**
 * Shared loading skeleton for list rows that show an icon + two text lines.
 * Used by TodaysFeed, MerchantSearch, and WalletSetup while their data loads.
 */
export function SkeletonCard({ iconSize = 11 }: { iconSize?: 10 | 11 }) {
  const icon = iconSize === 11 ? "h-11 w-11" : "h-10 w-10";
  return (
    <div className="animate-pulse rounded-2xl border border-line bg-bg-2 p-4">
      <div className="flex items-center gap-3">
        <div className={`${icon} rounded-xl bg-bg-3`} />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-bg-3" />
          <div className="h-3 w-20 rounded bg-bg-3" />
        </div>
      </div>
    </div>
  );
}
