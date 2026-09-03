import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/account/AccountMenu";
import { getAdminSession } from "@/lib/admin-session";

const ROLE_LABELS: Record<string, string> = {
  PAYMENT_ADVICE: "Payment Advice",
  CASH_VOUCHER: "Cash Voucher",
  ALL: "All Access",
};

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

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gray-200 bg-[#0b1f3a]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/admin" className="flex items-center gap-3">
            <Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-7 w-auto" />
            <span className="font-heading text-lg text-white">Finance Admin</span>
          </Link>
          {session ? (
            <nav className="flex items-center gap-6 text-sm text-white/80">
              <Link href="/admin" className="hover:text-white">
                Dashboard
              </Link>
              <Link href="/admin/submissions" className="hover:text-white">
                Submissions
              </Link>
              <Link href="/admin/vendors" className="hover:text-white">
                Vendors
              </Link>
              <Link href="/admin/staff" className="hover:text-white">
                Staff &amp; Authorities
              </Link>
              <div className="border-l border-white/20 pl-6">
                <AccountMenu
                  label={`${session.fullName} · ${ROLE_LABELS[session.adminRole] ?? session.adminRole}`}
                  changePasswordHref="/admin/change-password"
                />
              </div>
            </nav>
          ) : null}
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
