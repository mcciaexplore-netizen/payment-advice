import Image from "next/image";
import Link from "next/link";
import { PublicLoginMenu } from "@/components/public/PublicLoginMenu";
import { NSW_BRANCH_LOGIN_URL } from "@/lib/external-links";
import { refundEntryVisible } from "@/lib/refund-requests";

export default function PaymentDeskPage() {
  const forms: ChoiceCardProps[] = [
    { href: "/payment-advice", title: "Payment Advice", description: "For payments made by NEFT to a vendor or beneficiary.", accent: "green" },
    { href: "/cash-voucher", title: "Cash Payment Voucher", description: "For cash reimbursements paid directly to the submitter.", accent: "amber" },
    { href: "/advance", title: "Advance Payment Form", description: "For money needed before travel, events, or other planned expenses.", accent: "violet" },
    { href: "/forwarding-memo", title: "Forwarding Memo", description: "For forwarding cheques, demand drafts, and other payment instruments to the Accounts Department.", accent: "green" },
    { href: "/cash-receipt", title: "Cash Receipt", description: "Create and print branch-numbered receipts for cash received.", accent: "blue" },
    ...(refundEntryVisible() ? [{ href: "/refund", title: "Refund", description: "Submit a refund request with payee, amount, bank details, and supporting documents.", accent: "teal" } as ChoiceCardProps] : []),
  ];
  return <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-10">
    <header className="relative flex flex-wrap items-start gap-4 border-b border-gray-200 pb-6"><div className="flex min-w-0 items-center gap-4 sm:pr-32"><Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-14 w-auto" /><div><h1 className="font-heading text-3xl text-[#0b1f3a]">Payment Desk</h1><p className="text-sm text-gray-600">Finance &amp; Accounts Department - Mahratta Chamber of Commerce, Industries and Agriculture</p></div></div><PublicLoginMenu /></header>
    <section className="text-center"><h2 className="font-heading text-3xl text-[#0b1f3a]">What would you like to submit?</h2><p className="mt-2 text-sm text-gray-600">Choose the document that matches your payment request.</p></section>
    {/* Two columns from tablet width up, one per row on mobile. The
        submission forms come first; Refund appears only while its flag is on.
        If the forms leave an odd one out (flag off: five), the last form
        spans the row so no row has a gap. National Safety Week, a separate
        portal rather than a form, always closes the grid at full width. */}
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {forms.map((card, index) => <ChoiceCard key={card.href} {...card} wide={forms.length % 2 === 1 && index === forms.length - 1} />)}
      <ChoiceCard href={NSW_BRANCH_LOGIN_URL} title="National Safety Week - Branch Login" description="Branch login for the National Safety Week portal." accent="rose" cta="Open portal →" wide />
    </div>
  </main>;
}

type ChoiceCardProps = { href: string; title: string; description: string; accent: "green" | "amber" | "violet" | "blue" | "rose" | "teal"; cta?: string; wide?: boolean };

function ChoiceCard({ href, title, description, accent, cta = "Open form →", wide = false }: ChoiceCardProps) {
  const accentClasses = accent === "green"
    ? { border: "border-[#2e8b57]/35 hover:border-[#2e8b57]", bar: "bg-[#2e8b57]" }
    : accent === "amber"
      ? { border: "border-[#e8a33d]/45 hover:border-[#e8a33d]", bar: "bg-[#e8a33d]" }
      : accent === "violet"
        ? { border: "border-violet-300 hover:border-violet-600", bar: "bg-violet-600" }
        : accent === "rose"
          ? { border: "border-rose-300 hover:border-rose-600", bar: "bg-rose-600" }
          : accent === "teal"
            ? { border: "border-teal-300 hover:border-teal-600", bar: "bg-teal-600" }
            : { border: "border-sky-300 hover:border-sky-600", bar: "bg-sky-600" };
  return <Link href={href} className={`group rounded-xl border bg-white p-7 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99] ${accentClasses.border}${wide ? " sm:col-span-2" : ""}`}><span className={`mb-5 block h-1.5 w-14 rounded-full transition-all duration-200 group-hover:w-20 ${accentClasses.bar}`} /><h3 className="font-heading text-2xl text-[#0b1f3a]">{title}</h3><p className="mt-2 text-sm leading-6 text-gray-600">{description}</p><span className="mt-5 inline-block text-sm font-medium text-[#0b1f3a]">{cta}</span></Link>;
}
