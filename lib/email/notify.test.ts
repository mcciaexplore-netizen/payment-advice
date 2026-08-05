import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resendSend: vi.fn(),
  gmailSendMail: vi.fn(),
  createTransport: vi.fn(),
  auditInsertValues: vi.fn(),
}));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: mocks.resendSend } })),
}));
vi.mock("nodemailer", () => {
  mocks.createTransport.mockImplementation(() => ({ sendMail: mocks.gmailSendMail }));
  return {
    default: { createTransport: mocks.createTransport },
    createTransport: mocks.createTransport,
  };
});
vi.mock("@/lib/db", () => ({
  db: { insert: vi.fn(() => ({ values: mocks.auditInsertValues })) },
}));

import {
  notifyAuthorityApproval,
  notifyPaymentDone,
  notifySentBack,
  notifySubmissionConfirmation,
  notifyVerified,
} from "./notify";

const submissionConfirmationData = {
  displayNo: "MCCIA/2026-27/0001",
  documentLabel: "Payment Advice",
  authorityName: "Asha Rao",
  submittedByName: "Priya Sharma",
  payeeName: "Acme Supplies",
  amount: "1,250.00",
  paymentMode: "NEFT",
  formDate: "30/07/2026",
  paymentAdvicePdfLink: "https://example.test/advice/id/pdf",
};

const sentBackData = {
  displayNo: "MCCIA/2026-27/0002",
  documentLabel: "Payment Advice",
  submittedByName: "Priya Sharma",
  sentBackBy: "Admin",
  remarks: "Please fix the amount",
  payeeName: "Acme Supplies",
  amount: "850.00",
  editLink: "https://example.test/edit/token",
};

const verifiedData = {
  displayNo: "MCCIA/2026-27/0003",
  submittedByName: "Priya Sharma",
  verifiedBy: "Sunil Salunke",
  documentLabel: "Payment Advice",
  payeeName: "Acme Supplies",
  amount: "850.00",
  formDate: "30/07/2026",
};

const paymentDoneData = {
  displayNo: "MCCIA/2026-27/0009",
  submittedByName: "Priya Sharma",
  documentLabel: "Payment Advice",
  payeeName: "Acme Supplies",
  amount: "850.00",
  formDate: "30/07/2026",
};

const authorityApprovalData = {
  displayNo: "MCCIA/2026-27/0004",
  documentLabel: "Payment Advice",
  authorityName: "Ganesh Mate",
  submittedByName: "Priya Sharma",
  payeeName: "Acme Supplies",
  amount: "1,250.00",
  natureOfExpenditure: "Event printing",
  billReference: "INV-101",
  paymentMode: "NEFT",
  formDate: "30/07/2026",
  approvalLink: "https://example.test/authority-approval/token",
};

describe("lib/email/notify.ts", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("preview mode (default behavior — must stay default)", () => {
    it("makes zero calls to any provider when EMAIL_MODE is unset", async () => {
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.gmailSendMail).not.toHaveBeenCalled();
      expect(mocks.resendSend).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Email preview: submission confirmation]"),
        expect.anything(),
      );
    });

    it("makes zero calls for any EMAIL_MODE value other than exactly 'live'", async () => {
      vi.stubEnv("EMAIL_MODE", "Live"); // wrong case — must not match
      await notifySentBack(sentBackData, "submitter@example.com");
      expect(mocks.gmailSendMail).not.toHaveBeenCalled();
    });

    it("every notify function stays in preview mode by default", async () => {
      await notifyVerified(verifiedData, "submitter@example.com");
      await notifyAuthorityApproval(authorityApprovalData, "authority@example.com");
      expect(mocks.gmailSendMail).not.toHaveBeenCalled();
      expect(mocks.resendSend).not.toHaveBeenCalled();
    });
  });

  // EMAIL_PROVIDER is unset in all of these — proving "gmail" really is the
  // default provider, not just documented as one.
  describe("live mode, Gmail SMTP (the default provider)", () => {
    beforeEach(() => {
      vi.stubEnv("EMAIL_MODE", "live");
      vi.stubEnv("GMAIL_USER", "mcciaexplore@gmail.com");
      vi.stubEnv("GMAIL_APP_PASSWORD", "test-app-password");
      mocks.gmailSendMail.mockResolvedValue({ messageId: "<abc123@gmail.com>" });
    });

    // Deliberately the first test to actually send in this describe block:
    // the transport is lazily constructed once and cached at module scope
    // (same pattern the old Resend client always used), so asserting on
    // createTransport's call args only works before some earlier test in
    // this file has already triggered — and cached — that construction.
    it("creates the transport via nodemailer's built-in 'gmail' service config, authenticated with GMAIL_USER/GMAIL_APP_PASSWORD", async () => {
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.createTransport).toHaveBeenCalledWith({
        service: "gmail",
        auth: { user: "mcciaexplore@gmail.com", pass: "test-app-password" },
      });
    });

    it("never touches Resend while the default (gmail) provider is active", async () => {
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.resendSend).not.toHaveBeenCalled();
    });

    it("sends with GMAIL_USER as the from address, the real recipient, correct subject and HTML", async () => {
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.gmailSendMail).toHaveBeenCalledWith({
        from: "mcciaexplore@gmail.com",
        to: "submitter@example.com",
        subject: "Payment Advice MCCIA/2026-27/0001 Submitted",
        html: expect.stringContaining("Acme Supplies"),
      });
    });

    it("ignores EMAIL_FROM — Gmail SMTP always sends from GMAIL_USER, since the authenticated account and 'from' must match", async () => {
      vi.stubEnv("EMAIL_FROM", "advices@mcciapune.com");
      await notifySentBack(sentBackData, "submitter@example.com");
      expect(mocks.gmailSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: "mcciaexplore@gmail.com" }),
      );
    });

    it("notifySentBack sends to the submitter with the correct subject", async () => {
      await notifySentBack(sentBackData, "submitter@example.com");
      expect(mocks.gmailSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "submitter@example.com",
          subject: "Action Required: Payment Advice MCCIA/2026-27/0002 Sent Back",
        }),
      );
    });

    it("notifyVerified sends to the submitter with the correct subject", async () => {
      await notifyVerified(verifiedData, "submitter@example.com");
      expect(mocks.gmailSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "submitter@example.com",
          subject: "Payment Advice MCCIA/2026-27/0003 Verified",
        }),
      );
    });

    it("notifyPaymentDone sends to the submitter with the correct subject", async () => {
      await notifyPaymentDone(paymentDoneData, "submitter@example.com");
      expect(mocks.gmailSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "submitter@example.com",
          subject: "Payment Advice MCCIA/2026-27/0009 — Payment Done",
        }),
      );
    });

    it("notifyAuthorityApproval sends to the authority's email when one is on file", async () => {
      await notifyAuthorityApproval(authorityApprovalData, "ganeshm@mcciapune.com");
      expect(mocks.gmailSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "ganeshm@mcciapune.com",
          subject: "Approval Required: Payment Advice MCCIA/2026-27/0004",
        }),
      );
    });

    it("sends to the real recipient with no subject prefix when EMAIL_TEST_OVERRIDE_RECIPIENT is unset", async () => {
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      const call = mocks.gmailSendMail.mock.calls[0][0];
      expect(call.to).toBe("submitter@example.com");
      expect(call.subject).not.toMatch(/^\[TEST/);
    });

    it("redirects every email to EMAIL_TEST_OVERRIDE_RECIPIENT and prefixes the subject when set", async () => {
      vi.stubEnv("EMAIL_TEST_OVERRIDE_RECIPIENT", "tester@example.com");
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.gmailSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "tester@example.com",
          subject: "[TEST — would go to: submitter@example.com] Payment Advice MCCIA/2026-27/0001 Submitted",
        }),
      );
    });

    it("applies the override redirect to every notify function, not just submission confirmation", async () => {
      vi.stubEnv("EMAIL_TEST_OVERRIDE_RECIPIENT", "tester@example.com");
      await notifyAuthorityApproval(authorityApprovalData, "ganeshm@mcciapune.com");
      expect(mocks.gmailSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "tester@example.com",
          subject: expect.stringContaining("[TEST — would go to: ganeshm@mcciapune.com] "),
        }),
      );
    });

    it("notifyAuthorityApproval falls back to preview (no send call) when the authority has no email, logging a clear warning", async () => {
      await notifyAuthorityApproval(authorityApprovalData, null);
      expect(mocks.gmailSendMail).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No email on file for authority Ganesh Mate"),
      );
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Email preview: authority approval]"),
        expect.anything(),
      );
    });

    it("does not fall back to preview for notifyAuthorityApproval when an email IS on file", async () => {
      await notifyAuthorityApproval(authorityApprovalData, "ganeshm@mcciapune.com");
      expect(warnSpy).not.toHaveBeenCalled();
      expect(mocks.gmailSendMail).toHaveBeenCalledTimes(1);
    });

    it("the 'no email on file' fallback is a distinct, expected case — it never writes an EMAIL_SEND_FAILED audit_log row, even with an adviceId given, because it's not a provider failure", async () => {
      await notifyAuthorityApproval(authorityApprovalData, null, "advice-123");
      expect(mocks.auditInsertValues).not.toHaveBeenCalled();
    });

    it("catches an SMTP send failure (nodemailer rejects, e.g. auth/quota) without throwing, and logs it", async () => {
      mocks.gmailSendMail.mockRejectedValue(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"));
      await expect(
        notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com"),
      ).resolves.not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("a send failure does not prevent the notify call from resolving normally for the caller", async () => {
      mocks.gmailSendMail.mockRejectedValue(new Error("boom"));
      const result = await notifySentBack(sentBackData, "submitter@example.com");
      expect(result.subject).toBe("Action Required: Payment Advice MCCIA/2026-27/0002 Sent Back");
    });

    it("writes a distinct EMAIL_SEND_FAILED audit_log row (not the normal notification path) when a provider send fails and an adviceId was given — this is the real-infra-failure case, e.g. missing/invalid GMAIL_APP_PASSWORD, and must not go unnoticed the way it did when Vercel env vars were missing", async () => {
      mocks.gmailSendMail.mockRejectedValue(
        new Error("Invalid login: 535-5.7.8 Username and Password not accepted"),
      );
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com", "advice-123");
      expect(mocks.auditInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentAdviceId: "advice-123",
          action: "EMAIL_SEND_FAILED",
          actor: "System",
          details: expect.objectContaining({
            kind: "submission confirmation",
            provider: "gmail",
            error: expect.stringContaining("Username and Password not accepted"),
          }),
        }),
      );
    });

    it("does not write an audit_log row when no adviceId is given, even on a send failure (adviceId stays optional for callers that don't have one handy)", async () => {
      mocks.gmailSendMail.mockRejectedValue(new Error("boom"));
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.auditInsertValues).not.toHaveBeenCalled();
    });

    it("does not write an EMAIL_SEND_FAILED row when the send succeeds, even with an adviceId given", async () => {
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com", "advice-123");
      expect(mocks.auditInsertValues).not.toHaveBeenCalled();
    });

    it("a failure to write the EMAIL_SEND_FAILED audit_log row itself is swallowed and logged, never thrown", async () => {
      mocks.gmailSendMail.mockRejectedValue(new Error("boom"));
      mocks.auditInsertValues.mockRejectedValueOnce(new Error("db unreachable"));
      await expect(
        notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com", "advice-123"),
      ).resolves.not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Also failed to write EMAIL_SEND_FAILED audit_log row"),
        expect.anything(),
      );
    });
  });

  // Proves the Resend code path is still fully intact and selectable, not
  // deleted, even though gmail is the default — see AGENT_HANDOFF.md.
  describe("live mode, EMAIL_PROVIDER=resend (dormant-but-ready)", () => {
    beforeEach(() => {
      vi.stubEnv("EMAIL_MODE", "live");
      vi.stubEnv("EMAIL_PROVIDER", "resend");
      vi.stubEnv("RESEND_API_KEY", "test-key");
      mocks.resendSend.mockResolvedValue({ data: { id: "email_123" }, error: null });
    });

    it("never touches the Gmail transport while EMAIL_PROVIDER=resend", async () => {
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.gmailSendMail).not.toHaveBeenCalled();
    });

    it("calls Resend with the real recipient, correct subject, HTML, and the default from address", async () => {
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.resendSend).toHaveBeenCalledWith({
        from: "onboarding@resend.dev",
        to: "submitter@example.com",
        subject: "Payment Advice MCCIA/2026-27/0001 Submitted",
        html: expect.stringContaining("Acme Supplies"),
      });
    });

    it("uses EMAIL_FROM instead of the default when set", async () => {
      vi.stubEnv("EMAIL_FROM", "advices@mcciapune.com");
      await notifySentBack(sentBackData, "submitter@example.com");
      expect(mocks.resendSend).toHaveBeenCalledWith(expect.objectContaining({ from: "advices@mcciapune.com" }));
    });

    it("redirects to EMAIL_TEST_OVERRIDE_RECIPIENT and prefixes the subject, same as the gmail provider", async () => {
      vi.stubEnv("EMAIL_TEST_OVERRIDE_RECIPIENT", "tester@example.com");
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.resendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "tester@example.com",
          subject: "[TEST — would go to: submitter@example.com] Payment Advice MCCIA/2026-27/0001 Submitted",
        }),
      );
    });

    it("notifyAuthorityApproval falls back to preview when the authority has no email", async () => {
      await notifyAuthorityApproval(authorityApprovalData, null);
      expect(mocks.resendSend).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No email on file for authority Ganesh Mate"),
      );
    });

    it("catches a Resend API-level error (result.error, not a throw) without throwing, and logs it", async () => {
      mocks.resendSend.mockResolvedValue({
        data: null,
        error: { message: "Invalid `to` field", statusCode: 422, name: "validation_error" },
      });
      await expect(
        notifySubmissionConfirmation(submissionConfirmationData, "not-an-email"),
      ).resolves.not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("catches a network-level throw from Resend without throwing, and logs it", async () => {
      mocks.resendSend.mockRejectedValue(new Error("network unreachable"));
      await expect(
        notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com"),
      ).resolves.not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("a Resend failure does not prevent the notify call from resolving normally for the caller", async () => {
      mocks.resendSend.mockRejectedValue(new Error("boom"));
      const result = await notifySentBack(sentBackData, "submitter@example.com");
      expect(result.subject).toBe("Action Required: Payment Advice MCCIA/2026-27/0002 Sent Back");
    });
  });
});
