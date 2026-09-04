import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SentBackIndicators } from "@/components/admin/SentBackIndicators";
import { ResubmissionNotice } from "@/components/authority/ResubmissionNotice";

describe("send-back status UI", () => {
  it("renders stale and expired indicators distinctly", () => {
    const now = Date.now();
    const html = renderToStaticMarkup(
      <SentBackIndicators
        sentBackAt={new Date(now - 15 * 24 * 60 * 60 * 1000)}
        editTokenExpiresAt={new Date(now - 24 * 60 * 60 * 1000)}
      />,
    );
    expect(html).toContain("Sent back 15 days ago");
    expect(html).toContain("Edit link expired");
    expect(html).toContain("bg-red-100");
  });

  it("leaves first-time authority requests unmarked", () => {
    expect(renderToStaticMarkup(<ResubmissionNotice revisionCount={0} previousRemarks={null} />))
      .toBe("");
  });

  it("renders a revision number and latest previous remarks", () => {
    const html = renderToStaticMarkup(
      <ResubmissionNotice revisionCount={2} previousRemarks="Correct the GST amount" />,
    );
    expect(html).toContain("resubmission (revision 2)");
    expect(html).toContain("Previous remarks: Correct the GST amount");
  });
});
