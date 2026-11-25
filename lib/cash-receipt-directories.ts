/** The directories sold at the counter, with their prices, for the Cash Receipt
 * form's "Sale of Directory" rows. One list drives the dropdown, the price that
 * fills in, whether a Member ID is asked for, and the text saved on the
 * receipt, so they cannot drift apart. */
export const DIRECTORIES = [
  { label: "Defence Directory - Member", price: "900", memberId: true },
  { label: "Defence Directory - Non-member", price: "1500", memberId: false },
  { label: "Electronics Directory - Member", price: "600", memberId: true },
  { label: "Electronics Directory - Non-member", price: "1200", memberId: false },
  { label: "Agriculture Directory", price: "500", memberId: false },
] as const;

export const DIRECTORY_OPTIONS: readonly string[] = DIRECTORIES.map((directory) => directory.label);

/** The price (Rs.) for a directory, or "" when none is chosen. */
export function directoryPrice(label: string): string {
  return DIRECTORIES.find((directory) => directory.label === label)?.price ?? "";
}

/** Member directories ask for the member's ID. */
export function directoryNeedsMemberId(label: string): boolean {
  return DIRECTORIES.find((directory) => directory.label === label)?.memberId ?? false;
}

/** The text saved on the receipt, e.g.
 * "Sale of Directory - Electronics Directory - Member (Member ID: 123)". */
export function directoryParticulars(label: string, memberId: string): string {
  return `Sale of Directory - ${label}${directoryNeedsMemberId(label) ? ` (Member ID: ${memberId.trim()})` : ""}`;
}

// ---------------------------------------------------------------------------
// Several directories on one "Sale of Directory" row. The cashier ticks every
// directory sold; each ticked one becomes its own line on the receipt, with its
// own copies, price and (for a member directory) Member ID.
// ---------------------------------------------------------------------------

export type DirectoryEntry = { copies: string; memberNo: string };
/** The ticked directories of one row, by directory label. Absent = not ticked. */
export type DirectorySelection = Record<string, DirectoryEntry>;

/** The ticked directories, always in the catalogue's order. */
export function selectedDirectories(selection: DirectorySelection) {
  return DIRECTORIES.filter((directory) => directory.label in selection);
}

/** Ticks or unticks one directory (untick forgets its copies and Member ID). */
export function toggleDirectory(selection: DirectorySelection, label: string, ticked: boolean): DirectorySelection {
  if (!DIRECTORIES.some((directory) => directory.label === label)) return selection;
  if (ticked) return label in selection ? selection : { ...selection, [label]: { copies: "", memberNo: "" } };
  const { [label]: _removed, ...rest } = selection;
  void _removed;
  return rest;
}

/** Sets one field of a ticked directory (ignored when it is not ticked). */
export function updateDirectoryEntry(selection: DirectorySelection, label: string, field: keyof DirectoryEntry, value: string): DirectorySelection {
  if (!(label in selection)) return selection;
  return { ...selection, [label]: { ...selection[label], [field]: value } };
}

/** What the row adds to the receipt total: copies x price for each ticked directory. */
export function directoryAmount(selection: DirectorySelection): number {
  return selectedDirectories(selection).reduce((sum, directory) => sum + (Number(selection[directory.label].copies) || 0) * Number(directory.price), 0);
}

/** Why the row cannot be saved yet, or null when it can. */
export function directoryProblem(selection: DirectorySelection): string | null {
  const ticked = selectedDirectories(selection);
  if (ticked.length === 0) return "Tick at least one directory for the Sale of Directory row.";
  for (const directory of ticked) {
    const entry = selection[directory.label];
    if (!(Number(entry.copies) >= 1) || !Number.isInteger(Number(entry.copies))) return `Enter the number of copies for ${directory.label}.`;
    if (directory.memberId && !entry.memberNo.trim()) return `Enter the Member ID for ${directory.label}.`;
  }
  return null;
}

/** The receipt lines for the row: one per ticked directory, in catalogue order. */
export function directoryItems(selection: DirectorySelection): Array<{ particulars: string; copies: number; price: number }> {
  return selectedDirectories(selection).map((directory) => ({
    particulars: directoryParticulars(directory.label, selection[directory.label].memberNo),
    copies: Number(selection[directory.label].copies),
    price: Number(directory.price),
  }));
}
