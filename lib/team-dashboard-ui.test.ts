import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Team Dashboard scoped views", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/authority/page.tsx"), "utf8");

  it("filters Branch and Department grants against their exact snapshot columns", () => {
    expect(source).toContain("eq(paymentAdvices.branch, activeGrant.scopeValue!)");
    expect(source).toContain("eq(paymentAdvices.submittedByDepartment, activeGrant.scopeValue!)");
  });

  it("reuses one email predicate for My Submissions in every dashboard context", () => {
    expect(source).toContain("const ownSubmissions = eq(paymentAdvices.submittedByEmail, account.email)");
    expect(source).toContain('view === "my-submissions" ? ownSubmissions');
  });

  it("keeps Team Submissions read-only while Authority rows retain View actions", () => {
    expect(source).toContain('isAuthority && view === "pending"');
    expect(source).toContain('<ViewLink adviceId={row.id} from="pending" />');
    expect(source).not.toContain("AuthorityQueueActions");
  });
});

describe("separate public login entry points", () => {
  const menu = fs.readFileSync(path.join(process.cwd(), "components/public/PublicLoginMenu.tsx"), "utf8");
  const authorityLogin = fs.readFileSync(path.join(process.cwd(), "app/authority/login/page.tsx"), "utf8");
  const teamLogin = fs.readFileSync(path.join(process.cwd(), "app/team/login/page.tsx"), "utf8");

  it("offers Finance, Authority, and Team Dashboard logins", () => {
    expect(menu).toContain('title="Finance Admin Login"');
    expect(menu).toContain('href="/authority/login"');
    expect(menu).toContain('title="Authority Login"');
    expect(menu).toContain('href="/team/login"');
    expect(menu).toContain('title="Team Dashboard Login"');
  });

  it("keeps Authority and Team credentials on distinct endpoints", () => {
    expect(authorityLogin).toContain('title="Authority Approvals"');
    expect(authorityLogin).toContain('endpoint="/api/authority/login"');
    expect(teamLogin).toContain('title="Team Dashboard"');
    expect(teamLogin).toContain('endpoint="/api/team/login"');
  });
});
