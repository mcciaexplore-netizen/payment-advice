import { describe, expect, it } from "vitest";
import {
  renderAuthorityApprovalEmail,
  renderSentBackEmail,
  renderSubmissionConfirmationEmail,
} from "./templates";

describe("email templates", () => {
  it("renders a fully substituted authority approval email with the expected subject", () => {
    const message = renderAuthorityApprovalEmail({
      serialNo: "MCCIA/2026-27/0001",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "1,250.00",
      natureOfExpenditure: "Event printing",
      billReference: "INV-101",
      paymentMode: "NEFT",
      formDate: "30/07/2026",
      approvalLink: "https://example.test/approval/token",
    });
    expect(message.subject).toBe("Approval Required: Payment Advice MCCIA/2026-27/0001");
    expect(message.html).toContain("Event printing");
    expect(message.html).not.toContain("{{");
  });

  it("renders the sent-back subject and escapes free-text remarks", () => {
    const message = renderSentBackEmail({
      serialNo: "MCCIA/2026-27/0002",
      submittedByName: "Priya Sharma",
      sentBackBy: "Admin",
      remarks: "Please correct <script>alert(1)</script> & resubmit",
      payeeName: "Acme Supplies",
      amount: "850.00",
      editLink: "https://example.test/edit/token",
    });
    expect(message.subject).toBe("Action Required: Payment Advice MCCIA/2026-27/0002 Sent Back");
    expect(message.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; resubmit");
    expect(message.html).not.toContain("<script>alert(1)</script>");
    expect(message.html).not.toContain("{{");
  });

  it("renders the submission subject and omits the Cash Voucher button without its link", () => {
    const message = renderSubmissionConfirmationEmail({
      serialNo: "MCCIA/2026-27/0003",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "850.00",
      paymentMode: "NEFT",
      formDate: "30/07/2026",
      paymentAdvicePdfLink: "https://example.test/advice/id/pdf",
    });
    expect(message.subject).toBe("Payment Advice MCCIA/2026-27/0003 Submitted");
    expect(message.html).toContain("Download Payment Advice");
    expect(message.html).not.toContain("Download Cash Payment Voucher");
    expect(message.html).not.toContain("{{");
  });

  it("includes the Cash Voucher button only for Cash submissions with a link", () => {
    const message = renderSubmissionConfirmationEmail({
      serialNo: "MCCIA/2026-27/0004",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "850.00",
      paymentMode: "CASH",
      formDate: "30/07/2026",
      paymentAdvicePdfLink: "https://example.test/advice/id/pdf",
      cashVoucherPdfLink: "https://example.test/advice/id/cash-voucher-pdf",
    });
    expect(message.html).toContain("Download Cash Payment Voucher");
    expect(message.html).toContain("https://example.test/advice/id/cash-voucher-pdf");
    expect(message.html).not.toContain("{{");
  });
});
