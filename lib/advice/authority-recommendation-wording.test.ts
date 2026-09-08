import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", ".next", ".vercel"].includes(entry.name)) return [];
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(ts|tsx)$/.test(entry.name) ? [relative] : [];
  });
}

describe("authenticated Authority dashboard recommendation wording", () => {
  it("uses Recommend/Recommended across its action, queue, and detail surfaces", () => {
    expect(read("components/authority/AuthorityQueueActions.tsx")).toContain(">Recommend</button>");
    const queue = read("app/authority/page.tsx");
    expect(queue).toContain("Pending My Recommendation");
    expect(queue).toContain('row.approvedAt ? "Awaiting Finance Review" : "Sent Back"');
    expect(read("lib/advice/stage-style.ts")).toContain('shortLabel: "Recommended"');
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

  it("has no remaining Authority-action approval wording anywhere in repository-owned TypeScript", () => {
    const forbidden = [
      /Authority Approvals/i,
      /Approval Required:/i,
      /Approval Request/i,
      /Review &amp; Approve/i,
      /for approval\. You'll/i,
      /Recommending Authority approval/i,
      /Authority\) to approve/i,
      /This approval link/i,
      /records for this approval/i,
      /available for this approval/i,
      /authority-approved/i,
      /Authority actually approves/i,
      /before Approve\/Send Back/i,
      /Approved by \{authorityName\}/i,
    ];
    const failures = sourceFiles(process.cwd()).filter((file) => !file.endsWith("authority-recommendation-wording.test.ts")).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8").split("\n")
        .filter((line) => !line.includes("not.toContain"))
        .join("\n");
      return forbidden.filter((pattern) => pattern.test(source)).map((pattern) => `${file}: ${pattern}`);
    });
    expect(failures).toEqual([]);
  });
});
