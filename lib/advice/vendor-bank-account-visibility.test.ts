import { describe, expect, it } from "vitest";
import { isBankAccountVisibleToEmail } from "./vendor-bank-accounts";

describe("isBankAccountVisibleToEmail", () => {
  it("is visible to everyone when restrictedToEmails is null (the default)", () => {
    expect(isBankAccountVisibleToEmail(null, "")).toBe(true);
    expect(isBankAccountVisibleToEmail(null, "anyone@example.com")).toBe(true);
  });

  it("is visible to everyone when restrictedToEmails is an empty array", () => {
    expect(isBankAccountVisibleToEmail([], "anyone@example.com")).toBe(true);
  });

  it("is visible to a submitter whose email is in the allowed list", () => {
    expect(isBankAccountVisibleToEmail(["ganeshm@mcciapune.com"], "ganeshm@mcciapune.com")).toBe(true);
  });

  it("matches case-insensitively on both sides", () => {
    expect(isBankAccountVisibleToEmail(["GaneshM@MCCIAPune.com"], "ganeshm@mcciapune.com")).toBe(true);
    expect(isBankAccountVisibleToEmail(["ganeshm@mcciapune.com"], "GANESHM@MCCIAPUNE.COM")).toBe(true);
  });

  it("tolerates surrounding whitespace on the submitted email", () => {
    expect(isBankAccountVisibleToEmail(["ganeshm@mcciapune.com"], "  ganeshm@mcciapune.com  ")).toBe(true);
  });

  it("is hidden from a submitter not in the allowed list — no partial match, no hint", () => {
    expect(isBankAccountVisibleToEmail(["ganeshm@mcciapune.com"], "someoneelse@mcciapune.com")).toBe(false);
    expect(isBankAccountVisibleToEmail(["ganeshm@mcciapune.com"], "")).toBe(false);
  });

  it("is hidden from an empty/blank submitted email when a restriction exists", () => {
    expect(isBankAccountVisibleToEmail(["ganeshm@mcciapune.com"], "   ")).toBe(false);
  });

  it("supports more than one allowed email on the same account", () => {
    const allowed = ["ganeshm@mcciapune.com", "someoneelse@mcciapune.com"];
    expect(isBankAccountVisibleToEmail(allowed, "someoneelse@mcciapune.com")).toBe(true);
    expect(isBankAccountVisibleToEmail(allowed, "athirdone@mcciapune.com")).toBe(false);
  });
});
