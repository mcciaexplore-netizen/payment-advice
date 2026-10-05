import { describe, expect, it } from "vitest";
import { levenshtein, normalizedVendorName, scoreVendorsByName } from "./vendor-name-matching";

describe("normalizedVendorName", () => {
  it("strips legal-entity suffixes, internal ledger tags, and punctuation", () => {
    expect(normalizedVendorName("Example Pvt. Ltd.")).toBe("example");
    expect(normalizedVendorName("SAHYADRI MOTORS PRIVATE LIMITED-CR")).toBe("sahyadri motors");
  });
});

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
  });
});

describe("scoreVendorsByName", () => {
  const vendors = [
    { id: "1", companyName: "Businary Consultancy Services LLP-CR" },
    { id: "2", companyName: "Atronix India" },
    { id: "3", companyName: "A V Dabake & Co" },
  ];

  it("scores an exact (post-normalization) match as 1, sorted first", () => {
    const scored = scoreVendorsByName("Businary Consultancy Services LLP", vendors);
    expect(scored[0].vendor.id).toBe("1");
    expect(scored[0].score).toBe(1);
  });

  it("returns every candidate, sorted best-first, for the caller to apply its own threshold", () => {
    const scored = scoreVendorsByName("Atronix Indiaa", vendors);
    expect(scored).toHaveLength(3);
    expect(scored[0].vendor.id).toBe("2");
    expect(scored[0].score).toBeGreaterThan(0.9);
    expect(scored[0].score).toBeLessThan(1);
  });

  it("gives every candidate a 0 score for an empty/unnormalizable query, without throwing", () => {
    const scored = scoreVendorsByName("---", vendors);
    expect(scored.every((s) => s.score === 0)).toBe(true);
  });
});
