import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: mocks.send } })),
}));

import {
  notifyAuthorityApproval,
  notifySentBack,
  notifySubmissionConfirmation,
  notifyVerified,
} from "./notify";

const submissionConfirmationData = {
  serialNo: "MCCIA/2026-27/0001",
  authorityName: "Asha Rao",
  submittedByName: "Priya Sharma",
  payeeName: "Acme Supplies",
  amount: "1,250.00",
  paymentMode: "NEFT",
  formDate: "30/07/2026",
  paymentAdvicePdfLink: "https://example.test/advice/id/pdf",
};

const sentBackData = {
  serialNo: "MCCIA/2026-27/0002",
  submittedByName: "Priya Sharma",
  sentBackBy: "Admin",
  remarks: "Please fix the amount",
  payeeName: "Acme Supplies",
  amount: "850.00",
  editLink: "https://example.test/edit/token",
};

const verifiedData = {
  serialNo: "MCCIA/2026-27/0003",
  submittedByName: "Priya Sharma",
  verifiedBy: "Sunil Salunke",
  documentLabel: "Payment Advice",
  payeeName: "Acme Supplies",
  amount: "850.00",
  formDate: "30/07/2026",
};

const authorityApprovalData = {
  serialNo: "MCCIA/2026-27/0004",
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
    it("makes zero calls to Resend when EMAIL_MODE is unset", async () => {
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.send).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Email preview: submission confirmation]"),
        expect.anything(),
      );
    });

    it("makes zero calls for any EMAIL_MODE value other than exactly 'live'", async () => {
      vi.stubEnv("EMAIL_MODE", "Live"); // wrong case — must not match
      await notifySentBack(sentBackData, "submitter@example.com");
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("every notify function stays in preview mode by default", async () => {
      await notifyVerified(verifiedData, "submitter@example.com");
      await notifyAuthorityApproval(authorityApprovalData, "authority@example.com");
      expect(mocks.send).not.toHaveBeenCalled();
    });
  });

  describe("live mode", () => {
    beforeEach(() => {
      vi.stubEnv("EMAIL_MODE", "live");
      vi.stubEnv("RESEND_API_KEY", "test-key");
      mocks.send.mockResolvedValue({ data: { id: "email_123" }, error: null });
    });

    it("calls Resend with the real recipient, correct subject, HTML, and the default from address", async () => {
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.send).toHaveBeenCalledWith({
        from: "onboarding@resend.dev",
        to: "submitter@example.com",
        subject: "Payment Advice MCCIA/2026-27/0001 Submitted",
        html: expect.stringContaining("Acme Supplies"),
      });
    });

    it("uses EMAIL_FROM instead of the default when set", async () => {
      vi.stubEnv("EMAIL_FROM", "advices@mcciapune.com");
      await notifySentBack(sentBackData, "submitter@example.com");
      expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ from: "advices@mcciapune.com" }));
    });

    it("notifySentBack sends to the submitter with the correct subject", async () => {
      await notifySentBack(sentBackData, "submitter@example.com");
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "submitter@example.com",
          subject: "Action Required: Payment Advice MCCIA/2026-27/0002 Sent Back",
        }),
      );
    });

    it("notifyVerified sends to the submitter with the correct subject", async () => {
      await notifyVerified(verifiedData, "submitter@example.com");
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "submitter@example.com",
          subject: "Payment Advice MCCIA/2026-27/0003 Verified",
        }),
      );
    });

    it("notifyAuthorityApproval sends to the authority's email when one is on file", async () => {
      await notifyAuthorityApproval(authorityApprovalData, "ganeshm@mcciapune.com");
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "ganeshm@mcciapune.com",
          subject: "Approval Required: Payment Advice MCCIA/2026-27/0004",
        }),
      );
    });

    it("sends to the real recipient with no subject prefix when EMAIL_TEST_OVERRIDE_RECIPIENT is unset", async () => {
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      const call = mocks.send.mock.calls[0][0];
      expect(call.to).toBe("submitter@example.com");
      expect(call.subject).not.toMatch(/^\[TEST/);
    });

    it("redirects every email to EMAIL_TEST_OVERRIDE_RECIPIENT and prefixes the subject when set", async () => {
      vi.stubEnv("EMAIL_TEST_OVERRIDE_RECIPIENT", "tester@example.com");
      await notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com");
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "tester@example.com",
          subject: "[TEST — would go to: submitter@example.com] Payment Advice MCCIA/2026-27/0001 Submitted",
        }),
      );
    });

    it("applies the override redirect to every notify function, not just submission confirmation", async () => {
      vi.stubEnv("EMAIL_TEST_OVERRIDE_RECIPIENT", "tester@example.com");
      await notifyAuthorityApproval(authorityApprovalData, "ganeshm@mcciapune.com");
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "tester@example.com",
          subject: expect.stringContaining("[TEST — would go to: ganeshm@mcciapune.com] "),
        }),
      );
    });

    it("notifyAuthorityApproval falls back to preview (no Resend call) when the authority has no email, logging a clear warning", async () => {
      await notifyAuthorityApproval(authorityApprovalData, null);
      expect(mocks.send).not.toHaveBeenCalled();
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
      expect(mocks.send).toHaveBeenCalledTimes(1);
    });

    it("catches a Resend API-level error (result.error, not a throw) without throwing, and logs it", async () => {
      mocks.send.mockResolvedValue({
        data: null,
        error: { message: "Invalid `to` field", statusCode: 422, name: "validation_error" },
      });
      await expect(
        notifySubmissionConfirmation(submissionConfirmationData, "not-an-email"),
      ).resolves.not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("catches a network-level throw from Resend without throwing, and logs it", async () => {
      mocks.send.mockRejectedValue(new Error("network unreachable"));
      await expect(
        notifySubmissionConfirmation(submissionConfirmationData, "submitter@example.com"),
      ).resolves.not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("a Resend failure does not prevent the notify call from resolving normally for the caller", async () => {
      mocks.send.mockRejectedValue(new Error("boom"));
      const result = await notifySentBack(sentBackData, "submitter@example.com");
      expect(result.subject).toBe("Action Required: Payment Advice MCCIA/2026-27/0002 Sent Back");
    });
  });
});
