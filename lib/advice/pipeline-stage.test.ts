import { describe, expect, it } from "vitest";
import { pipelineStageFor, PipelineStageAdvice } from "./pipeline-stage";

const base: PipelineStageAdvice = {
  status: "SUBMITTED", approvedAt: null, financeReceivedAt: null,
  verifiedAt: null, paymentDoneAt: null, paymentMode: "NEFT", totalPaid: "0",
};

describe("pipelineStageFor", () => {
  it.each([
    [{}, "Waiting on Authority"],
    [{ approvedAt: new Date() }, "Awaiting Finance Review"],
    [{ approvedAt: new Date(), financeReceivedAt: new Date() }, "Received & In Process"],
    [{ approvedAt: new Date(), financeReceivedAt: new Date(), verifiedAt: new Date() }, "Verified — Ready for Payment"],
    [{ approvedAt: new Date(), financeReceivedAt: new Date(), verifiedAt: new Date(), totalPaid: "25" }, "Partial Payment Done"],
    [{ status: "APPROVED" }, "Fully Payment Settled"],
    [{ status: "APPROVED", paymentMode: "CASH" }, "Payment Done"],
    [{ status: "SENT_BACK" }, "Sent Back"],
  ] as const)("derives a pipeline stage", (changes, expected) => {
    expect(pipelineStageFor({ ...base, ...changes })).toBe(expected);
  });
});
