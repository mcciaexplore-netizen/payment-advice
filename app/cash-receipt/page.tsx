import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import { hasRole } from "@/lib/auth";
import { CashReceiptForm } from "@/components/form/CashReceiptForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cash Receipt" };

export default async function CashReceiptPage() {
  const session = await getAdminSession();
  if (!session?.branchScope || !hasRole(session, "BRANCH")) redirect("/cash-receipt/login");
  return <CashReceiptForm branch={session.branchScope} issuedBy={session.fullName} />;
}
