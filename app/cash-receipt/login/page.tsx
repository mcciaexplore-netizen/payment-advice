import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import { hasCashReceiptRole } from "@/lib/auth";
import { CashReceiptLoginForm } from "@/components/account/CashReceiptLoginForm";

export default async function CashReceiptLoginPage() {
  const session = await getAdminSession();
  if (session?.branchScope && hasCashReceiptRole(session)) redirect("/cash-receipt");
  return <CashReceiptLoginForm />;
}
