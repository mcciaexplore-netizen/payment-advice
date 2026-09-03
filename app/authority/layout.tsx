import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/account/AccountMenu";
import { getAdminSession } from "@/lib/admin-session";

export const metadata: Metadata = { title: { absolute: "MCCIA Authority Approvals" } };

export default async function AuthorityLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gray-200 bg-[#0b1f3a]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/authority" className="flex items-center gap-3">
            <Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-7 w-auto" />
            <span className="font-heading text-lg text-white">Authority Approvals</span>
          </Link>
          {session?.adminRole === "AUTHORITY" ? (
            <div className="flex items-center text-sm">
              <AccountMenu
                label={session.fullName}
                changePasswordHref="/authority/change-password"
                logoutEndpoint="/api/authority/logout"
                loginPath="/authority/login"
              />
            </div>
          ) : null}
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
