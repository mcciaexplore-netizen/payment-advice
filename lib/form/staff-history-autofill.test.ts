import { describe, expect, it } from "vitest";
import { resolveStaffBranch, resolveStaffDepartment } from "./staff-history-autofill";

describe("resolveStaffDepartment", () => {
  it("uses the matching department option for known departments", () => {
    expect(resolveStaffDepartment("AGRICULTURE")).toEqual({
      option: "AGRICULTURE",
      submittedByDepartment: "AGRICULTURE",
    });
  });

  it("preserves historical department text using the Others option when it is not listed", () => {
    expect(resolveStaffDepartment("FINANCE")).toEqual({
      option: "OTHERS",
      submittedByDepartment: "FINANCE",
    });
  });

  it("does not fill an empty historical department", () => {
    expect(resolveStaffDepartment(null)).toBeNull();
    expect(resolveStaffDepartment("")).toBeNull();
  });
});

describe("resolveStaffBranch", () => {
  it("accepts a configured branch from the historical submission", () => {
    expect(resolveStaffBranch("Hadapsar Office")).toBe("Hadapsar Office");
  });

  it("ignores missing or unsupported historical branches", () => {
    expect(resolveStaffBranch(null)).toBeNull();
    expect(resolveStaffBranch("Unknown Office")).toBeNull();
  });
});
