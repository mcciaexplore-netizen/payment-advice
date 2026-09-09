import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Team Dashboard scoped views", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/authority/page.tsx"), "utf8");

  it("filters Branch and Department grants against their snapshot columns, case-insensitively", () => {
    expect(source).toContain("caseInsensitiveEq(paymentAdvices.branch, activeGrant.scopeValue!)");
    expect(source).toContain("caseInsensitiveEq(paymentAdvices.submittedByDepartment, activeGrant.scopeValue!)");
    expect(source).toContain("sql`lower(${column}) = lower(${value})`");
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

  it("offers type-correct UUID PDF downloads only in My Submissions", () => {
    expect(source).toContain('view === "my-submissions" ? <th className="p-3">Download</th>');
    expect(source).toContain("submissionPdfHref(row)");
    expect(source).toContain('view === "my-submissions" ? <td className="p-3"><a');
  });

  it("routes only the linked DG authority record to the executive dashboard", () => {
    expect(source).toContain('authorityRows[0]?.authorityName.trim().toUpperCase() === "DG"');
    expect(source).toContain('if (isDg && (!params.view || params.view === "executive")) return loadDgExecutiveDashboard()');
  });
});

describe("DG Phase 1 summary", () => {
  const dg = fs.readFileSync(path.join(process.cwd(), "components/admin/DgExecutiveDashboard.tsx"), "utf8");
  const admin = fs.readFileSync(path.join(process.cwd(), "app/admin/page.tsx"), "utf8");
  const metrics = fs.readFileSync(path.join(process.cwd(), "lib/advice/dg-dashboard.ts"), "utf8");

  it("shows four executive cards and merges exactly the five requested Finance stages", () => {
    expect(dg).toContain('label: "In Finance Processing"');
    expect(dg.match(/tab: "/g)).toHaveLength(4);
    expect(metrics).toContain('"received_in_process"');
    expect(metrics).toContain('"verified_ready_payment"');
    expect(metrics).toContain('"partial_payment_done"');
    expect(metrics).toContain('"fully_payment_settled"');
    expect(metrics).toContain('"payment_done"');
  });

  it("leaves Finance Admin on the existing nine-card summary", () => {
    expect(admin).toContain("PIPELINE_SUMMARY_STAGES.map");
    expect(admin).toContain("<PipelineSummary");
    expect(admin).not.toContain("DgExecutiveDashboard");
    expect(admin).not.toContain("finance_processing");
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
    expect(authorityLogin).toContain('title="Authority Recommendations"');
    expect(authorityLogin).toContain('endpoint="/api/authority/login"');
    expect(teamLogin).toContain('title="Team Dashboard"');
    expect(teamLogin).toContain('endpoint="/api/team/login"');
  });
});
