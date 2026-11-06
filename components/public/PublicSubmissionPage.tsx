import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { PaymentAdviceForm } from "@/components/form/PaymentAdviceForm";
import { PublicLoginMenu } from "@/components/public/PublicLoginMenu";

export async function PublicSubmissionPage({ type }: { type: "payment-advice" | "cash-voucher" | "reimbursement" }) {
  // Keep the local form available when the optional development database is
  // unavailable. Submission itself still reports its database status safely.
  let authorities: { id: string; authorityName: string }[] = [];
  try {
    authorities = await db.select({ id: recommendingAuthorities.id, authorityName: recommendingAuthorities.authorityName }).from(recommendingAuthorities).where(eq(recommendingAuthorities.isActive, true));
  } catch (error) {
    console.warn("[Payment Desk] authority lookup unavailable; rendering with no authority options", error);
  }
  // Local preview only: with no database configured there are no authorities
  // to pick, so the form could never validate. Never applies in production or
  // when a DATABASE_URL is set.
  const localPreview = process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
  if (authorities.length === 0 && localPreview) {
    authorities = [{ id: "00000000-0000-4000-8000-000000000001", authorityName: "Test Authority (local preview)" }];
  }
  const title = type === "payment-advice" ? "Payment Advice" : type === "reimbursement" ? "Reimbursement" : "Cash Payment Voucher";
  return <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10"><header className="relative flex flex-wrap items-start gap-4 border-b border-gray-200 pb-6"><div className="flex min-w-0 items-center gap-4 sm:pr-32"><Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-14 w-auto" /><div><h1 className="font-heading text-3xl text-[#0b1f3a]">{title}</h1><p className="text-sm text-gray-600">Payment Desk - Finance &amp; Accounts Department</p></div></div><PublicLoginMenu /></header><Link href="/" className="w-fit text-sm font-medium text-gray-600 hover:text-[#0b1f3a]">← Back to Payment Desk</Link><p className="rounded-md bg-[#0b1f3a]/5 px-4 py-3 text-sm text-[#0b1f3a]">Fill this form to request a payment. Fields marked <b>Required</b> must be completed. After submitting, you&apos;ll receive a reference number.</p><PaymentAdviceForm mode={type} recommendingAuthorities={authorities} localPreview={localPreview} /></main>;
}
