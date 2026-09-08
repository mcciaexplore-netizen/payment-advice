import Link from "next/link";

/** Shared across the Finance Admin, Authority, and Branch/Department
 * dashboard headers. Opens the public Payment Desk landing screen in a new
 * tab — submission has always been a separate, login-optional public flow,
 * so this is purely a navigation shortcut. No auth/session interaction: the
 * dashboard tab is left exactly as it was. */
export function NewSubmissionLink() {
  return (
    <Link
      href="/"
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-md border border-white/30 px-3 py-1.5 text-sm font-medium text-white/80 hover:border-white/50 hover:text-white"
    >
      + New Submission
    </Link>
  );
}
