import { describe, expect, it } from "vitest";
import { buildMsmeMailtoHref, buildMsmeRequestEmail } from "./msme-email-template";

describe("buildMsmeRequestEmail", () => {
  it("fills vendor/submitter names and computes the deadline as 7 calendar days from today", () => {
    const { subject, body } = buildMsmeRequestEmail({
      vendorName: "Example Vendor Pvt Ltd",
      submitterName: "Jane Submitter",
      today: "2026-10-01",
    });
    expect(subject).toBe("MSME Status Declaration Required — Example Vendor Pvt Ltd");
    expect(body).toContain("Dear Example Vendor Pvt Ltd,");
    expect(body).toContain("Jane Submitter");
    expect(body).toContain("Mahratta Chamber of Commerce, Industries & Agriculture");
    expect(body).toContain("Specified Companies (Furnishing of information about payment to micro and small enterprise suppliers) Order, 2019");
    // 7 calendar days after 2026-10-01 is 2026-10-08, formatted DD/MM/YYYY.
    expect(body).toContain("If we don't hear back by 08/10/2026");
  });

  it("defaults to today when no date is supplied (not hardcoded)", () => {
    const a = buildMsmeRequestEmail({ vendorName: "X", submitterName: "Y", today: "2026-01-01" });
    const b = buildMsmeRequestEmail({ vendorName: "X", submitterName: "Y", today: "2026-06-15" });
    expect(a.body).not.toBe(b.body);
  });

  it("is plain text - no HTML tags", () => {
    const { body } = buildMsmeRequestEmail({ vendorName: "X & Co", submitterName: "Y", today: "2026-10-01" });
    expect(body).not.toMatch(/<[a-z][\s\S]*>/i);
  });
});

describe("buildMsmeMailtoHref", () => {
  it("builds a mailto: link with no recipient when the vendor's email is unknown (not collected by this form)", () => {
    const href = buildMsmeMailtoHref({ subject: "Subj", body: "Line one\nLine two" });
    expect(href.startsWith("mailto:?")).toBe(true);
    expect(href).toContain("subject=Subj");
  });

  it("includes the recipient when a vendor email is supplied", () => {
    const href = buildMsmeMailtoHref({ vendorEmail: "vendor@example.com", subject: "S", body: "B" });
    expect(href.startsWith("mailto:vendor%40example.com?")).toBe(true);
  });
});
