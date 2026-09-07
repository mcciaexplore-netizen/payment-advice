/**
 * Idempotent one-off seed for the confirmed Branch/Department dashboard
 * rollout (September 2026). Passwords are randomly generated and written
 * once to the gitignored scripts/team-dashboard-users-report.md file.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { adminUserRoles, adminUsers, staffMembers } from "../lib/db/schema";
import { hashPassword } from "../lib/admin-users";

type TeamGrant = { role: "BRANCH" | "DEPARTMENT"; scopeValue: string };
type TeamAccount = { fullName: string; email: string; grants: TeamGrant[]; staffName?: string };

const ACCOUNTS: TeamAccount[] = [
  { fullName: "SARIKA DAMLE", email: "sarikad@mcciapune.com", grants: [{ role: "BRANCH", scopeValue: "Tilak Road Office" }] },
  { fullName: "P V SASIDHARAN", email: "sasidharan@mcciapune.com", grants: [{ role: "BRANCH", scopeValue: "Tilak Road Office" }] },
  { fullName: "Tejaskumar Narute", email: "aefc@mcciapune.com", grants: [{ role: "BRANCH", scopeValue: "Hadapsar Office" }, { role: "DEPARTMENT", scopeValue: "AGRICULTURE" }] },
  { fullName: "MANDAR MARATHE", email: "mandarm@mcciapune.com", grants: [{ role: "BRANCH", scopeValue: "Bhosari Office" }] },
  { fullName: "Pratik Pardeshi", email: "paatikp@mcciapune.com", grants: [{ role: "BRANCH", scopeValue: "Bhosari Office" }] },
  { fullName: "Ravindra Pansare", email: "mccianagar@mcciapune.com", grants: [{ role: "BRANCH", scopeValue: "Ahilyanagar Office" }] },
  { fullName: "Aishwary Songirkar", email: "aishwary.fellow@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "MSME HELPLINE" }] },
  { fullName: "Mayur Borkar", email: "mayurb@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "RAMP" }] },
  { fullName: "RAMP Team", email: "mcciaramp@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "RAMP" }] },
  { fullName: "SANDHYA ACHARYA", email: "sandhyaa@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "CBP" }] },
  { fullName: "VARSHA MAHAJAN", email: "varsham@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "CBP" }] },
  { fullName: "CHANDRASHEKHAR SHAH", email: "shekhars@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "CBP" }] },
  { fullName: "Shriram Joshi", email: "shriramj@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "CBP" }] },
  { fullName: "SONAL PHADNIS", email: "sonalp@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "MEMBERSHIP" }] },
  { fullName: "KIRTI KENDHE", email: "kirtik@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "MEMBERSHIP" }] },
  { fullName: "Saahil Amritkar", email: "saahila@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "MEMBERSHIP" }] },
  { fullName: "Rachita Waghamare", email: "rachitaw@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "MEMBERSHIP" }] },
  { fullName: "PARIKSHIT DAS", email: "parikshitd@mcciapune.com", grants: [{ role: "DEPARTMENT", scopeValue: "MEMBERSHIP" }] },
];

function generatePassword(): string { return crypto.randomBytes(20).toString("base64url"); }

async function main() {
  const emails = ACCOUNTS.map((account) => account.email);
  if (new Set(emails).size !== emails.length) throw new Error("Duplicate account email in seed list.");

  const existingUsers = await db.select().from(adminUsers).where(inArray(adminUsers.email, emails));
  const createdCredentials: { fullName: string; email: string; password: string }[] = [];

  await db.transaction(async (tx) => {
    for (const account of ACCOUNTS) {
      let user = existingUsers.find((candidate) => candidate.email === account.email);
      if (!user) {
        const password = generatePassword();
        const [created] = await tx.insert(adminUsers).values({
          fullName: account.fullName,
          email: account.email,
          passwordHash: await hashPassword(password),
          // Deprecated compatibility column; the grants below are authoritative.
          role: account.grants[0].role,
          recommendingAuthorityId: null,
        }).returning();
        user = created;
        createdCredentials.push({ fullName: account.fullName, email: account.email, password });
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

  if (createdCredentials.length === 0) {
    console.log("No accounts created; all confirmed Team Dashboard accounts and grants already exist.");
    return;
  }
  const lines = [
    "# Team Dashboard credentials — generated once",
    "",
    "Copy these securely to each account holder, then delete this file.",
    "",
    ...createdCredentials.map((item) => `- **${item.fullName}** — ${item.email} — password: \`${item.password}\``),
    "",
  ];
  const reportPath = path.join(process.cwd(), "scripts", "team-dashboard-users-report.md");
  fs.writeFileSync(reportPath, lines.join("\n"));
  console.log(`Created ${createdCredentials.length} accounts. Credentials written to ${reportPath}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
