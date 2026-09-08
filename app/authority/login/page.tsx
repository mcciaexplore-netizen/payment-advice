import { DashboardLoginForm } from "@/components/account/DashboardLoginForm";

export default function AuthorityLoginPage() {
  return (
    <DashboardLoginForm
      title="Authority Recommendations"
      description="Sign in to review submissions waiting for your decision."
      endpoint="/api/authority/login"
      fieldPrefix="authority"
    />
  );
}
