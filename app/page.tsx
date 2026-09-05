import Image from "next/image";
import Link from "next/link";
import { PublicLoginMenu } from "@/components/public/PublicLoginMenu";

export default function PaymentDeskPage() {
  return <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-10">
    <header className="relative flex flex-wrap items-start gap-4 border-b border-gray-200 pb-6"><div className="flex min-w-0 items-center gap-4 sm:pr-32"><Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-14 w-auto" /><div><h1 className="font-heading text-3xl text-[#0b1f3a]">Payment Desk</h1><p className="text-sm text-gray-600">Finance &amp; Accounts Department — Mahratta Chamber of Commerce, Industries and Agriculture</p></div></div><PublicLoginMenu /></header>
    <section className="text-center"><h2 className="font-heading text-3xl text-[#0b1f3a]">What would you like to submit?</h2><p className="mt-2 text-sm text-gray-600">Choose the document that matches your payment request.</p></section>
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"><ChoiceCard href="/payment-advice" title="Payment Advice" description="For payments made by NEFT to a vendor or beneficiary." accent="green" /><ChoiceCard href="/cash-voucher" title="Cash Payment Voucher" description="For cash reimbursements paid directly to the submitter." accent="amber" /><ChoiceCard href="/advance" title="Advance Payment Form" description="For money needed before travel, events, or other planned expenses." accent="violet" /></div>
  </main>;
}

function ChoiceCard({ href, title, description, accent }: { href: string; title: string; description: string; accent: "green" | "amber" | "violet" }) {
  const accentClasses = accent === "green"
    ? { border: "border-[#2e8b57]/35 hover:border-[#2e8b57]", bar: "bg-[#2e8b57]" }
    : accent === "amber"
      ? { border: "border-[#e8a33d]/45 hover:border-[#e8a33d]", bar: "bg-[#e8a33d]" }
      : { border: "border-violet-300 hover:border-violet-600", bar: "bg-violet-600" };
  return <Link href={href} className={`group rounded-xl border bg-white p-7 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99] ${accentClasses.border}`}><span className={`mb-5 block h-1.5 w-14 rounded-full transition-all duration-200 group-hover:w-20 ${accentClasses.bar}`} /><h3 className="font-heading text-2xl text-[#0b1f3a]">{title}</h3><p className="mt-2 text-sm leading-6 text-gray-600">{description}</p><span className="mt-5 inline-block text-sm font-medium text-[#0b1f3a]">Open form →</span></Link>;
}
