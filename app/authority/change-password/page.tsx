import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";

export const metadata: Metadata = { title: "Change Password" };

export default function AuthorityChangePasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl text-[#0b1f3a]">Change Password</h1>
        <p className="mt-1 text-sm text-gray-600">
          Update the password for your Authority Approvals account.
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
