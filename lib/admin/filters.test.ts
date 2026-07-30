import { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildTabCondition, isAdminTab } from "./filters";

describe("isAdminTab", () => {
  it("accepts the three known tab values", () => {
    expect(isAdminTab("waiting_authority")).toBe(true);
    expect(isAdminTab("ready_finance")).toBe(true);
    expect(isAdminTab("all")).toBe(true);
  });

  it("rejects anything else, including undefined/empty", () => {
    expect(isAdminTab(undefined)).toBe(false);
    expect(isAdminTab(null)).toBe(false);
    expect(isAdminTab("")).toBe(false);
    expect(isAdminTab("approved")).toBe(false);
  });
});

describe("buildTabCondition", () => {
  it("imposes no extra condition for 'all', matching the pre-existing unfiltered list", () => {
    expect(buildTabCondition("all")).toBeUndefined();
  });

  it("produces a real SQL condition for 'waiting_authority'", () => {
    expect(buildTabCondition("waiting_authority")).toBeInstanceOf(SQL);
  });

  it("produces a real SQL condition for 'ready_finance'", () => {
    expect(buildTabCondition("ready_finance")).toBeInstanceOf(SQL);
  });

  it("gives waiting_authority and ready_finance mutually exclusive SQL (not the same condition object)", () => {
    const waiting = buildTabCondition("waiting_authority");
    const ready = buildTabCondition("ready_finance");
    expect(waiting).not.toBe(ready);
  });
});
