import { describe, expect, it } from "vitest";
import { emailsMatch, identityCookieName } from "./authority-identity";

describe("emailsMatch", () => {
  it("matches identical emails", () => {
    expect(emailsMatch("a@b.com", "a@b.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(emailsMatch("Sunil@McciaPune.com", "sunil@mcciapune.com")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(emailsMatch("  sunil@mcciapune.com ", "sunil@mcciapune.com")).toBe(true);
  });

  it("rejects a different email", () => {
    expect(emailsMatch("guess@evil.com", "real@mcciapune.com")).toBe(false);
  });
});

describe("identityCookieName", () => {
  it("embeds the token so each token gets an independent cookie", () => {
    expect(identityCookieName("abc123")).toBe("mccia_authority_identity_abc123");
  });
});
