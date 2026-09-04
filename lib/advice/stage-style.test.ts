import { describe, expect, it } from "vitest";
import { ADMIN_TABS } from "@/lib/admin/filters";
import { PIPELINE_STAGE_ORDER, STAGE_FOR_TAB, STAGE_STYLE } from "./stage-style";

describe("pipeline stage presentation", () => {
  it("maps every stage tab to a styled pipeline stage", () => {
    const stageTabs = ADMIN_TABS.filter((tab) => tab !== "all");
    expect(Object.keys(STAGE_FOR_TAB)).toEqual(stageTabs);
    expect(Object.keys(STAGE_STYLE)).toEqual(PIPELINE_STAGE_ORDER);
  });

  it("uses concise labels while retaining text for every color-coded stage", () => {
    expect(PIPELINE_STAGE_ORDER.map((stage) => STAGE_STYLE[stage].shortLabel)).toEqual([
      "Submitted", "Recommended", "Advance", "In Process", "Verified",
      "Partial Paid", "Paid", "Paid", "Sent Back",
    ]);
    for (const stage of PIPELINE_STAGE_ORDER) {
      expect(STAGE_STYLE[stage].badge).toContain("text-");
      expect(STAGE_STYLE[stage].dot).toContain("bg-");
    }
  });

  it("shares the completed-state color family", () => {
    expect(STAGE_STYLE["Fully Payment Settled"]).toEqual(STAGE_STYLE["Payment Done"]);
  });
});
