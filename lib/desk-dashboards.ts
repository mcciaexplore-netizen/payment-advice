import { FINANCE_ROLES, type AdminRole } from "@/lib/auth";

export type DeskDashboardLink = { href: string; title: string; description: string };

const TEAM_ROLES: readonly AdminRole[] = ["BRANCH", "DEPARTMENT", "SELF", "CASH_RECEIPT"];

/** The dashboards a signed-in account can open straight from the Payment
 * Desk's Login menu, linking past the login pages (the session already
 * covers them). Only dashboards the account's roles allow are listed; the
 * dashboards themselves still enforce their own role checks. */
export function dashboardLinksFor(roles: readonly AdminRole[]): DeskDashboardLink[] {
  const links: DeskDashboardLink[] = [];
  if (roles.some((role) => FINANCE_ROLES.includes(role))) {
    links.push({ href: "/admin", title: "Finance Admin", description: "Dashboard, submissions and finance processing" });
  }
  if (roles.includes("AUTHORITY")) {
    links.push({ href: "/authority?role=AUTHORITY", title: "Authority Recommendations", description: "Review and recommend assigned submissions" });
  }
  const teamRole = TEAM_ROLES.find((role) => roles.includes(role));
  if (teamRole) {
    links.push({ href: `/authority?role=${teamRole}`, title: "Team Dashboard", description: "Track your own and your team's submissions" });
  }
  return links;
}
