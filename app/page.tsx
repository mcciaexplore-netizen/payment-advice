import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { PaymentAdviceForm } from "@/components/form/PaymentAdviceForm";
import { PublicLoginMenu } from "@/components/public/PublicLoginMenu";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const authorities = await db
    .select({
      id: recommendingAuthorities.id,
      authorityName: recommendingAuthorities.authorityName,
    })
    .from(recommendingAuthorities)
    .where(eq(recommendingAuthorities.isActive, true));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="relative flex flex-wrap items-start gap-4 border-b border-gray-200 pb-6">
        <div className="flex min-w-0 items-center gap-4 sm:pr-32">
          <Image
            src="/mccia-logo.png"
            alt="MCCIA logo"
            width={1085}
            height={258}
            className="h-14 w-auto"
          />
          <div>
            <h1 className="font-heading text-3xl text-[#0b1f3a]">
              Payment Advice
            </h1>
            <p className="text-sm text-gray-600">
              Finance &amp; Accounts Department — Mahratta Chamber of Commerce,
              Industries and Agriculture
            </p>
          </div>
        </div>
        <PublicLoginMenu />
      </header>

      <p className="rounded-md bg-[#0b1f3a]/5 px-4 py-3 text-sm text-[#0b1f3a]">
        Fill this form to request a payment. Fields marked <b>Required</b>{" "}
        must be completed. After submitting, you&apos;ll get a serial number
        and can download a summary — the finance team will review it and let
        you know if anything needs correcting.
      </p>

      <div className="flex flex-col gap-1 rounded-md border border-[#e8a33d]/40 bg-[#e8a33d]/10 px-4 py-3 text-sm text-[#8a5a12]">
        <p className="font-medium">Need an advance instead of a regular payment?</p>
        <p>
          If you need money in hand before you spend it — travel, event
          expenses, etc. — use the dedicated{" "}
          <Link href="/advance" className="font-medium underline underline-offset-2 hover:text-[#0b1f3a]">
            Advance Payment Request form →
          </Link>{" "}
          instead of this one.
        </p>
      </div>

      <PaymentAdviceForm mode="standard" recommendingAuthorities={authorities} />
    </main>
  );
}
