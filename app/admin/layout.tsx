import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { getAdminSession } from "@/lib/admin-session";
import { hasRole } from "@/lib/auth";
import { getPendingVendorRequestCount } from "@/lib/advice/vendor-requests";

const ROLE_LABELS: Record<string, string> = {
  PAYMENT_ADVICE: "Payment Advice",
  CASH_VOUCHER: "Cash Voucher",
  ALL: "All Access",
  AUTHORITY: "Authority",
  BRANCH: "Branch",
  DEPARTMENT: "Department",
};

/** Single-role accounts (the common case) see exactly the label they always
 * have — `${name} · ${label}` — no visible change from before multi-role
 * support existed. An account with more than one role (e.g. Chintamani:
 * AUTHORITY + ALL) sees every held role joined with " + ". */
function roleSummaryLabel(fullName: string, roles: string[]): string {
  const labels = roles.map((r) => ROLE_LABELS[r] ?? r);
  return `${fullName} · ${labels.join(" + ")}`;
}

// `absolute` bypasses the root layout's "%s · MCCIA Payment Advice" title
// template entirely, so admin tabs read "MCCIA Finance Admin" rather than
// "MCCIA Finance Admin · MCCIA Payment Advice" — the two sections need to
// look unmistakably different in a browser's tab strip, not like one is a
// sub-page of the other. The `template` here scopes any future per-page
// admin titles (e.g. "Vendors · MCCIA Finance Admin") the same way.
export const metadata: Metadata = {
  title: {
    absolute: "MCCIA Finance Admin",
    template: "%s · MCCIA Finance Admin",
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  const pendingVendorRequestCount = session ? await getPendingVendorRequestCount() : 0;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gray-200 bg-[#0b1f3a]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3">
          <Link href="/admin" className="flex shrink-0 items-center gap-3 whitespace-nowrap">
            <Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-7 w-auto shrink-0" />
            <span className="font-heading text-lg text-white whitespace-nowrap">Finance Admin</span>
          </Link>
          {session ? (
            <AdminNav
              roleLabel={roleSummaryLabel(session.fullName, session.roles)}
              changePasswordHref="/admin/change-password"
              authorityHref={hasRole(session, "AUTHORITY") ? "/authority" : null}
              pendingVendorRequestCount={pendingVendorRequestCount}
            />
          ) : null}
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
