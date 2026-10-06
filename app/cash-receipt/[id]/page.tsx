import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { cashReceipts } from "@/lib/db/schema";
import { formatDateOnly } from "@/lib/date-time";
import { PrintButton } from "@/components/form/PrintButton";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole, hasRole } from "@/lib/auth";
import { canAccessCashReceipt } from "@/lib/advice/cash-receipt-access";
import { getLocalCashReceipt } from "@/lib/cash-receipt-local-store";
import { formatCashReceiptNumber } from "@/lib/cash-receipt-number";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function CashReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAdminSession();
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    // Local dev fallback (no DB connection) - same branch-only check this
    // path has always used, since LocalCashReceipt carries no real
    // admin_users id to check person-level ownership against.
    const isFinanceAdmin = hasFinanceRole(session);
    const isBranchAccount = Boolean(session?.branchScope) && hasRole(session, "BRANCH");
    if (!session || (!isFinanceAdmin && !isBranchAccount)) redirect("/cash-receipt/login");
    const receipt = await getLocalCashReceipt(id);
    if (!receipt || (!isFinanceAdmin && receipt.branch !== session.branchScope)) notFound();
    return (
      <CashReceiptPaper
        number={formatCashReceiptNumber(receipt.branch, receipt.receiptDate, receipt.receiptNumber)}
        receiptDate={receipt.receiptDate}
        partyName={receipt.partyName}
        gstin={receipt.gstin}
        items={receipt.items}
        total={receipt.total}
        issuedBy={receipt.issuedBy}
        downloadHref={`/api/cash-receipt/${id}/pdf`}
      />
    );
  }

  if (!session) redirect("/cash-receipt/login");
  const [receipt] = await db.select().from(cashReceipts).where(eq(cashReceipts.id, id)).limit(1);
  // Person-level access, not branch-level: a branch account may only open a
  // receipt it personally issued, never a colleague's, even in the same
  // branch. Finance sessions can open any. See
  // lib/advice/cash-receipt-access.ts - the same check the Download route
  // below uses, so this can never drift from that one.
  if (!receipt || !canAccessCashReceipt(session, receipt)) notFound();

  return (
    <CashReceiptPaper
      number={receipt.serialNo}
      receiptDate={receipt.receiptDate}
      partyName={receipt.partyName}
      gstin={receipt.gstin}
      items={receipt.items}
      total={receipt.total}
      issuedBy={receipt.submittedByName}
      downloadHref={`/api/cash-receipt/${id}/pdf`}
    />
  );
}

function CashReceiptPaper({
  number,
  receiptDate,
  partyName,
  gstin,
  items,
  total,
  issuedBy,
  downloadHref,
}: {
  number: string;
  receiptDate: string;
  partyName: string;
  gstin: string | null;
  items: Array<{ particulars: string; copies: number; price: string; amount: string; billNo?: string; billDate?: string }>;
  total: string;
  issuedBy: string;
  downloadHref: string;
}) {
  return <main className="mx-auto max-w-4xl px-5 py-8 print:max-w-none print:p-0">
    <div className="mb-5 flex flex-wrap justify-between gap-3 print:hidden">
      <Link href="/cash-receipt" className="rounded-md border border-gray-300 px-4 py-2 text-sm text-[#0b1f3a]">New receipt</Link>
      <div className="flex gap-3">
        <a href={downloadHref} className="rounded-md border border-[#0b1f3a] px-4 py-2 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5">Download PDF</a>
        <PrintButton />
      </div>
    </div>
    <article className="receipt-paper border border-gray-400 bg-white px-7 py-6 text-black print:border-0 print:px-0 print:py-0">
      <Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} priority className="mx-auto mb-2 h-6 w-auto" />
      <h1 className="text-center text-base font-bold">CASH RECEIPT</h1>
      <h2 className="mt-2 print:mt-1 text-center text-sm font-bold">MAHRATTA CHAMBER OF COMMERCE, INDUSTRIES &amp; AGRICULTURE</h2>
      <p className="text-center text-xs leading-4">505 &amp; 506 A &amp; B Wing, 5th Floor, MCCIA Trade Tower, International Convention Centre,<br />403 - A Senapati Bapat Road, Pune - 411 016 Ph. 25709000</p>
      <div className="mt-1 flex justify-between text-xs"><span>GSTIN: 27AAATM5559Q1ZS</span><span>PAN: AATMM5559Q</span></div>
      <div className="mt-5 print:mt-2 grid grid-cols-2 gap-4 text-sm"><p><strong>Receipt No: {number}</strong></p><p className="text-right"><strong>Date: {formatDateOnly(receiptDate)}</strong></p></div>
      <div className="mt-3 print:mt-1 border-b border-black pb-2 print:pb-1 text-sm"><strong>M/s&nbsp; {partyName}</strong></div>
      <div className="mt-1 min-h-7 border-b border-black text-xs">GSTIN: {gstin ?? ""}</div>
      <table className="receipt-table mt-4 print:mt-2 w-full border-collapse text-xs"><thead><tr><th className="w-[52%]">PARTICULARS</th><th className="w-[13%]">COPIES</th><th className="w-[15%]">PRICE</th><th className="w-[20%]">AMOUNT<br />Rs.</th></tr></thead><tbody>
        {items.map((item, index) => <tr key={`${item.particulars}-${index}`}><td>{index + 1}) {item.particulars}{item.particulars.startsWith("Hall Hiring Charges") ? <div className="mt-1 pl-3 text-[10px]">Bill No. {item.billNo || "________"} &nbsp;&nbsp;&nbsp; Date {item.billDate ? formatDateOnly(item.billDate) : "________"}</div> : null}</td><td className="text-center">{item.copies || ""}</td><td className="text-right">{item.copies ? Number(item.price).toFixed(2) : ""}</td><td className="text-right">{item.copies ? Number(item.amount).toFixed(2) : ""}</td></tr>)}
        <tr className="font-bold"><td colSpan={3} className="text-right">Total</td><td className="text-right">{Number(total).toFixed(2)}</td></tr>
      </tbody></table>
      <div className="mt-5 print:mt-2 text-xs">
        <div><div>Issued by</div><div className="mt-1 font-bold">{issuedBy}</div></div>
      </div>
    </article>
    <style>{`.receipt-table th, .receipt-table td { border: 1px solid #111; padding: 7px 8px; } .receipt-table tbody tr { height: 36px; } @media print { @page { size: A5 landscape; margin: 5mm; } .receipt-paper { min-height: 0; break-inside: avoid; } .receipt-table th, .receipt-table td { padding: 4px 5px; } .receipt-table tbody tr { height: 28px; } }`}</style>
  </main>;
}
