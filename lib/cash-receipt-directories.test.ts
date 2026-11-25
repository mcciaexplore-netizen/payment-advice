import { describe, expect, it } from "vitest";
import { DIRECTORIES, DIRECTORY_OPTIONS, directoryNeedsMemberId, directoryParticulars, directoryPrice } from "@/lib/cash-receipt-directories";
import { cashReceiptSchema } from "@/lib/validation/cash-receipt";
import { categoryForParticulars } from "@/lib/cash-receipt-report";

describe("Cash Receipt directories", () => {
  it("lists every directory once, with the Electronics Directory for members and non-members", () => {
    expect(DIRECTORY_OPTIONS).toEqual([
      "Defence Directory - Member",
      "Defence Directory - Non-member",
      "Electronics Directory - Member",
      "Electronics Directory - Non-member",
      "Agriculture Directory",
    ]);
    expect(new Set(DIRECTORY_OPTIONS).size).toBe(DIRECTORIES.length);
  });

  it("fills in the price: Electronics Rs. 600 for a member and Rs. 1200 for a non-member, the others unchanged", () => {
    expect(directoryPrice("Electronics Directory - Member")).toBe("600");
    expect(directoryPrice("Electronics Directory - Non-member")).toBe("1200");
    expect(directoryPrice("Defence Directory - Member")).toBe("900");
    expect(directoryPrice("Defence Directory - Non-member")).toBe("1500");
    expect(directoryPrice("Agriculture Directory")).toBe("500");
    expect(directoryPrice("")).toBe("");
    expect(directoryPrice("Something else")).toBe("");
  });

  it("asks for a Member ID for the member directories only", () => {
    expect(directoryNeedsMemberId("Electronics Directory - Member")).toBe(true);
    expect(directoryNeedsMemberId("Defence Directory - Member")).toBe(true);
    expect(directoryNeedsMemberId("Electronics Directory - Non-member")).toBe(false);
    expect(directoryNeedsMemberId("Defence Directory - Non-member")).toBe(false);
    expect(directoryNeedsMemberId("Agriculture Directory")).toBe(false);
    expect(directoryNeedsMemberId("")).toBe(false);
  });

  it("saves the same text as before for the existing directories, and the new one in the same shape", () => {
    expect(directoryParticulars("Defence Directory - Member", " 123 ")).toBe("Sale of Directory - Defence Directory - Member (Member ID: 123)");
    expect(directoryParticulars("Defence Directory - Non-member", "")).toBe("Sale of Directory - Defence Directory - Non-member");
    expect(directoryParticulars("Agriculture Directory", "")).toBe("Sale of Directory - Agriculture Directory");
    expect(directoryParticulars("Electronics Directory - Member", "M-45")).toBe("Sale of Directory - Electronics Directory - Member (Member ID: M-45)");
    expect(directoryParticulars("Electronics Directory - Non-member", "ignored")).toBe("Sale of Directory - Electronics Directory - Non-member");
  });

  it("the server accepts the new receipt lines, and the daily report counts them under Directories", () => {
    const items = [
      { particulars: directoryParticulars("Electronics Directory - Member", "M-45"), copies: 2, price: 600 },
      { particulars: directoryParticulars("Electronics Directory - Non-member", ""), copies: 1, price: 1200 },
    ];
    expect(cashReceiptSchema.safeParse({ partyName: "Forbes Marshall", items }).success).toBe(true);
    for (const item of items) expect(categoryForParticulars(item.particulars)).toBe("Directories");
  });
});
