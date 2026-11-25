import { describe, expect, it } from "vitest";
import { renderRefundAuthorityEmail, renderRefundRecommendedEmail, renderRefundRejectedEmail, renderRefundSentBackEmail, renderRefundSubmittedEmail } from "@/lib/email/templates";

const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const base = { displayNo: "REF/MCCIA/2026-27/0008", submittedByName: "Sandhya Acharya", payeeName: "Deccan Mechanical", amount: "4,720.00" };

describe("Refund emails (their own wording, accurate for a refund)", () => {
  it("asks the authority to review, with a link to the review page that says sign-in is needed", () => {
    const { subject, html } = renderRefundAuthorityEmail({ ...base, authorityName: "Aniruddha Brahma", natureOfExpenditure: "Refund of participation fee", requestDate: "2026-11-24", reviewLink: "https://payment-advice.vercel.app/authority/refund/abc" });
    expect(subject).toBe("Recommendation Required: Third Party Refund Request REF/MCCIA/2026-27/0008");
    const body = text(html);
    expect(body).toContain("Dear Aniruddha Brahma");
    expect(body).toContain("Recommending Authority for this third party refund request, submitted by Sandhya Acharya on 24/11/2026");
    expect(body).toContain("Payee Deccan Mechanical");
    expect(body).toContain("Amount ₹ 4,720.00");
    expect(body).toContain("Reason Refund of participation fee");
    expect(body).toContain("Sign in with your MCCIA account to continue.");
    expect(html).toContain('href="https://payment-advice.vercel.app/authority/refund/abc"');
    // None of the Payment Advice wording that would be untrue for a refund.
    expect(body).not.toContain("does not require a login");
    expect(body).not.toContain("Payment Mode");
    expect(body).not.toContain("Bill / Reference");
  });

  it("confirms to the submitter who it was routed to and where to find it", () => {
    const { subject, html } = renderRefundSubmittedEmail({ ...base, authorityName: "Aniruddha Brahma", requestDate: "2026-11-24", myRefundsLink: "https://payment-advice.vercel.app/authority?view=my-refunds" });
    expect(subject).toBe("Third Party Refund Request REF/MCCIA/2026-27/0008 Submitted");
    const body = text(html);
    expect(body).toContain("routed to Aniruddha Brahma (Recommending Authority) for recommendation");
    expect(body).toContain("under My Third Party Refunds on your dashboard");
    expect(body).not.toContain("attach the corresponding documents");
    expect(body).not.toContain("business days");
  });

  it("tells the submitter it was recommended and forwarded to Finance", () => {
    const { subject, html } = renderRefundRecommendedEmail({ ...base, recommendedBy: "Aniruddha Brahma", requestDate: "2026-11-24" });
    expect(subject).toBe("Third Party Refund Request REF/MCCIA/2026-27/0008 Recommended - Forwarded to Finance");
    expect(text(html)).toContain("recommended by Aniruddha Brahma and forwarded to the Finance & Accounts team");
    expect(text(html)).toContain("Current Stage Awaiting Finance Review");
  });

  it("sends the remarks back with a link to edit and resubmit the same request (same reference number)", () => {
    const link = "https://payment-advice.vercel.app/refund/edit/71111111-1111-4111-8111-111111111111";
    const { subject, html } = renderRefundSentBackEmail({ ...base, sentBackBy: "Aniruddha Brahma", remarks: "Amount does not match the invoice", editLink: link });
    expect(subject).toBe("Action Required: Third Party Refund Request REF/MCCIA/2026-27/0008 Sent Back");
    const body = text(html);
    expect(body).toContain("sent back by Aniruddha Brahma");
    expect(body).toContain("edit and resubmit the same request. It keeps its reference number and goes back to the same recommending authority.");
    expect(body).toContain("Remarks Amount does not match the invoice");
    expect(body).toContain("Edit and Resubmit");
    expect(html).toContain(`href="${link}"`);
    expect(body).not.toContain("submit a new third party refund request");
    expect(body).not.toContain("expires in 14 days");
  });

  it("tells the submitter it was rejected, that it is final, and why", () => {
    const { subject, html } = renderRefundRejectedEmail({ ...base, rejectedBy: "Aniruddha Brahma", remarks: "Not a refundable item" });
    expect(subject).toBe("Third Party Refund Request REF/MCCIA/2026-27/0008 Rejected");
    const body = text(html);
    expect(body).toContain("rejected by Aniruddha Brahma");
    expect(body).toContain("This is final: the request is closed and will not be processed or paid.");
    expect(body).toContain("Reason Not a refundable item");
    expect(body).toContain("will never be reused");
    expect(html).not.toContain("\u2014");
  });

  it("escapes anything typed by a person before it goes into the HTML", () => {
    const { html } = renderRefundSentBackEmail({ ...base, submittedByName: "<b>Eve</b>", payeeName: "A & B <script>", sentBackBy: "X", remarks: '"><img src=x>', editLink: "https://x/refund?a=1&b=2" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(html).toContain("A &amp; B &lt;script&gt;");
    expect(html).toContain("a=1&amp;b=2");
  });
});
