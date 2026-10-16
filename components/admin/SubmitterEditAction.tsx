import Link from "next/link";
import { isEditTokenExpired } from "@/lib/advice/send-back-status";

/** A submitter-only shortcut to the same one-time resubmission URL sent by email. */
export function SubmitterEditAction({
  status,
  editToken,
  editTokenExpiresAt,
}: {
  status: string;
  editToken: string | null;
  editTokenExpiresAt: Date | null;
}) {
  if (status !== "SENT_BACK") return null;

  if (!editToken || isEditTokenExpired(editTokenExpiresAt)) {
    return <span className="text-xs text-red-700">Edit link expired</span>;
  }

  return (
    <Link href={`/edit/${editToken}`} className="inline-flex rounded-md bg-[#0b1f3a] px-3 py-2 text-xs font-medium text-white hover:bg-[#17375f]">
      Edit &amp; Resubmit
    </Link>
  );
}
