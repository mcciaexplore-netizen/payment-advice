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

  it("keys 'sanctioned_ready' on status APPROVED, not status SUBMITTED", () => {
    // The other four stage tabs all imply status SUBMITTED; once sanctioned,
    // status flips to APPROVED, so this one has to filter on a different
    // status value — a regression guard against it silently becoming
    // "status SUBMITTED && sanctionedAt set" (which would always be empty,
    // since sanctioning always flips status to APPROVED in the same write).
    expect(extractBoundParams(buildTabCondition("sanctioned_ready"))).toContain("APPROVED");
    expect(extractBoundParams(buildTabCondition("sanctioned_ready"))).not.toContain("SUBMITTED");
  });

  it("keys the other four stage tabs on status SUBMITTED", () => {
    for (const tab of ["waiting_authority", "awaiting_finance", "received_in_process", "verified_awaiting_sanction"] as const) {
      expect(extractBoundParams(buildTabCondition(tab))).toContain("SUBMITTED");
    }
  });

  it("keys 'sent_back' on status SENT_BACK, not SUBMITTED or APPROVED", () => {
    expect(extractBoundParams(buildTabCondition("sent_back"))).toContain("SENT_BACK");
    expect(extractBoundParams(buildTabCondition("sent_back"))).not.toContain("SUBMITTED");
    expect(extractBoundParams(buildTabCondition("sent_back"))).not.toContain("APPROVED");
  });
});
