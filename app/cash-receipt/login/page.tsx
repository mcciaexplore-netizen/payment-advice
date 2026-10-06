import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import { hasRole } from "@/lib/auth";
import { CashReceiptLoginForm } from "@/components/account/CashReceiptLoginForm";

export default async function CashReceiptLoginPage() {
  const session = await getAdminSession();
  if (session?.branchScope && hasRole(session, "BRANCH")) redirect("/cash-receipt");
  return <CashReceiptLoginForm />;
}
