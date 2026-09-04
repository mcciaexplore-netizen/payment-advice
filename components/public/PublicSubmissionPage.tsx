import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { PaymentAdviceForm } from "@/components/form/PaymentAdviceForm";
import { PublicLoginMenu } from "@/components/public/PublicLoginMenu";

export async function PublicSubmissionPage({ type }: { type: "payment-advice" | "cash-voucher" }) {
  const authorities = await db.select({ id: recommendingAuthorities.id, authorityName: recommendingAuthorities.authorityName }).from(recommendingAuthorities).where(eq(recommendingAuthorities.isActive, true));
  const title = type === "payment-advice" ? "Payment Advice" : "Cash Payment Voucher";
  return <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10"><header className="relative flex flex-wrap items-start gap-4 border-b border-gray-200 pb-6"><div className="flex min-w-0 items-center gap-4 sm:pr-32"><Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-14 w-auto" /><div><h1 className="font-heading text-3xl text-[#0b1f3a]">{title}</h1><p className="text-sm text-gray-600">Payment Desk — Finance &amp; Accounts Department</p></div></div><PublicLoginMenu /></header><Link href="/" className="w-fit text-sm font-medium text-gray-600 hover:text-[#0b1f3a]">← Back to Payment Desk</Link><p className="rounded-md bg-[#0b1f3a]/5 px-4 py-3 text-sm text-[#0b1f3a]">Fill this form to request a payment. Fields marked <b>Required</b> must be completed. After submitting, you&apos;ll receive a reference number.</p><PaymentAdviceForm mode={type} recommendingAuthorities={authorities} /></main>;
}
