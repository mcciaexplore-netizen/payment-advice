/**
 * MCCIA's authoritative staff/authority name -> email list, and the name
 * normalization shared by scripts/backfill-staff-authority-emails.ts (the
 * one-off DB backfill) and lib/staff-email.ts (the runtime resolver) — one
 * canonical implementation so the two can't drift apart.
 *
 * Omkar Golhar and Santosh Sawant intentionally share
 * mcciaramp@mcciapune.com (a real shared department mailbox) — this is not
 * a dedup/error case anywhere this list is used.
 */
export const NAME_EMAIL_LIST: { name: string; email: string }[] = [
  { name: "GANESH MATE", email: "ganeshm@mcciapune.com" },
  { name: "SUNIL SALUNKE", email: "sunils@mcciapune.com" },
  { name: "RAJNIKANT GAIKWAD", email: "engineer@mcciapune.com" },
  { name: "DNYANESHWAR BANDRE", email: "dnyaneshwarb@mcciapune.com" },
  { name: "ABHA KHATAVKAR", email: "abhak@mcciapune.com" },
  { name: "SHWETA WASKE", email: "shwetaw@mcciapune.com" },
  { name: "KIRTI KENDHE", email: "kirtik@mcciapune.com" },
  { name: "NIKHIL JAIN", email: "nikhilj@mcciapune.com" },
  { name: "ANIRUDDHA BRAHMA", email: "aniruddhab@mcciapune.com" },
  { name: "PARIKSHIT DAS", email: "parikshitd@mcciapune.com" },
  { name: "SONAL PHADNIS", email: "sonalp@mcciapune.com" },
  { name: "SHANTANU JAGTAP", email: "shantanuj@mcciapune.com" },
  { name: "Pratik Pardeshi", email: "paatikp@mcciapune.com" },
  { name: "CHINTAMANI SHROTRI", email: "chintamanis@mcciapune.com" },
  { name: "SATISH JOSHI", email: "satishj@mcciapune.com" },
  { name: "MANDAR MARATHE", email: "mandarm@mcciapune.com" },
  { name: "VARSHA MAHAJAN", email: "varsham@mcciapune.com" },
  { name: "SARIKA DAMLE", email: "sarikad@mcciapune.com" },
  { name: "SATAVISHA NATU", email: "satavishan@mcciapune.com" },
  { name: "PRASHANT JOGALEKAR", email: "prashantj@mcciapune.com" },
  { name: "SUDHANWA KOPARDEKAR", email: "sudhanwak@mcciapune.com" },
  { name: "SANDHYA ACHARYA", email: "sandhyaa@mcciapune.com" },
  { name: "P V SASIDHARAN", email: "sasidharan@mcciapune.com" },
  { name: "CHANDRASHEKHAR SHAH", email: "shekhars@mcciapune.com" },
  { name: "MAHESH KABADI", email: "maheshk@mcciapune.com" },
  { name: "VAIDEHI MARATHE", email: "vaidehim@mcciapune.com" },
  { name: "MANGESH KULKARNI", email: "mangeshk@mcciapune.com" },
  { name: "Saahil Amritkar", email: "saahila@mcciapune.com" },
  { name: "Omkar Golhar", email: "mcciaramp@mcciapune.com" },
  { name: "Advika Mangrulkar", email: "puneexpo@mcciapune.com" },
  { name: "Neeraj Thakur", email: "neerajt@mcciapune.com" },
  { name: "Santosh Sawant", email: "mcciaramp@mcciapune.com" },
  { name: "Akash Bhoi", email: "ithelpdesk1@mcciapune.com" },
  { name: "Aishwary Songirkar", email: "aishwary.fellow@mcciapune.com" },
  { name: "Abhishek Awate", email: "abhisheka@mcciapune.com" },
  { name: "Tejaskumar Narute", email: "aefc@mcciapune.com" },
  { name: "Aarya Tayade", email: "aaryat@mcciapune.com" },
  { name: "Ravindra Pansare", email: "mccianagar@gmail.com" },
  { name: "Shriram Joshi", email: "shriramj@mcciapune.com" },
];

/** Case-insensitive, tolerant of leading/trailing/collapsed-internal
 * whitespace — e.g. "RAJNIKANT  GAIKWAD" (double space, a real data quirk
 * in staff_members/recommending_authorities) normalizes the same as
 * "Rajnikant Gaikwad". */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildNameEmailLookup(): Map<string, string> {
  const map = new Map<string, string>();
  for (const { name, email } of NAME_EMAIL_LIST) {
    map.set(normalizeName(name), email);
  }
  return map;
}

/** Pure matching logic used by the backfill script — separated out so it's
 * testable without a database. Given the existing rows' names (staff or
 * authorities) and the authoritative list, returns which rows should be
 * updated (name -> email) and which list entries had no matching row. */
export function matchNamesToEmails(
  existingNames: string[],
): { matchedByName: Map<string, string>; unmatchedListEntries: { name: string; email: string }[] } {
  const lookup = buildNameEmailLookup();
  const matchedByName = new Map<string, string>();
  for (const existingName of existingNames) {
    const email = lookup.get(normalizeName(existingName));
    if (email) matchedByName.set(existingName, email);
  }
  const existingNormalized = new Set(existingNames.map(normalizeName));
  const unmatchedListEntries = NAME_EMAIL_LIST.filter(
    ({ name }) => !existingNormalized.has(normalizeName(name)),
  );
  return { matchedByName, unmatchedListEntries };
}
