import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("authenticated Authority dashboard recommendation wording", () => {
  it("uses Recommend/Recommended across its action, queue, and detail surfaces", () => {
    expect(read("components/authority/AuthorityQueueActions.tsx")).toContain(">Recommend</button>");
    const queue = read("app/authority/page.tsx");
    expect(queue).toContain("Pending My Recommendation");
    expect(queue).toContain('row.approvedAt ? "Recommended" : "Sent Back"');
    const detail = read("app/authority/advice/[id]/page.tsx");
    expect(detail).toContain(">Recommended</span>");
    expect(detail).toContain("`Recommended ${formatDateTime");
  });

  it("uses recommendation wording on the token-link page without renaming internal workflow identifiers", () => {
    const tokenView = read("components/authority/AuthorityApprovalView.tsx");
    const tokenPage = read("app/authority-approval/[token]/page.tsx");
    expect(tokenView).toContain('{submitting ? "Recommending…" : "Recommend"}');
    expect(tokenView).toContain("Recommended. This has been forwarded to Finance");
    expect(tokenView).toContain("You already recommended this");
    expect(tokenPage).toContain("Recommendation Request");
    expect(tokenPage).toContain("recommend it or send it back with remarks");
    expect(tokenView).toContain("/approve`");
  });
});
