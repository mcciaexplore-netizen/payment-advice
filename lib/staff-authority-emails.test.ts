import { describe, expect, it } from "vitest";
import { NAME_EMAIL_LIST, matchNamesToEmails, normalizeName } from "./staff-authority-emails";

describe("normalizeName", () => {
  it("is case-insensitive", () => {
    expect(normalizeName("SUNIL SALUNKE")).toBe(normalizeName("sunil salunke"));
  });

  it("collapses extra internal whitespace", () => {
    expect(normalizeName("RAJNIKANT  GAIKWAD")).toBe(normalizeName("Rajnikant Gaikwad"));
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeName("  Ganesh Mate  ")).toBe(normalizeName("Ganesh Mate"));
  });
});

describe("matchNamesToEmails", () => {
  it("matches an existing row name to the list case-insensitively and whitespace-tolerantly", () => {
    const { matchedByName } = matchNamesToEmails(["ganesh mate", "RAJNIKANT  GAIKWAD"]);
    expect(matchedByName.get("ganesh mate")).toBe("ganeshm@mcciapune.com");
    expect(matchedByName.get("RAJNIKANT  GAIKWAD")).toBe("engineer@mcciapune.com");
  });

  it("does not match an unrelated name", () => {
    const { matchedByName } = matchNamesToEmails(["Someone Else Entirely"]);
    expect(matchedByName.size).toBe(0);
  });

  it("reports list entries with no matching existing row, without throwing or skipping silently", () => {
    const { unmatchedListEntries } = matchNamesToEmails([]);
    expect(unmatchedListEntries.length).toBe(NAME_EMAIL_LIST.length);
    expect(unmatchedListEntries.map((e) => e.name)).toContain("Shriram Joshi");
  });

  it("handles the shared-mailbox case (two distinct names, same email) without deduping or erroring", () => {
    const { matchedByName } = matchNamesToEmails(["Omkar Golhar", "Santosh Sawant"]);
    expect(matchedByName.get("Omkar Golhar")).toBe("mcciaramp@mcciapune.com");
    expect(matchedByName.get("Santosh Sawant")).toBe("mcciaramp@mcciapune.com");
    expect(matchedByName.size).toBe(2);
  });

  it("both shared-mailbox list entries are present and distinct in the source list itself", () => {
    const shared = NAME_EMAIL_LIST.filter((e) => e.email === "mcciaramp@mcciapune.com");
    expect(shared.map((e) => e.name).sort()).toEqual(["Omkar Golhar", "Santosh Sawant"]);
  });
});
