import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Finance Admin top nav (2026-10-06): Cash Receipts item", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/admin/layout.tsx"), "utf8");

  it("places Cash Receipts right after Forwarding Memos, linking to /admin/cash-receipts, same styling as every other item", () => {
    const forwardingIndex = source.indexOf('href="/admin/forwarding-memos"');
    const cashReceiptsIndex = source.indexOf('href="/admin/cash-receipts"');
    expect(forwardingIndex).toBeGreaterThan(-1);
    expect(cashReceiptsIndex).toBeGreaterThan(forwardingIndex);
    expect(source).toContain('<Link href="/admin/cash-receipts" className="whitespace-nowrap hover:text-white">');
  });

  it("is not role-filtered, same as every other Finance Admin nav item (gated only by proxy.ts's blanket hasFinanceRole check)", () => {
    expect(source).toContain(
      '<Link href="/admin/cash-receipts" className="whitespace-nowrap hover:text-white">\n                Cash Receipts\n              </Link>\n              {hasRole(session, "AUTHORITY")',
    );
  });

  it("wraps whole items to a new row instead of breaking mid-word, so adding Cash Receipts cannot push the nav into the broken per-word wrapping it had before", () => {
    expect(source).toContain("flex-wrap items-center justify-end gap-x-6 gap-y-2");
    expect(source).toContain("flex max-w-7xl flex-wrap items-center justify-between gap-y-3");
    expect(source).toContain('className="whitespace-nowrap hover:text-white"');
  });
});
