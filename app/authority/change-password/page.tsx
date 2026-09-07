import type { Metadata } from "next";
import { ChangePasswordPageContent } from "@/components/account/ChangePasswordForm";

export const metadata: Metadata = { title: "Change Password" };

export default function AuthorityChangePasswordPage() {
  return (
    <ChangePasswordPageContent
      description="Update the password for your Team Dashboard account."
      fallbackHref="/authority"
    />
  );
}
