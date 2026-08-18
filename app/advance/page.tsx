import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { PaymentAdviceForm } from "@/components/form/PaymentAdviceForm";

export const dynamic = "force-dynamic";

export default async function AdvancePage() {
  const authorities = await db
    .select({
      id: recommendingAuthorities.id,
      authorityName: recommendingAuthorities.authorityName,
    })
    .from(recommendingAuthorities)
    .where(eq(recommendingAuthorities.isActive, true));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex items-center gap-4 border-b border-gray-200 pb-6">
        <Image
          src="/mccia-logo.png"
          alt="MCCIA logo"
          width={1085}
          height={258}
          className="h-14 w-auto"
        />
        <div>
          <h1 className="font-heading text-3xl text-[#0b1f3a]">
            Advance Payment Request
          </h1>
          <p className="text-sm text-gray-600">
            Finance &amp; Accounts Department — Mahratta Chamber of Commerce,
            Industries and Agriculture
          </p>
        </div>
      </header>

      <p className="rounded-md bg-[#0b1f3a]/5 px-4 py-3 text-sm text-[#0b1f3a]">
        Use this form to request money in hand before you spend it — the
        advance is paid to you, the requester. Fields marked <b>Required</b>{" "}
        must be completed. After submitting, you&apos;ll get an advance
        number and can download a summary — the finance team will review it
        and let you know if anything needs correcting.
      </p>

      <p className="text-sm text-gray-600">
        Requesting payment for a bill or invoice instead?{" "}
        <Link href="/" className="font-medium text-[#0b1f3a] underline underline-offset-2">
          Use the regular Payment Advice form →
        </Link>
      </p>

      <PaymentAdviceForm mode="advance" recommendingAuthorities={authorities} />
    </main>
  );
}
