const DAY_MS = 24 * 60 * 60 * 1000;

export const SENT_BACK_STALE_AFTER_DAYS = 7;

export function sentBackStatus(
  sentBackAt: Date | null,
  editTokenExpiresAt: Date | null,
  now = new Date(),
) {
  if (!sentBackAt) return null;
  const daysAgo = Math.max(0, Math.floor((now.getTime() - sentBackAt.getTime()) / DAY_MS));
  return {
    daysAgo,
    label: `Sent back ${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago`,
    isStale: daysAgo > SENT_BACK_STALE_AFTER_DAYS,
    isExpired: !editTokenExpiresAt || editTokenExpiresAt.getTime() <= now.getTime(),
  };
}
