import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const select = vi.fn(() => ({ from }));
  return { from, select };
});
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));

import { resolveStaffEmailByName } from "./staff-email";
import { VERIFIER_NAMES, SANCTIONER_NAMES } from "./validation/payment-advice";

const STAFF_ROWS = [
  { fullName: "Sunil Salunke", email: "sunils@mcciapune.com" },
  { fullName: "ABHA KHATAVKAR", email: "abhak@mcciapune.com" },
  { fullName: "VAIDEHI MARATHE", email: "vaidehim@mcciapune.com" },
  { fullName: "CHANDRASHEKHAR SHAH", email: "shekhars@mcciapune.com" },
  { fullName: "CHINTAMANI SHROTRI", email: "chintamanis@mcciapune.com" },
  { fullName: "RAJNIKANT  GAIKWAD", email: "engineer@mcciapune.com" },
  { fullName: "No Email Person", email: null },
];

describe("resolveStaffEmailByName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockResolvedValue(STAFF_ROWS);
  });

  it("resolves case-insensitively", async () => {
    expect(await resolveStaffEmailByName("sunil salunke")).toBe("sunils@mcciapune.com");
  });

  it("resolves tolerant of collapsed whitespace", async () => {
    expect(await resolveStaffEmailByName("Rajnikant Gaikwad")).toBe("engineer@mcciapune.com");
  });

  it("returns null for a name with no matching staff row", async () => {
    expect(await resolveStaffEmailByName("Nobody Here")).toBeNull();
  });

  it("returns null when the matched staff row itself has no email on file", async () => {
    expect(await resolveStaffEmailByName("No Email Person")).toBeNull();
  });

  it('resolves 5 of the 6 hardcoded verifier/sanctioner names to a real email; "DG" resolves to null like any unmatched name', async () => {
    const names = [...VERIFIER_NAMES, ...SANCTIONER_NAMES];
    const results = await Promise.all(names.map((n) => resolveStaffEmailByName(n)));
    const byName = Object.fromEntries(names.map((n, i) => [n, results[i]]));
    expect(byName["Sunil Salunke"]).toBe("sunils@mcciapune.com");
    expect(byName["Abha Khatavkar"]).toBe("abhak@mcciapune.com");
    expect(byName["Vaidehi Marathe"]).toBe("vaidehim@mcciapune.com");
    expect(byName["Chandrashekhar Shah"]).toBe("shekhars@mcciapune.com");
    expect(byName["Chintamani Shrotri"]).toBe("chintamanis@mcciapune.com");
    expect(byName["DG"]).toBeNull();
  });
});
