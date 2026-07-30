import { describe, expect, it } from "vitest";
import {
  renderAuthorityApprovalEmail,
  renderSentBackEmail,
  renderSubmissionConfirmationEmail,
  renderVerifiedEmail,
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

  it("includes the Cash Voucher button, and omits the Payment Advice button, for Cash submissions", () => {
    const message = renderSubmissionConfirmationEmail({
      serialNo: "MCCIA/2026-27/0004",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "850.00",
      paymentMode: "CASH",
      formDate: "30/07/2026",
      cashVoucherPdfLink: "https://example.test/advice/id/cash-voucher-pdf",
    });
    expect(message.html).toContain("Download Cash Payment Voucher");
    expect(message.html).toContain("https://example.test/advice/id/cash-voucher-pdf");
    expect(message.html).not.toContain("Download Payment Advice");
    expect(message.html).not.toContain("{{");
  });

  it("still includes the Payment Advice button for NEFT submissions (unaffected by the Cash change)", () => {
    const message = renderSubmissionConfirmationEmail({
      serialNo: "MCCIA/2026-27/0005",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "850.00",
      paymentMode: "NEFT",
      formDate: "30/07/2026",
      paymentAdvicePdfLink: "https://example.test/advice/id/pdf",
    });
    expect(message.html).toContain("Download Payment Advice");
    expect(message.html).toContain("https://example.test/advice/id/pdf");
    expect(message.html).not.toContain("Download Cash Payment Voucher");
    expect(message.html).not.toContain("{{");
  });

  it("even a mislabeled Cash payload (paymentAdvicePdfLink present) omits the button — paymentMode decides, not link presence", () => {
    const message = renderSubmissionConfirmationEmail({
      serialNo: "MCCIA/2026-27/0006",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "850.00",
      paymentMode: "CASH",
      formDate: "30/07/2026",
      paymentAdvicePdfLink: "https://example.test/advice/id/pdf",
      cashVoucherPdfLink: "https://example.test/advice/id/cash-voucher-pdf",
    });
    expect(message.html).not.toContain("Download Payment Advice</a>");
  });
});

describe("renderVerifiedEmail", () => {
  it("renders the exact specified subject and eyebrow/header, substituting the document label for NEFT", () => {
    const message = renderVerifiedEmail({
      serialNo: "MCCIA/2026-27/0007",
      submittedByName: "Priya Sharma",
      verifiedBy: "Sunil Salunke",
      documentLabel: "Payment Advice",
      payeeName: "Acme Supplies",
      amount: "1,250.00",
      formDate: "30/07/2026",
    });
    expect(message.subject).toBe("Payment Advice MCCIA/2026-27/0007 Verified");
    expect(message.html).toContain(">Verified<");
    expect(message.html).toContain("MCCIA/2026-27/0007");
    expect(message.html).toContain("Priya Sharma");
    expect(message.html).toContain("Sunil Salunke");
    expect(message.html).toContain("Payment Advice");
    expect(message.html).toContain("forwarded for sanctioning and payment processing");
    expect(message.html).not.toContain("{{");
  });

  it("substitutes the Cash Payment Voucher document label for Cash", () => {
    const message = renderVerifiedEmail({
      serialNo: "MCCIA/2026-27/0008",
      submittedByName: "Priya Sharma",
      verifiedBy: "Aabha Khatavkar",
      documentLabel: "Cash Payment Voucher",
      payeeName: "Acme Supplies",
      amount: "850.00",
      formDate: "30/07/2026",
    });
    expect(message.html).toContain("Cash Payment Voucher");
    expect(message.html).not.toContain("{{");
  });

  it("still uses the literal 'Payment Advice {serial}' subject even for a Cash submission, per the exact specified copy", () => {
    const message = renderVerifiedEmail({
      serialNo: "MCCIA/2026-27/0009",
      submittedByName: "Priya Sharma",
      verifiedBy: "Vaidehi Marathe",
      documentLabel: "Cash Payment Voucher",
      payeeName: "Acme Supplies",
      amount: "850.00",
      formDate: "30/07/2026",
    });
    expect(message.subject).toBe("Payment Advice MCCIA/2026-27/0009 Verified");
  });

  it("does not include a download button/link — this email is informational only", () => {
    const message = renderVerifiedEmail({
      serialNo: "MCCIA/2026-27/0010",
      submittedByName: "Priya Sharma",
      verifiedBy: "Chandrashekhar Shah",
      documentLabel: "Payment Advice",
      payeeName: "Acme Supplies",
      amount: "850.00",
      formDate: "30/07/2026",
    });
    expect(message.html).not.toContain("<a href");
  });
});
