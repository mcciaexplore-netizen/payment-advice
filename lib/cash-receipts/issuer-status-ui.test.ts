import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/** Renders the real Team Dashboard (app/authority/page.tsx) Cash Receipts
 * tab for an issuer, with an in-memory fake DB: no database access. */
const state = vi.hoisted(() => ({ receipts: [] as unknown[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => ({ adminUserId: "issuer-1", fullName: "Advika Mangrulkar", roles: ["SELF", "CASH_RECEIPT"], recommendingAuthorityId: null, branchScope: "SB Road Office" }) }));
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const resultFor = (table: unknown) =>
    table === schema.adminUsers ? [{ email: "advikam@mcciapune.com" }]
      : table === schema.adminUserRoles ? [{ role: "SELF", recommendingAuthorityId: null, scopeValue: null }, { role: "CASH_RECEIPT", recommendingAuthorityId: null, scopeValue: "SB Road Office" }]
        : table === schema.cashReceipts ? state.receipts : [];
  return { db: { select: () => { let table: unknown; const node: Record<string, unknown> = {}; for (const m of ["where", "orderBy", "limit"]) node[m] = () => node; node.from = (t: unknown) => { table = t; return node; }; node.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resultFor(table)).then(resolve); return node; } } };
});

import TeamDashboard from "../../app/authority/page";

const base = { branch: "SB Road Office", financialYear: "2026-27", gstin: null, items: [], issuedByUserId: "issuer-1", submittedByName: "Advika Mangrulkar", submittedByEmail: "advikam@mcciapune.com", createdAt: new Date(), receivedEmailSentAt: null };

describe("issuer sees the Cash received status on their own receipts", () => {
  it("shows Pending, or Received on <date> by <name> with the note, read only", async () => {
    state.receipts = [
      { ...base, id: "11111111-1111-4111-8111-111111111111", serialNo: "CR/SBR/2026-27/0002", receiptDate: "2026-10-30", partyName: "Ross Boilers", total: "175.00", receivedAt: null, receivedBy: null, receivedNote: null },
      { ...base, id: "22222222-2222-4222-8222-222222222222", serialNo: "CR/SBR/2026-27/0001", receiptDate: "2026-10-30", partyName: "Forbes Marshall", total: "420.00", receivedAt: new Date("2026-10-30T11:00:00Z"), receivedBy: "Abha Khatavkar", receivedNote: "short by 50", receivedEmailSentAt: new Date() },
    ];
    const element = await TeamDashboard({ searchParams: Promise.resolve({ role: "SELF", view: "cash-receipts", dateFrom: "2026-10-30", dateTo: "2026-10-30" }) });
    const html = renderToStaticMarkup(element!);
    expect(html).toContain('<th class="p-3">Status</th>');
    expect(html).toContain(">Pending</span>");
    expect(html).toContain(">Received on 30/10/2026 by Abha Khatavkar</span>");
    expect(html).toContain("Note: short by 50");
    expect(html).not.toContain("Mark received");
    expect(html).not.toContain("Resend email");
    expect(html).not.toContain("Undo");
  });
});
