import type { Metadata } from "next";
import { DashboardLoginForm } from "@/components/account/DashboardLoginForm";
import { safeNextPath } from "@/lib/desk-login";

export const metadata: Metadata = { title: "Sign in" };

export default async function PaymentDeskLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <DashboardLoginForm
      title="Payment Desk"
      description="Sign in with your MCCIA account to continue."
      endpoint="/api/login"
      fieldPrefix="desk"
      redirectTo={safeNextPath(next)}
    />
  );
}
