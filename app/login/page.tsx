import type { Metadata } from "next";
import { DashboardLoginForm } from "@/components/account/DashboardLoginForm";
import { safeNextPath } from "@/lib/desk-login";

export const metadata: Metadata = { title: "Sign in" };

export default async function PaymentDeskLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; embed?: string; email?: string }> }) {
  const { next, embed, email } = await searchParams;
  // Inside the MCCIA App Hub (?embed=1): this one sign-in is remembered there.
  const embedded = embed === "1";
  return (
    <DashboardLoginForm
      title="Payment Desk"
      description={embedded ? "Sign in once with your Payment Desk password. You will stay signed in here inside the App Hub." : "Sign in with your MCCIA account to continue."}
      endpoint="/api/login"
      fieldPrefix="desk"
      redirectTo={safeNextPath(next)}
      embedded={embedded}
      initialEmail={embedded && typeof email === "string" && /^[^\s@]+@[^\s@]+$/.test(email) ? email.trim().toLowerCase() : ""}
    />
  );
}
