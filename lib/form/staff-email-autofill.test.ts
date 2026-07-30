import { describe, expect, it } from "vitest";
import { resolveAutoFillEmail } from "./staff-email-autofill";

describe("resolveAutoFillEmail", () => {
  it("fills the email when a match has one on file and the field is empty", () => {
    expect(resolveAutoFillEmail({ email: "ganeshm@mcciapune.com" }, "")).toBe("ganeshm@mcciapune.com");
    expect(resolveAutoFillEmail({ email: "ganeshm@mcciapune.com" }, undefined)).toBe("ganeshm@mcciapune.com");
  });

  it("stays empty (returns null) when the matched staff member has no email on file", () => {
    expect(resolveAutoFillEmail({ email: null }, "")).toBeNull();
  });

  it("stays empty (returns null) when there is no match at all", () => {
    expect(resolveAutoFillEmail(null, "")).toBeNull();
  });

  it("never overwrites an email the submitter already typed", () => {
    expect(resolveAutoFillEmail({ email: "ganeshm@mcciapune.com" }, "someone@else.com")).toBeNull();
  });

  it("never overwrites an already-set value even when re-triggered by the same match", () => {
    // e.g. /edit/[token] resubmit: the field is pre-filled from the
    // original submission before the typeahead's onMatch fires on mount.
    expect(resolveAutoFillEmail({ email: "ganeshm@mcciapune.com" }, "priya@example.com")).toBeNull();
  });
});
