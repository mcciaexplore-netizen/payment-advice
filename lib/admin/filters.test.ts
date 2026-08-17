import { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ADMIN_TABS, buildTabCondition, isAdminTab } from "./filters";

/** Drizzle SQL condition objects are circular (they reference the table)
 * and have no useful toString(), so the only reliable way to inspect what
 * a condition actually filters on is to walk queryChunks for the literal
 * values bound as query params (e.g. 'SUBMITTED' / 'APPROVED'). */
function extractBoundParams(chunk: unknown, out: unknown[] = []): unknown[] {
  if (chunk == null) return out;
  if (Array.isArray(chunk)) {
    for (const c of chunk) extractBoundParams(c, out);
    return out;
  }
  const obj = chunk as { value?: unknown; constructor?: { name?: string }; queryChunks?: unknown };
  if (obj.constructor?.name === "Param" && obj.value !== undefined) out.push(obj.value);
  if (obj.queryChunks) extractBoundParams(obj.queryChunks, out);
  return out;
}

describe("isAdminTab", () => {
  it("accepts every known pipeline-stage tab value", () => {
    for (const tab of ADMIN_TABS) {
      expect(isAdminTab(tab)).toBe(true);
    }
  });

  it("rejects anything else, including undefined/empty and the retired 'ready_finance' name", () => {
    expect(isAdminTab(undefined)).toBe(false);
    expect(isAdminTab(null)).toBe(false);
    expect(isAdminTab("")).toBe(false);
    expect(isAdminTab("approved")).toBe(false);
    expect(isAdminTab("ready_finance")).toBe(false);
  });
});

describe("buildTabCondition", () => {
  it("imposes no extra condition for 'all', matching the pre-existing unfiltered list", () => {
    expect(buildTabCondition("all")).toBeUndefined();
  });

  it("produces a real, distinct SQL condition for each pipeline-stage tab", () => {
    const stageTabs = ADMIN_TABS.filter((t) => t !== "all");
    const conditions = stageTabs.map((tab) => buildTabCondition(tab));
    for (const condition of conditions) {
      expect(condition).toBeInstanceOf(SQL);
    }
    // Every stage tab's condition object is distinct — no two stages
    // silently collapse onto the same SQL (which would show the same rows
    // in two different tabs).
    const unique = new Set(conditions);
    expect(unique.size).toBe(conditions.length);
  });

  it("keys 'payment_done' on status APPROVED AND payment_mode CASH — Cash's tab, unaffected by NEFT's multi-part model", () => {
    // The other four stage tabs all imply status SUBMITTED; once Payment
    // Done fires, status flips to APPROVED, so this one has to filter on a
    // different status value — a regression guard against it silently
    // becoming "status SUBMITTED && paymentDoneAt set" (which would always
    // be empty, since Payment Done always flips status to APPROVED in the
    // same write). Also scoped to CASH so NEFT's fully-settled rows land in
    // "fully_payment_settled" instead — see AGENT_HANDOFF.md.
    const params = extractBoundParams(buildTabCondition("payment_done"));
    expect(params).toContain("APPROVED");
    expect(params).toContain("CASH");
    expect(params).not.toContain("SUBMITTED");
    expect(params).not.toContain("NEFT");
  });

  it("keys 'fully_payment_settled' on status APPROVED AND payment_mode NEFT", () => {
    const params = extractBoundParams(buildTabCondition("fully_payment_settled"));
    expect(params).toContain("APPROVED");
    expect(params).toContain("NEFT");
    expect(params).not.toContain("CASH");
  });

  it("keys 'partial_payment_done' on status SUBMITTED AND payment_mode NEFT", () => {
    const params = extractBoundParams(buildTabCondition("partial_payment_done"));
    expect(params).toContain("SUBMITTED");
    expect(params).toContain("NEFT");
    expect(params).not.toContain("CASH");
  });

  it("keys the other stage tabs on status SUBMITTED", () => {
    for (const tab of [
      "waiting_authority",
      "awaiting_finance",
      "received_in_process",
      "verified_ready_payment",
      "partial_payment_done",
    ] as const) {
      expect(extractBoundParams(buildTabCondition(tab))).toContain("SUBMITTED");
    }
  });

  it("'verified_ready_payment' also requires total_paid = 0, so a NEFT row with a partial payment recorded falls out into 'partial_payment_done' instead", () => {
    // Cash rows never write to total_paid (always "0.00"), so this
    // condition is a no-op for them — a regression guard, not a behavior
    // change for Cash.
    expect(extractBoundParams(buildTabCondition("verified_ready_payment"))).toContain("0");
  });

  it("keys 'sent_back' on status SENT_BACK, not SUBMITTED or APPROVED", () => {
    expect(extractBoundParams(buildTabCondition("sent_back"))).toContain("SENT_BACK");
    expect(extractBoundParams(buildTabCondition("sent_back"))).not.toContain("SUBMITTED");
    expect(extractBoundParams(buildTabCondition("sent_back"))).not.toContain("APPROVED");
  });
});
