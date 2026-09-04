import { describe, expect, it } from "vitest";
import { formatIstDate, formatIstDateTime, todayInIst } from "@/lib/date-time";

describe("IST date helpers", () => {
  const earlyMorningIst = new Date("2026-03-31T19:00:00.000Z"); // 1 Apr, 00:30 IST

  it("uses the next IST calendar day while UTC is still on the previous day", () => {
    expect(todayInIst(earlyMorningIst)).toBe("2026-04-01");
    expect(formatIstDate(earlyMorningIst)).toBe("01/04/2026");
    expect(formatIstDateTime(earlyMorningIst)).toContain("01/04/2026");
  });
});
