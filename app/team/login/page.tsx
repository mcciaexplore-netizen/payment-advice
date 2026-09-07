import { DashboardLoginForm } from "@/components/account/DashboardLoginForm";

export default function TeamLoginPage() {
  return (
    <DashboardLoginForm
      title="Team Dashboard"
      description="Sign in to track your submissions and team activity."
      endpoint="/api/team/login"
      fieldPrefix="team"
    />
  );
}
