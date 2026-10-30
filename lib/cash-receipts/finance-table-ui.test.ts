import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { CashReceiptsTable, type CashReceiptTableRow } from "@/components/admin/CashReceiptsTable";

const row = (n: number, extra: Partial<CashReceiptTableRow> = {}): CashReceiptTableRow => ({
  id: `0000000${n}-0000-4000-8000-000000000000`, serialNo: `CR/SBR/2026-27/000${n}`, branch: "SB Road Office", partyName: `Party ${n}`,
  total: "500.00", receiptDate: "2026-10-30", submittedByName: "Advika Mangrulkar",
  receivedAt: null, receivedBy: null, receivedNote: null, receivedEmailSentAt: null, ...extra,
});
const ROWS = [
  row(1),
  row(2, { receivedAt: "2026-10-30T11:00:00Z", receivedBy: "Abha Khatavkar", receivedEmailSentAt: "2026-10-30T11:00:05Z" }),
  row(3, { receivedAt: "2026-10-30T11:00:00Z", receivedBy: "Abha Khatavkar", receivedNote: "short by 50" }),
];
const render = (props: { canMark: boolean; canUndo: boolean; interactive: boolean }) => renderToStaticMarkup(createElement(CashReceiptsTable, { rows: ROWS, ...props }));

describe("Finance Cash Receipts table", () => {
  it("CASH_VOUCHER: Status column, a checkbox and Mark received only on pending rows, Resend only where the email did not go out, no Undo", () => {
    const html = render({ canMark: true, canUndo: false, interactive: true });
    expect(html).toContain(">Status</th>");
    expect(html).toContain(">Pending</span>");
    expect(html.match(/Received on 30\/10\/2026 by Abha Khatavkar/g)).toHaveLength(2);
    expect(html.match(/aria-label="Select CR\//g)).toHaveLength(1);
    expect(html).toContain('aria-label="Select CR/SBR/2026-27/0001"');
    expect(html.match(/>Mark received</g)).toHaveLength(1);
    expect(html.match(/>Email not sent</g)).toHaveLength(1);
    expect(html.match(/>Resend email</g)).toHaveLength(1);
    expect(html).toContain("Note: short by 50");
    expect(html).not.toContain(">Undo<");
  });

  it("ALL also gets Undo on received rows", () => {
    expect(render({ canMark: true, canUndo: true, interactive: true }).match(/>Undo</g)).toHaveLength(2);
  });

  it("PAYMENT_ADVICE Finance and the compact dashboard list see status only: no checkboxes or actions", () => {
    for (const html of [render({ canMark: false, canUndo: false, interactive: true }), render({ canMark: true, canUndo: true, interactive: false })]) {
      expect(html).toContain(">Pending</span>");
      expect(html).not.toContain('type="checkbox"');
      expect(html).not.toContain("Mark received");
      expect(html).not.toContain("Resend email");
    }
  });

  it("no em dashes in the UI copy", () => {
    expect(render({ canMark: true, canUndo: true, interactive: true })).not.toContain("—");
  });
});
