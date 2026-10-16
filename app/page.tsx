import Image from "next/image";
import Link from "next/link";
import { PublicLoginMenu } from "@/components/public/PublicLoginMenu";
import { NSW_BRANCH_LOGIN_URL } from "@/lib/external-links";
import { refundEntryVisible } from "@/lib/refund-requests";

type Accent = "green" | "amber" | "violet" | "blue" | "rose" | "teal";
type ChoiceCardProps = { href: string; title: string; description: string; accent: Accent };

const ACCENTS: Record<Accent, { border: string; bar: string }> = {
  green: { border: "border-[#2e8b57]/35 hover:border-[#2e8b57]", bar: "bg-[#2e8b57]" },
  amber: { border: "border-[#e8a33d]/45 hover:border-[#e8a33d]", bar: "bg-[#e8a33d]" },
  violet: { border: "border-violet-300 hover:border-violet-600", bar: "bg-violet-600" },
  blue: { border: "border-sky-300 hover:border-sky-600", bar: "bg-sky-600" },
  rose: { border: "border-rose-300 hover:border-rose-600", bar: "bg-rose-600" },
  teal: { border: "border-teal-300 hover:border-teal-600", bar: "bg-teal-600" },
};

const paymentAdvice: ChoiceCardProps = { href: "/payment-advice", title: "Payment Advice", description: "For payments made by NEFT to a vendor or beneficiary.", accent: "green" };
const cashVoucher: ChoiceCardProps = { href: "/cash-voucher", title: "Cash Payment Voucher", description: "For cash reimbursements paid directly to the submitter.", accent: "amber" };
const advance: ChoiceCardProps = { href: "/advance", title: "Advance Payment Form", description: "For money needed before travel, events, or other planned expenses.", accent: "violet" };
const forwardingMemo: ChoiceCardProps = { href: "/forwarding-memo", title: "Forwarding Memo", description: "For forwarding cheques, demand drafts, and other instruments to Accounts.", accent: "green" };
const cashReceipt: ChoiceCardProps = { href: "/cash-receipt", title: "Cash Receipt", description: "Create and print branch-numbered receipts for cash received.", accent: "blue" };
const refund: ChoiceCardProps = { href: "/refund", title: "Refund", description: "Request a refund with payee, amount, bank details, and documents.", accent: "teal" };

// Literal class names so Tailwind generates them.
const SM_SPAN: Record<number, string> = { 1: "sm:col-span-1", 2: "sm:col-span-2" };
const LG_SPAN: Record<number, string> = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3" };

/** Column span for the last form so its row has no gap: 2 columns on
 * tablet, 3 on desktop. Every other card spans one column. */
function lastCardSpans(count: number) {
  return { sm: count % 2 === 1 ? 2 : 1, lg: count % 3 === 0 ? 1 : 3 - (count % 3) + 1 };
}

export default function PaymentDeskPage() {
  // Owner-set order (2026-10-16). With Refund: two full rows of three on
  // desktop. Without it: Forwarding Memo moves ahead of Cash Receipt so the
  // last card (Cash Receipt) is the one that fills the gap.
  const forms = refundEntryVisible()
    ? [paymentAdvice, cashVoucher, advance, refund, cashReceipt, forwardingMemo]
    : [paymentAdvice, cashVoucher, advance, forwardingMemo, cashReceipt];
  const last = lastCardSpans(forms.length);

  return <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-6 py-5">
    <header className="relative flex flex-wrap items-start gap-4 border-b border-gray-200 pb-4"><div className="flex min-w-0 items-center gap-4 sm:pr-32"><Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-14 w-auto" /><div><h1 className="font-heading text-2xl text-[#0b1f3a]">Payment Desk</h1><p className="text-xs text-gray-600 sm:text-sm">Finance &amp; Accounts Department - Mahratta Chamber of Commerce, Industries and Agriculture</p></div></div><PublicLoginMenu /></header>
    <section className="text-center"><h2 className="font-heading text-2xl text-[#0b1f3a]">What would you like to submit?</h2><p className="mt-1 text-sm text-gray-600">Choose the document that matches your payment request.</p></section>
    {/* Compact so every card fits a laptop screen without scrolling: one
        column on mobile, two from 640px, three from 1024px. The last form
        spans whatever its row leaves empty; National Safety Week closes the
        grid as a slim full-width bar. */}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {forms.map((card, index) => (
        <ChoiceCard
          key={card.href}
          {...card}
          span={index === forms.length - 1 ? `${SM_SPAN[last.sm]} ${LG_SPAN[last.lg]}` : ""}
        />
      ))}
      <Link href={NSW_BRANCH_LOGIN_URL} className={`group flex items-center gap-4 rounded-xl border bg-white px-5 py-3 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99] sm:col-span-2 lg:col-span-3 ${ACCENTS.rose.border}`}>
        <span className={`block h-6 w-1.5 shrink-0 rounded-full transition-all duration-200 group-hover:h-8 ${ACCENTS.rose.bar}`} />
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-lg text-[#0b1f3a]">National Safety Week - Branch Login</h3>
          <p className="truncate text-sm text-gray-600">Branch login for the National Safety Week portal.</p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-sm font-medium text-[#0b1f3a]">Open portal →</span>
      </Link>
    </div>
  </main>;
}

function ChoiceCard({ href, title, description, accent, span }: ChoiceCardProps & { span: string }) {
  const colors = ACCENTS[accent];
  return <Link href={href} className={`group flex flex-col rounded-xl border bg-white p-4 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99] ${colors.border}${span ? ` ${span}` : ""}`}><span className={`mb-3 block h-1.5 w-12 rounded-full transition-all duration-200 group-hover:w-16 ${colors.bar}`} /><h3 className="truncate font-heading text-lg text-[#0b1f3a]">{title}</h3><p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-600" title={description}>{description}</p><span className="mt-auto pt-3 text-sm font-medium text-[#0b1f3a]">Open form →</span></Link>;
}
