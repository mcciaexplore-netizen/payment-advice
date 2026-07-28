import clsx from "clsx";
import { Status } from "@/lib/validation/payment-advice";

const STYLES: Record<Status, string> = {
  SUBMITTED: "bg-[#e8a33d]/15 text-[#8a5a12] border-[#e8a33d]/40",
  SENT_BACK: "bg-gray-100 text-gray-600 border-gray-300",
  APPROVED: "bg-[#2e8b57]/15 text-[#1e5c39] border-[#2e8b57]/40",
};

const LABELS: Record<Status, string> = {
  SUBMITTED: "Submitted",
  SENT_BACK: "Sent Back",
  APPROVED: "Approved",
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STYLES[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}
