import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/account/AccountMenu";
import { NewSubmissionLink } from "@/components/account/NewSubmissionLink";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole, hasRole, hasTeamDashboardRole } from "@/lib/auth";

export const metadata: Metadata = { title: { absolute: "MCCIA Team Dashboard" } };

export default async function AuthorityLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  const isAuthorityContext = hasRole(session, "AUTHORITY");
  // A dual-role account (e.g. AUTHORITY + ALL) also gets a "Full Admin"
  // link here — the role switcher. Single-role accounts see nothing extra,
  // same header as before this feature existed.
  const showFullAdminSwitch = session ? hasFinanceRole(session) : false;
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gray-200 bg-[#0b1f3a]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/authority" className="flex items-center gap-3">
            <Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-7 w-auto" />
            <span className="font-heading text-lg text-white">{isAuthorityContext ? "Authority Recommendations" : "Team Dashboard"}</span>
          </Link>
          {session && hasTeamDashboardRole(session) ? (
            <div className="flex items-center gap-5 text-sm">
              {showFullAdminSwitch ? (
                <Link href="/admin" className="font-medium text-white/80 hover:text-white">
                  Full Admin
                </Link>
              ) : null}
              <NewSubmissionLink />
              <AccountMenu
                label={session.fullName}
                changePasswordHref="/authority/change-password"
                logoutEndpoint="/api/authority/logout"
                loginPath={isAuthorityContext ? "/authority/login" : "/team/login"}
              />
            </div>
          ) : null}
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
