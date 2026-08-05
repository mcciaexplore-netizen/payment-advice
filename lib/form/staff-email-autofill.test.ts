import { describe, expect, it } from "vitest";
import { resolveAutoFillEmail } from "./staff-email-autofill";

describe("resolveAutoFillEmail", () => {
  it("fills the email when a match has one on file and the field is empty", () => {
    expect(resolveAutoFillEmail({ email: "ganeshm@mcciapune.com" }, "", null)).toEqual({
      type: "fill",
      email: "ganeshm@mcciapune.com",
    });
  });

  it("does nothing when the matched staff member has no email on file and the field is already empty", () => {
    expect(resolveAutoFillEmail({ email: null }, "", null)).toEqual({ type: "none" });
  });

  it("does nothing when there is no match at all and the field is already empty", () => {
    expect(resolveAutoFillEmail(null, "", null)).toEqual({ type: "none" });
  });

  it("never overwrites an email the submitter manually typed (not equal to our last auto-fill)", () => {
    expect(resolveAutoFillEmail({ email: "ganeshm@mcciapune.com" }, "someone@else.com", null)).toEqual({
      type: "none",
    });
  });

  it("never overwrites an /edit/[token] resubmit prefill — a non-empty value we never auto-filled ourselves", () => {
    expect(resolveAutoFillEmail({ email: "ganeshm@mcciapune.com" }, "priya@example.com", null)).toEqual({
      type: "none",
    });
  });

  it("updates a stale auto-fill to the newly matched person's email when the match changes", () => {
    // The field holds exactly what we auto-filled for the *previous*
    // match — safe to replace with the new match's email.
    expect(
      resolveAutoFillEmail({ email: "newperson@mcciapune.com" }, "ganeshm@mcciapune.com", "ganeshm@mcciapune.com"),
    ).toEqual({ type: "fill", email: "newperson@mcciapune.com" });
  });

  it("clears a stale auto-fill when the match changes to someone with no email on file", () => {
    expect(resolveAutoFillEmail({ email: null }, "ganeshm@mcciapune.com", "ganeshm@mcciapune.com")).toEqual({
      type: "clear",
    });
  });

  it("clears a stale auto-fill when the name no longer matches anyone at all", () => {
    expect(resolveAutoFillEmail(null, "ganeshm@mcciapune.com", "ganeshm@mcciapune.com")).toEqual({
      type: "clear",
    });
  });

  it("does NOT clear/replace a manual edit made after an auto-fill, even when the match changes", () => {
    // Field no longer equals what was last auto-filled ("ganeshm@...") —
    // the submitter edited it themselves in between.
    expect(
      resolveAutoFillEmail({ email: "newperson@mcciapune.com" }, "custom@example.com", "ganeshm@mcciapune.com"),
    ).toEqual({ type: "none" });
  });

  it("does nothing (no-op) when the match changes but the field is already empty and the new match also has no email", () => {
    expect(resolveAutoFillEmail({ email: null }, "", "ganeshm@mcciapune.com")).toEqual({ type: "none" });
  });
});
