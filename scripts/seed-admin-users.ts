/**
 * One-off seed: creates the 3 real per-person Admin logins (admin_users),
 * replacing the old shared ADMIN_PASSWORD. See
 * Dual_Login_Retire_Sanction_Stamps_Prompt.md / AGENT_HANDOFF.md.
 *
 * BEFORE RUNNING: fill in the real emails below (marked TODO). Full names
 * for Sunil/Abha are pre-filled from lib/validation/payment-advice.ts's
 * existing VERIFIER_NAMES list ("Sunil Salunke", "Abha Khatavkar") — the
 * same real people this app already names elsewhere. The ALL-access
 * account's email is pre-filled from the session context this script was
 * written in (mcciaexplore@gmail.com) — confirm that's correct before
 * running, don't assume it silently.
 *
 * Generates a strong random password per account, prints each one ONCE to
 * the console and to a local, gitignored report file
 * (scripts/admin-users-report.md — never committed, delete after copying
 * the passwords out) — only the bcrypt hash is ever written to the DB.
 * Re-running is safe but will error on a duplicate email (admin_users.email
 * is unique) rather than silently resetting an existing account's password.
 *
 * Usage: npm run seed:admin-users
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "../lib/db";
import { adminUsers } from "../lib/db/schema";
import { hashPassword } from "../lib/admin-users";
import { ADMIN_ROLES, AdminRole } from "../lib/auth";

type SeedAccount = { fullName: string; email: string; role: AdminRole };

const ACCOUNTS: SeedAccount[] = [
  { fullName: "Sunil Salunke", email: "sunils@mcciapune.com", role: "PAYMENT_ADVICE" },
  { fullName: "Abha Khatavkar", email: "abhak@mcciapune.com", role: "CASH_VOUCHER" },
  { fullName: "MCCIA Finance (All Access)", email: "mcciaexplore@gmail.com", role: "ALL" },
];

function generatePassword(): string {
  // 20 random bytes, base64url — no ambiguous characters to misread, no
  // shell-unsafe symbols, comfortably high entropy for a human-typed
  // password shared once over a private channel.
  return crypto.randomBytes(20).toString("base64url");
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

  const results: { fullName: string; email: string; role: AdminRole; password: string }[] = [];

  for (const account of ACCOUNTS) {
    const password = generatePassword();
    const passwordHash = await hashPassword(password);
    try {
      await db.insert(adminUsers).values({
        fullName: account.fullName,
        email: account.email.trim().toLowerCase(),
        passwordHash,
        role: account.role,
      });
    } catch (err) {
      console.error(`Failed to insert ${account.email} (already exists? see error below) — stopping.`);
      throw err;
    }
    results.push({ ...account, password });
  }

  const reportLines = [
    "# Admin user credentials — generated once, never re-shown",
    "",
    "Copy these to whoever needs them (Sunil, Abha, yourself), then delete this file.",
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
