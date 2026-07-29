import Image from "next/image";
import Link from "next/link";
import { LogoutButton } from "@/components/admin/LogoutButton";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gray-200 bg-[#0b1f3a]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-7 w-auto" />
            <span className="font-heading text-lg text-white">Finance Admin</span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-white/80">
            <Link href="/admin" className="hover:text-white">
              Submissions
            </Link>
            <Link href="/admin/vendors" className="hover:text-white">
              Vendors
            </Link>
            <Link href="/admin/staff" className="hover:text-white">
              Staff &amp; Authorities
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
