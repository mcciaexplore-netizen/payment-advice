/**
 * Idempotent seed for the real Finance and Recommending Authority logins
 * (`admin_users`), replacing the old shared ADMIN_PASSWORD. See
 * Dual_Login_Retire_Sanction_Stamps_Prompt.md / AGENT_HANDOFF.md.
 *
 * Full names for Sunil/Abha are sourced from lib/validation/payment-advice.ts's
 * existing VERIFIER_NAMES list ("Sunil Salunke", "Abha Khatavkar") — the
 * same real people this app already names elsewhere. The ALL-access
 * account's email is pre-filled from the session context this script was
 * written in (mcciaexplore@gmail.com). Authority entries must exactly match
 * one existing recommending_authorities row before any account is inserted.
 *
 * Generates a strong random password per account except for the confirmed
 * 2026 Authority expansion batch, whose deliberately distribution-friendly
 * initial password is lowercase first name + "@2026". Prints each initial
 * password ONCE to the console and to a local, gitignored report file
 * (scripts/admin-users-report.md — never committed, delete after copying
 * the passwords out) — only the bcrypt hash is ever written to the DB.
 * Re-running skips an exact matching active account without changing its
 * password, and refuses any conflicting name/role/authority-link state.
 *
 * Usage: npm run seed:admin-users
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "../lib/db";
import { adminUsers, adminUserRoles, recommendingAuthorities } from "../lib/db/schema";
import { hashPassword } from "../lib/admin-users";
import { ADMIN_ROLES, AdminRole } from "../lib/auth";
import { and, eq, inArray } from "drizzle-orm";

type SeedAccount = {
  fullName: string;
  email: string;
  role: AdminRole;
  authorityName?: string;
  predictableInitialPassword?: boolean;
};

const ACCOUNTS: SeedAccount[] = [
  { fullName: "Sunil Salunke", email: "sunils@mcciapune.com", role: "PAYMENT_ADVICE" },
  { fullName: "Abha Khatavkar", email: "abhak@mcciapune.com", role: "CASH_VOUCHER" },
  { fullName: "MCCIA Finance (All Access)", email: "mcciaexplore@gmail.com", role: "ALL" },
  { fullName: "ANIRUDDHA BRAHMA", email: "aniruddhab@mcciapune.com", role: "AUTHORITY", authorityName: "ANIRUDDHA BRAHMA" },
  { fullName: "Chintamani Shrotri", email: "chintamanis@mcciapune.com", role: "AUTHORITY", authorityName: "Chintamani Shrotri" },
  { fullName: "PRASHANT JOGALEKAR", email: "prashantj@mcciapune.com", role: "AUTHORITY", authorityName: "PRASHANT JOGALEKAR" },
  { fullName: "SHANTANU JAGTAP", email: "shantanuj@mcciapune.com", role: "AUTHORITY", authorityName: "SHANTANU JAGTAP" },
  { fullName: "DG", email: "dg@mcciapune.com", role: "AUTHORITY", authorityName: "DG", predictableInitialPassword: true },
  { fullName: "Ganesh Mate", email: "ganeshm@mcciapune.com", role: "AUTHORITY", authorityName: "Ganesh Mate", predictableInitialPassword: true },
  { fullName: "MANGESH KULKARNI", email: "mangeshk@mcciapune.com", role: "AUTHORITY", authorityName: "MANGESH KULKARNI", predictableInitialPassword: true },
  { fullName: "Neeraj Thakur", email: "neerajt@mcciapune.com", role: "AUTHORITY", authorityName: "Neeraj Thakur", predictableInitialPassword: true },
  { fullName: "Nikhil Jain", email: "nikhilj@mcciapune.com", role: "AUTHORITY", authorityName: "Nikhil Jain", predictableInitialPassword: true },
  { fullName: "RAJNIKANT  GAIKWAD", email: "engineer@mcciapune.com", role: "AUTHORITY", authorityName: "RAJNIKANT  GAIKWAD", predictableInitialPassword: true },
  { fullName: "SUDHANWA KOPARDEKAR", email: "sudhanwak@mcciapune.com", role: "AUTHORITY", authorityName: "SUDHANWA KOPARDEKAR", predictableInitialPassword: true },
  { fullName: "Satavisha Natu", email: "satavishan@mcciapune.com", role: "AUTHORITY", authorityName: "Satavisha Natu", predictableInitialPassword: true },
];

function generatePassword(): string {
  // 20 random bytes, base64url — no ambiguous characters to misread, no
  // shell-unsafe symbols, comfortably high entropy for a human-typed
  // password shared once over a private channel.
  return crypto.randomBytes(20).toString("base64url");
}

function initialPasswordFor(account: SeedAccount): string {
  if (!account.predictableInitialPassword) return generatePassword();
  const firstName = account.fullName.trim().split(/\s+/)[0]?.toLowerCase();
  if (!firstName || !/^[a-z]+$/.test(firstName)) {
    throw new Error(`Cannot derive an unambiguous first-name password for "${account.fullName}".`);
  }
  return `${firstName}@2026`;
}

async function main() {
  const placeholders = ACCOUNTS.filter((a) => a.email.startsWith("TODO-"));
  if (placeholders.length > 0) {
    console.error(
      `Refusing to run: ${placeholders.length} account(s) still have a TODO placeholder email. ` +
        `Edit ACCOUNTS in this script with the real address(es) first: ` +
        placeholders.map((a) => a.fullName).join(", "),
    );
    process.exit(1);
  }

  for (const role of ACCOUNTS.map((a) => a.role)) {
    if (!ADMIN_ROLES.includes(role)) {
      console.error(`Invalid role "${role}" — must be one of ${ADMIN_ROLES.join(", ")}`);
      process.exit(1);
    }
  }

  const authorityNames = ACCOUNTS.flatMap((account) => account.authorityName ? [account.authorityName] : []);
  const authorityRows = authorityNames.length
    ? await db.select({ id: recommendingAuthorities.id, authorityName: recommendingAuthorities.authorityName })
        .from(recommendingAuthorities)
        .where(inArray(recommendingAuthorities.authorityName, authorityNames))
    : [];
  for (const name of authorityNames) {
    const matches = authorityRows.filter((row) => row.authorityName === name);
    if (matches.length !== 1) {
      throw new Error(`Authority name must match exactly one recommending_authorities row: "${name}" (found ${matches.length}). Refusing to guess.`);
    }
  }

  const normalizedEmails = ACCOUNTS.map((account) => account.email.trim().toLowerCase());
  const existingUsers = await db
    .select({
      fullName: adminUsers.fullName,
      email: adminUsers.email,
      role: adminUsers.role,
      recommendingAuthorityId: adminUsers.recommendingAuthorityId,
      isActive: adminUsers.isActive,
    })
    .from(adminUsers)
    .where(inArray(adminUsers.email, normalizedEmails));

  const accountsToCreate = ACCOUNTS.filter((account) => {
    const email = account.email.trim().toLowerCase();
    const existing = existingUsers.find((user) => user.email === email);
    if (!existing) return true;

    const expectedAuthorityId = account.authorityName
      ? authorityRows.find((row) => row.authorityName === account.authorityName)!.id
      : null;
    if (
      existing.fullName !== account.fullName ||
      existing.role !== account.role ||
      existing.recommendingAuthorityId !== expectedAuthorityId ||
      !existing.isActive
    ) {
      throw new Error(
        `Existing admin_users row for ${email} does not exactly match the requested ` +
          `name, role, authority link, and active state. Refusing to overwrite it.`,
      );
    }

    console.log(`Skipping ${email}: matching active account already exists (password unchanged).`);
    return false;
  });

  const results: { fullName: string; email: string; role: AdminRole; password: string }[] = [];

  for (const account of accountsToCreate) {
    const password = initialPasswordFor(account);
    const passwordHash = await hashPassword(password);
    const recommendingAuthorityId = account.authorityName
      ? authorityRows.find((row) => row.authorityName === account.authorityName)!.id
      : null;
    const [created] = await db
      .insert(adminUsers)
      .values({
        fullName: account.fullName,
        email: account.email.trim().toLowerCase(),
        passwordHash,
        // Deprecated columns — still populated for backward compatibility
        // during the transition; admin_user_roles below is the real source
        // of truth for the app's auth logic. See AGENT_HANDOFF.md.
        role: account.role,
        recommendingAuthorityId,
      })
      .returning({ id: adminUsers.id });
    await db.insert(adminUserRoles).values({
      adminUserId: created.id,
      role: account.role,
      recommendingAuthorityId,
    });
    results.push({ ...account, password });
  }

  // Self-healing for the multi-role migration: every account in ACCOUNTS
  // (newly created above, or pre-existing and left alone) must have a
  // matching admin_user_roles row. A pre-existing account normally already
  // does (backfilled once, see scripts/backfill-admin-user-roles.ts) — this
  // just guards against re-running this seed against a DB where that
  // backfill hasn't happened yet, without duplicating rows (unique
  // (admin_user_id, role) is also enforced at the DB level).
  const allUsersNow = await db
    .select({ id: adminUsers.id, email: adminUsers.email })
    .from(adminUsers)
    .where(inArray(adminUsers.email, normalizedEmails));
  for (const account of ACCOUNTS) {
    const email = account.email.trim().toLowerCase();
    const user = allUsersNow.find((u) => u.email === email);
    if (!user) continue; // created above and already has its role row
    const [existingRole] = await db
      .select()
      .from(adminUserRoles)
      .where(and(eq(adminUserRoles.adminUserId, user.id), eq(adminUserRoles.role, account.role)))
      .limit(1);
    if (existingRole) continue;
    const recommendingAuthorityId = account.authorityName
      ? authorityRows.find((row) => row.authorityName === account.authorityName)!.id
      : null;
    await db.insert(adminUserRoles).values({ adminUserId: user.id, role: account.role, recommendingAuthorityId });
    console.log(`Backfilled missing admin_user_roles row for ${email} (${account.role}).`);
  }

  if (results.length === 0) {
    console.log("No accounts created; every requested account already exists and matches.");
    return;
  }

  const reportLines = [
    "# Admin user credentials — generated once, never re-shown",
    "",
    "Copy these to the named account holders, then delete this file.",
    "This file is gitignored and must never be committed.",
    "",
    ...results.map(
      (r) => `- **${r.fullName}** (${r.role}) — ${r.email} — password: \`${r.password}\``,
    ),
    "",
  ];
  const reportPath = path.join(process.cwd(), "scripts", "admin-users-report.md");
  fs.writeFileSync(reportPath, reportLines.join("\n"));

  console.log(`Created ${results.length} admin_users row(s).`);
  console.log(reportLines.join("\n"));
  console.log(`(Also written to ${reportPath} — delete it once you've copied the passwords out.)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
