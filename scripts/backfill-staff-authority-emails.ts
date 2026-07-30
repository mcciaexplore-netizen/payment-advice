/**
 * One-off backfill: sets staff_members.email and recommending_authorities.email
 * from MCCIA's authoritative name/email list (lib/staff-authority-emails.ts
 * — literal data supplied directly, not parsed from a spreadsheet, unlike
 * scripts/import-master-data.ts).
 *
 * Usage: npm run backfill:staff-emails
 *
 * Matches by name, case-insensitively and tolerant of extra/collapsed
 * whitespace (e.g. "RAJNIKANT  GAIKWAD" with a double space matches
 * "Rajnikant Gaikwad"). Never creates new staff/authority rows and never
 * auto-resolves an unmatched name — any list entry that doesn't match an
 * existing row is reported, not skipped silently. Safe to re-run: existing
 * emails are overwritten with the authoritative value again, not duplicated.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { staffMembers, recommendingAuthorities } from "../lib/db/schema";
import { matchNamesToEmails } from "../lib/staff-authority-emails";

async function main() {
  // --- staff_members ---
  const staffRows = await db.select().from(staffMembers);
  const { matchedByName: staffMatches, unmatchedListEntries: unmatchedAgainstStaff } =
    matchNamesToEmails(staffRows.map((s) => s.fullName));
  for (const staff of staffRows) {
    const email = staffMatches.get(staff.fullName);
    if (!email) continue;
    await db.update(staffMembers).set({ email, updatedAt: new Date() }).where(eq(staffMembers.id, staff.id));
  }

  // --- recommending_authorities ---
  const authorityRows = await db.select().from(recommendingAuthorities);
  const { matchedByName: authorityMatches, unmatchedListEntries: unmatchedAgainstAuthorities } =
    matchNamesToEmails(authorityRows.map((a) => a.authorityName));
  for (const authority of authorityRows) {
    const email = authorityMatches.get(authority.authorityName);
    if (!email) continue;
    await db.update(recommendingAuthorities).set({ email }).where(eq(recommendingAuthorities.id, authority.id));
  }
  const authoritiesWithNoMatch = authorityRows.filter((a) => !authorityMatches.has(a.authorityName));

  console.log("=== staff_members ===");
  console.log(`Matched and updated: ${staffMatches.size}`);
  staffMatches.forEach((email, name) => console.log(`  ${name} -> ${email}`));
  console.log(
    `\nList entries with NO matching staff row (${unmatchedAgainstStaff.length}) — not skipped, just not staff (e.g. non-submitting MCCIA staff):`,
  );
  unmatchedAgainstStaff.forEach(({ name, email }) => console.log(`  ${name} (${email})`));

  console.log("\n=== recommending_authorities ===");
  console.log(`Matched and updated: ${authorityMatches.size}`);
  authorityMatches.forEach((email, name) => console.log(`  ${name} -> ${email}`));
  console.log(
    `\nAuthorities with NO email match (${authoritiesWithNoMatch.length}) — will fall back to preview mode for notifyAuthorityApproval:`,
  );
  authoritiesWithNoMatch.forEach((a) => console.log(`  ${a.authorityName}`));
  if (unmatchedAgainstAuthorities.length > 0) {
    console.log(
      `\n(${unmatchedAgainstAuthorities.length} list entries also don't match any recommending_authorities row — expected, most list entries are staff, not authorities.)`,
    );
  }

  const refreshedStaff = await db.select().from(staffMembers);
  const staffWithEmail = refreshedStaff.filter((s) => s.email !== null).length;
  console.log(`\nTotal staff_members rows with email populated: ${staffWithEmail} / ${refreshedStaff.length}`);

  const refreshedAuthorities = await db.select().from(recommendingAuthorities);
  const authWithEmailCount = refreshedAuthorities.filter((a) => a.email !== null).length;
  console.log(
    `Total recommending_authorities rows with email populated: ${authWithEmailCount} / ${refreshedAuthorities.length}`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
