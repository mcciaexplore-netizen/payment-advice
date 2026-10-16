import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { RefundForm } from "@/components/form/RefundForm";
import { PublicLoginMenu } from "@/components/public/PublicLoginMenu";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { notFound } from "next/navigation";
import { refundEntryVisible, refundRequestsEnabled } from "@/lib/refund-requests";

export const dynamic = "force-dynamic";

export default async function RefundPage() {
  if (!refundEntryVisible()) notFound();
  const persist = refundRequestsEnabled();
  let authorities: string[] = [];
  try {
    authorities = (await db.select({ authorityName: recommendingAuthorities.authorityName })
      .from(recommendingAuthorities)
      .where(eq(recommendingAuthorities.isActive, true))).map((authority) => authority.authorityName);
  } catch (error) {
    console.warn("[Refund] recommending authority lookup unavailable", error);
  }
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="relative flex flex-wrap items-start gap-4 border-b border-gray-200 pb-6">
        <div className="flex min-w-0 items-center gap-4 sm:pr-32">
          <Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-14 w-auto" />
          <div><h1 className="font-heading text-3xl text-[#0b1f3a]">Refund Request</h1><p className="text-sm text-gray-600">Payment Desk - Finance &amp; Accounts Department</p></div>
        </div>
        <PublicLoginMenu />
      </header>
      <Link href="/" className="w-fit text-sm font-medium text-gray-600 hover:text-[#0b1f3a]">← Back to Payment Desk</Link>
      {persist ? null : <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Preview mode: Refund requests are not switched on yet, so nothing you enter here is saved.</p>}
      <RefundForm authorityOptions={authorities} persist={persist} />
    </main>
  );
}
