import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubmitterEditAction } from "@/components/admin/SubmitterEditAction";

describe("SubmitterEditAction", () => {
  it("shows the sent-back email action while the same edit token is still valid", () => {
    const html = renderToStaticMarkup(<SubmitterEditAction
      status="SENT_BACK"
      editToken="active-edit-token"
      editTokenExpiresAt={new Date(Date.now() + 60_000)}
    />);

    expect(html).toContain('href="/edit/active-edit-token"');
    expect(html).toContain("Edit &amp; Resubmit");
  });

  it("shows an expired message instead of an expired or missing edit link", () => {
    const expired = renderToStaticMarkup(<SubmitterEditAction
      status="SENT_BACK"
      editToken="expired-edit-token"
      editTokenExpiresAt={new Date(Date.now() - 60_000)}
    />);
    const missing = renderToStaticMarkup(<SubmitterEditAction
      status="SENT_BACK"
      editToken={null}
      editTokenExpiresAt={null}
    />);

    expect(expired).toContain("Edit link expired");
    expect(expired).not.toContain('href="/edit/');
    expect(missing).toContain("Edit link expired");
  });

  it("does not show an edit action for submissions that are no longer sent back", () => {
    const html = renderToStaticMarkup(<SubmitterEditAction
      status="SUBMITTED"
      editToken="active-edit-token"
      editTokenExpiresAt={new Date(Date.now() + 60_000)}
    />);

    expect(html).toBe("");
  });
});
