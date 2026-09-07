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
