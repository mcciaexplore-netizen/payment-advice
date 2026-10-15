import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RefundForm } from "@/components/form/RefundForm";

describe("Refund form", () => {
  it("keeps optional payee fields in the Payment Advice order and includes Other Documents", () => {
    const html = renderToStaticMarkup(createElement(RefundForm, { authorityOptions: [] }));
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
    expect(html).toMatch(/<input[^>]*required=""[^>]*name="payeeDetails"/);
    expect(html).toContain("Other Documents");
    expect(html).toContain("PDF, JPEG, or PNG, max 10 MB per file.");
  });

  it("uses matching textarea sizes for Enclosures and Remarks", () => {
    const html = renderToStaticMarkup(createElement(RefundForm, { authorityOptions: [] }));
    expect(html).toContain('name="enclosures" rows="2"');
    expect(html).toContain('name="specialRemarks" rows="2"');
  });
});
