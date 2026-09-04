import { sentBackStatus } from "@/lib/advice/send-back-status";

export function SentBackIndicators({
  sentBackAt,
  editTokenExpiresAt,
}: {
  sentBackAt: Date | null;
  editTokenExpiresAt: Date | null;
}) {
  const status = sentBackStatus(sentBackAt, editTokenExpiresAt);
  if (!status) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`rounded-full px-2 py-1 text-xs font-medium ${
          status.isStale ? "bg-amber-100 text-amber-900" : "bg-gray-100 text-gray-700"
        }`}
      >
        {status.label}
      </span>
      {status.isExpired ? (
        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
          Edit link expired
        </span>
      ) : null}
    </div>
  );
}
