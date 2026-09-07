/**
 * Idempotent one-off seed for the confirmed Branch/Department dashboard
 * rollout (September 2026). Initial passwords follow the deliberately
 * human-approved `{familiar first name}@1934` distribution convention.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { adminUserRoles, adminUsers, staffMembers } from "../lib/db/schema";
import { hashPassword } from "../lib/admin-users";

type TeamGrant = { role: "BRANCH" | "DEPARTMENT"; scopeValue: string };
type TeamAccount = { fullName: string; email: string; loginStem: string; grants: TeamGrant[]; staffName?: string };

const ACCOUNTS: TeamAccount[] = [
  { fullName: "SARIKA DAMLE", email: "sarikad@mcciapune.com", loginStem: "sarika", grants: [{ role: "BRANCH", scopeValue: "Tilak Road Office" }] },
  { fullName: "P V SASIDHARAN", email: "sasidharan@mcciapune.com", loginStem: "sasidharan", grants: [{ role: "BRANCH", scopeValue: "Tilak Road Office" }] },
  { fullName: "Tejaskumar Narute", email: "aefc@mcciapune.com", loginStem: "tejas", grants: [{ role: "BRANCH", scopeValue: "Hadapsar Office" }, { role: "DEPARTMENT", scopeValue: "AGRICULTURE" }] },
  { fullName: "MANDAR MARATHE", email: "mandarm@mcciapune.com", loginStem: "mandar", grants: [{ role: "BRANCH", scopeValue: "Bhosari Office" }] },
  { fullName: "Pratik Pardeshi", email: "paatikp@mcciapune.com", loginStem: "pratik", grants: [{ role: "BRANCH", scopeValue: "Bhosari Office" }] },
  { fullName: "Ravindra Pansare", email: "mccianagar@mcciapune.com", loginStem: "ravindra", grants: [{ role: "BRANCH", scopeValue: "Ahilyanagar Office" }] },
  { fullName: "Aishwary Songirkar", email: "aishwary.fellow@mcciapune.com", loginStem: "aishwarya", grants: [{ role: "DEPARTMENT", scopeValue: "MSME HELPLINE" }] },
  { fullName: "Mayur Borkar", email: "mayurb@mcciapune.com", loginStem: "mayur", grants: [{ role: "DEPARTMENT", scopeValue: "RAMP" }] },
  { fullName: "RAMP Team", email: "mcciaramp@mcciapune.com", loginStem: "ramp", grants: [{ role: "DEPARTMENT", scopeValue: "RAMP" }] },
  { fullName: "SANDHYA ACHARYA", email: "sandhyaa@mcciapune.com", loginStem: "sandhya", grants: [{ role: "DEPARTMENT", scopeValue: "CBP" }] },
  { fullName: "VARSHA MAHAJAN", email: "varsham@mcciapune.com", loginStem: "varsha", grants: [{ role: "DEPARTMENT", scopeValue: "CBP" }] },
  { fullName: "CHANDRASHEKHAR SHAH", email: "shekhars@mcciapune.com", loginStem: "shekhar", grants: [{ role: "DEPARTMENT", scopeValue: "CBP" }] },
  { fullName: "Shriram Joshi", email: "shriramj@mcciapune.com", loginStem: "shriram", grants: [{ role: "DEPARTMENT", scopeValue: "CBP" }] },
  { fullName: "SONAL PHADNIS", email: "sonalp@mcciapune.com", loginStem: "sonal", grants: [{ role: "DEPARTMENT", scopeValue: "MEMBERSHIP" }] },
  { fullName: "KIRTI KENDHE", email: "kirtik@mcciapune.com", loginStem: "kirti", grants: [{ role: "DEPARTMENT", scopeValue: "MEMBERSHIP" }] },
  { fullName: "Saahil Amritkar", email: "saahila@mcciapune.com", loginStem: "saahil", grants: [{ role: "DEPARTMENT", scopeValue: "MEMBERSHIP" }] },
  { fullName: "Rachita Waghamare", email: "rachitaw@mcciapune.com", loginStem: "rachita", grants: [{ role: "DEPARTMENT", scopeValue: "MEMBERSHIP" }] },
  { fullName: "PARIKSHIT DAS", email: "parikshitd@mcciapune.com", loginStem: "parikshit", grants: [{ role: "DEPARTMENT", scopeValue: "MEMBERSHIP" }] },
];

async function main() {
  const emails = ACCOUNTS.map((account) => account.email);
  if (new Set(emails).size !== emails.length) throw new Error("Duplicate account email in seed list.");

  const existingUsers = await db.select().from(adminUsers).where(inArray(adminUsers.email, emails));
  let createdCount = 0;

  await db.transaction(async (tx) => {
    for (const account of ACCOUNTS) {
      let user = existingUsers.find((candidate) => candidate.email === account.email);
      if (!user) {
        const password = `${account.loginStem}@1934`;
        const [created] = await tx.insert(adminUsers).values({
          fullName: account.fullName,
          email: account.email,
          passwordHash: await hashPassword(password),
          // Deprecated compatibility column; the grants below are authoritative.
          role: account.grants[0].role,
          recommendingAuthorityId: null,
        }).returning();
        user = created;
        createdCount += 1;
      } else if (user.fullName !== account.fullName || !user.isActive) {
        throw new Error(`Conflicting admin_users row for ${account.email}; refusing to overwrite.`);
      }

      for (const grant of account.grants) {
        const [existingGrant] = await tx.select().from(adminUserRoles).where(and(
          eq(adminUserRoles.adminUserId, user.id), eq(adminUserRoles.role, grant.role),
        )).limit(1);
        if (existingGrant) {
          if (existingGrant.scopeValue !== grant.scopeValue || existingGrant.recommendingAuthorityId !== null) {
            throw new Error(`Conflicting ${grant.role} grant for ${account.email}; refusing to overwrite.`);
          }
        } else {
          await tx.insert(adminUserRoles).values({ adminUserId: user.id, role: grant.role, scopeValue: grant.scopeValue });
        }
      }

      if (account.fullName !== "RAMP Team") {
        const [staff] = await tx.select().from(staffMembers).where(eq(staffMembers.fullName, account.fullName)).limit(1);
        if (!staff) throw new Error(`Missing confirmed staff member ${account.fullName}; refusing to guess.`);
        if (staff.email !== account.email) {
          await tx.update(staffMembers).set({ email: account.email, updatedAt: new Date() }).where(eq(staffMembers.id, staff.id));
        }
      }
    }
  });

  if (createdCount === 0) {
    console.log("No accounts created; all confirmed Team Dashboard accounts and grants already exist.");
    return;
  }
  console.log(`Created ${createdCount} accounts with the approved initial-password convention.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
