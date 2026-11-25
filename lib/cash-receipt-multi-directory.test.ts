import { describe, expect, it } from "vitest";
import {
  DIRECTORIES,
  directoryAmount,
  directoryItems,
  directoryProblem,
  selectedDirectories,
  toggleDirectory,
  updateDirectoryEntry,
  type DirectorySelection,
} from "@/lib/cash-receipt-directories";
import { cashReceiptSchema } from "@/lib/validation/cash-receipt";
import { categoryForParticulars } from "@/lib/cash-receipt-report";

const tick = (selection: DirectorySelection, label: string, copies: string, memberNo = "") =>
  updateDirectoryEntry(updateDirectoryEntry(toggleDirectory(selection, label, true), label, "copies", copies), label, "memberNo", memberNo);

describe("several directories on one Sale of Directory row", () => {
  it("ticks and unticks any number of directories, forgetting the copies and Member ID of one that is unticked", () => {
    let selection: DirectorySelection = {};
    selection = tick(selection, "Electronics Directory - Member", "2", "M-45");
    selection = tick(selection, "Defence Directory - Non-member", "1");
    expect(Object.keys(selection)).toEqual(["Electronics Directory - Member", "Defence Directory - Non-member"]);
    selection = toggleDirectory(selection, "Electronics Directory - Member", false);
    expect(Object.keys(selection)).toEqual(["Defence Directory - Non-member"]);
    selection = toggleDirectory(selection, "Electronics Directory - Member", true);
    expect(selection["Electronics Directory - Member"]).toEqual({ copies: "", memberNo: "" });
  });

  it("never lets an unknown directory in, and ignores edits to one that is not ticked", () => {
    expect(toggleDirectory({}, "Made Up Directory", true)).toEqual({});
    expect(updateDirectoryEntry({}, "Agriculture Directory", "copies", "3")).toEqual({});
  });

  it("does not change the selection it was given", () => {
    const original: DirectorySelection = { "Agriculture Directory": { copies: "1", memberNo: "" } };
    toggleDirectory(original, "Defence Directory - Member", true);
    updateDirectoryEntry(original, "Agriculture Directory", "copies", "9");
    expect(original).toEqual({ "Agriculture Directory": { copies: "1", memberNo: "" } });
  });

  it("keeps the catalogue's order whichever order they were ticked in", () => {
    let selection: DirectorySelection = {};
    for (const label of ["Agriculture Directory", "Electronics Directory - Non-member", "Defence Directory - Member"]) selection = tick(selection, label, "1", "x");
    expect(selectedDirectories(selection).map((directory) => directory.label)).toEqual(["Defence Directory - Member", "Electronics Directory - Non-member", "Agriculture Directory"]);
    expect(directoryItems(selection).map((item) => item.particulars)).toEqual([
      "Sale of Directory - Defence Directory - Member (Member ID: x)",
      "Sale of Directory - Electronics Directory - Non-member",
      "Sale of Directory - Agriculture Directory",
    ]);
  });

  it("adds up copies x price for every ticked directory", () => {
    let selection: DirectorySelection = {};
    selection = tick(selection, "Electronics Directory - Member", "2", "M-45"); // 2 x 600
    selection = tick(selection, "Electronics Directory - Non-member", "1"); // 1 x 1200
    selection = tick(selection, "Defence Directory - Member", "3", "D-1"); // 3 x 900
    expect(directoryAmount(selection)).toBe(1200 + 1200 + 2700);
    expect(directoryAmount({})).toBe(0);
    // A directory with no copies yet adds nothing.
    expect(directoryAmount(toggleDirectory(selection, "Agriculture Directory", true))).toBe(5100);
  });

  it("says what is missing before the row can be saved, naming the directory at fault", () => {
    expect(directoryProblem({})).toBe("Tick at least one directory for the Sale of Directory row.");
    expect(directoryProblem(toggleDirectory({}, "Agriculture Directory", true))).toBe("Enter the number of copies for Agriculture Directory.");
    expect(directoryProblem(tick({}, "Agriculture Directory", "0"))).toBe("Enter the number of copies for Agriculture Directory.");
    expect(directoryProblem(tick({}, "Agriculture Directory", "1.5"))).toBe("Enter the number of copies for Agriculture Directory.");
    expect(directoryProblem(tick({}, "Electronics Directory - Member", "1"))).toBe("Enter the Member ID for Electronics Directory - Member.");
    expect(directoryProblem(tick({}, "Electronics Directory - Member", "1", "   "))).toBe("Enter the Member ID for Electronics Directory - Member.");
    expect(directoryProblem(tick({}, "Electronics Directory - Member", "1", "M-45"))).toBeNull();
    expect(directoryProblem(tick({}, "Electronics Directory - Non-member", "4"))).toBeNull();
    // One incomplete directory holds up the whole row.
    expect(directoryProblem(tick(tick({}, "Defence Directory - Member", "1", "D-1"), "Agriculture Directory", ""))).toBe("Enter the number of copies for Agriculture Directory.");
  });

  it("a receipt with several directories is accepted by the server, one line each, totalling what the screen shows", () => {
    let selection: DirectorySelection = {};
    selection = tick(selection, "Electronics Directory - Member", "2", "M-45");
    selection = tick(selection, "Electronics Directory - Non-member", "1");
    selection = tick(selection, "Agriculture Directory", "5");
    const items = directoryItems(selection);
    expect(items).toEqual([
      { particulars: "Sale of Directory - Electronics Directory - Member (Member ID: M-45)", copies: 2, price: 600 },
      { particulars: "Sale of Directory - Electronics Directory - Non-member", copies: 1, price: 1200 },
      { particulars: "Sale of Directory - Agriculture Directory", copies: 5, price: 500 },
    ]);
    expect(cashReceiptSchema.safeParse({ partyName: "Forbes Marshall", items }).success).toBe(true);
    expect(items.reduce((sum, item) => sum + item.copies * item.price, 0)).toBe(directoryAmount(selection));
    for (const item of items) expect(categoryForParticulars(item.particulars)).toBe("Directories");
  });

  it("every directory at once is still well inside the server's 20-line limit", () => {
    let all: DirectorySelection = {};
    for (const directory of DIRECTORIES) all = tick(all, directory.label, "1", "id");
    expect(directoryProblem(all)).toBeNull();
    expect(directoryItems(all)).toHaveLength(DIRECTORIES.length);
    expect(DIRECTORIES.length).toBeLessThan(20);
  });
});
