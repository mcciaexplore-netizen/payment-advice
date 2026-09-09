import { describe, expect, it } from "vitest";
import { submissionPdfHref } from "./submission-pdf";

describe("My Submissions PDF route selection", () => {
  it.each([
    [{ id: "neft-id", paymentMode: "NEFT", isAdvance: false }, "/api/advice/neft-id/pdf"],
    [{ id: "cash-id", paymentMode: "CASH", isAdvance: false }, "/api/advice/cash-id/cash-voucher-pdf"],
    [{ id: "advance-id", paymentMode: "NEFT", isAdvance: true }, "/api/advice/advance-id/pdf"],
  ])("selects the existing UUID route for %#", (advice, expected) => {
    expect(submissionPdfHref(advice)).toBe(expected);
  });
});
