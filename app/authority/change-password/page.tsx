import type { Metadata } from "next";
import { ChangePasswordPageContent } from "@/components/account/ChangePasswordForm";
import { getAdminSession } from "@/lib/admin-session";
import { hasRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Change Password" };

export default async function AuthorityChangePasswordPage() {
  const session = await getAdminSession();
  const accountLabel = hasRole(session, "AUTHORITY") ? "Authority Approvals" : "Team Dashboard";
  return (
    <ChangePasswordPageContent
      description={`Update the password for your ${accountLabel} account.`}
      fallbackHref="/authority"
    />
  );
}
