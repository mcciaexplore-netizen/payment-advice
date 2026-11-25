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
