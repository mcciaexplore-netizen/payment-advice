import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { RefundForm } from "@/components/form/RefundForm";

describe("Refund form", () => {
  it("keeps optional payee fields in the Payment Advice order and includes Other Documents", () => {
    const html = renderToStaticMarkup(createElement(RefundForm, { authorityOptions: [], persist: false }));
    const fieldOrder = [
      "Payee / Company Name",
      "Address",
      "Contact Person",
      "Contact Phone",
      "E-mail ID",
      "GSTIN",
      "Udyam / MSME No.",
    ];
    const positions = fieldOrder.map((label) => html.indexOf(label));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toMatch(/<input[^>]*required=""[^>]*name="payeeName"/);
    expect(html).toContain("Other Documents");
    expect(html).toContain("PDF, JPEG, or PNG, max 10 MB per file.");
  });

  it("uses matching textarea sizes for Enclosures and Remarks", () => {
    const html = renderToStaticMarkup(createElement(RefundForm, { authorityOptions: [], persist: false }));
    expect(html).toContain('name="enclosures" rows="2"');
    expect(html).toContain('name="specialRemarks" rows="2"');
  });

  it("says Preview while saving is off and Submit once it is on, with no em dashes in the copy", () => {
    const preview = renderToStaticMarkup(createElement(RefundForm, { authorityOptions: [], persist: false }));
    const live = renderToStaticMarkup(createElement(RefundForm, { authorityOptions: ["Head Admin"], persist: true }));
    expect(preview).toContain("Preview Refund Request");
    expect(live).toContain("Submit Refund Request");
    expect(live).toContain('<option value="Head Admin">');
    expect(preview + live).not.toContain("\u2014");
  });
});
