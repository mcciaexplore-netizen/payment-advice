import type { Metadata } from "next";
import { ChangePasswordPageContent } from "@/components/account/ChangePasswordForm";

export const metadata: Metadata = { title: "Change Password" };

export default function AdminChangePasswordPage() {
  return <ChangePasswordPageContent description="Update the password for your Finance Admin account." />;
}
