import { describe, expect, it } from "vitest";
import { resolveSourceFieldAutoFill } from "./source-field-autofill";

describe("resolveSourceFieldAutoFill", () => {
  it("fills the target when the source has a value and the target is empty", () => {
    expect(resolveSourceFieldAutoFill("Priya Sharma", "", null)).toEqual({
      type: "fill",
      value: "Priya Sharma",
    });
  });

  it("does nothing when the source is empty and the target is already empty", () => {
    expect(resolveSourceFieldAutoFill("", "", null)).toEqual({ type: "none" });
  });

  it("never overwrites a value the submitter manually typed into the target (not our last auto-fill)", () => {
    expect(resolveSourceFieldAutoFill("Priya Sharma", "Acme Supplies", null)).toEqual({
      type: "none",
    });
  });

  it("never overwrites an /edit/[token] resubmit prefill — a non-empty value we never auto-filled ourselves", () => {
    expect(resolveSourceFieldAutoFill("Priya Sharma", "Acme Supplies", null)).toEqual({
      type: "none",
    });
  });

  it("re-derives a stale auto-fill to the new source value when the source changes", () => {
    // The target holds exactly what we auto-filled last time — safe to
    // replace with the source's new value.
    expect(resolveSourceFieldAutoFill("Priya S. Sharma", "Priya Sharma", "Priya Sharma")).toEqual({
      type: "fill",
      value: "Priya S. Sharma",
    });
  });

  it("clears a stale auto-fill when the source becomes empty", () => {
    expect(resolveSourceFieldAutoFill("", "Priya Sharma", "Priya Sharma")).toEqual({
      type: "clear",
    });
  });

  it("does NOT clear/replace a manual edit made after an auto-fill, even when the source changes", () => {
    // Target no longer equals what was last auto-filled — the submitter
    // edited it themselves in between.
    expect(resolveSourceFieldAutoFill("Priya S. Sharma", "Custom Payee", "Priya Sharma")).toEqual({
      type: "none",
    });
  });

  it("does nothing (no-op) when the source changes but the target is already empty and the new source is also empty", () => {
    expect(resolveSourceFieldAutoFill("", "", "Priya Sharma")).toEqual({ type: "none" });
  });
});
