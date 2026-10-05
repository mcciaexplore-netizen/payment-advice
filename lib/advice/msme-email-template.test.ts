import { describe, expect, it } from "vitest";
import { computeMsmeRequestDeadline } from "./msme-email-template";

describe("computeMsmeRequestDeadline", () => {
  it("is 7 calendar days after the given date, formatted DD/MM/YYYY", () => {
    expect(computeMsmeRequestDeadline("2026-10-01")).toBe("08/10/2026");
  });

  it("is not hardcoded - varies with the input date", () => {
    expect(computeMsmeRequestDeadline("2026-01-01")).not.toBe(computeMsmeRequestDeadline("2026-06-15"));
  });

  it("crosses a month boundary correctly", () => {
    expect(computeMsmeRequestDeadline("2026-01-28")).toBe("04/02/2026");
  });
});
