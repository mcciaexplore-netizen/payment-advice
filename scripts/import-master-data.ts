/**
 * Imports MCCIA's staff roster, recommending-authority mappings, and
 * active vendor list from the master xlsx file MCCIA sends.
 *
 * Usage: npm run import:master-data -- path/to/Master-_FILE_FOR_AI.xlsx [--force]
 *
 * --force skips the "vendors already exist" confirmation prompt (used for
 * scripted/non-interactive re-runs; a human running this normally gets
 * asked interactively).
 *
 * Idempotent-safe for staff/authorities: re-running reuses existing staff
 * members (matched case-insensitively by name) and existing recommending
 * authorities, and upserts staff_authority_options rather than duplicating
 * them. It does NOT delete or resync links that existed before but are
 * absent from a later run — this is purely additive.
 *
 * Touches only: staff_members, recommending_authorities,
 * staff_authority_options, vendors. Nothing else.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import ExcelJS from "exceljs";
import { count } from "drizzle-orm";
import { db } from "../lib/db";
import {
  staffMembers,
  recommendingAuthorities,
  staffAuthorityOptions,
  vendors,
} from "../lib/db/schema";

type CellValue = ExcelJS.CellValue;

function normalize(v: CellValue | undefined): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function isDG(v: string): boolean {
  return v.toLowerCase().replace(/\s+/g, "") === "dg";
}

type ParsedStaffRow = {
  row: number;
  name: string;
  firstAuthority: string | null;
  secondAuthority: string | null;
};

type ImportReport = {
  sourceFile: string;
  generatedAt: string;
  staffCreated: string[];
  staffReused: string[];
  authoritiesCreated: string[];
  authoritiesReused: string[];
  missingRecommendedBy: { row: number; name: string }[];
  skippedSelfReference: { row: number; name: string; skippedValue: string }[];
  duplicateStaffNames: { row: number; name: string; firstSeenRow: number }[];
  malformedRows: { row: number; reason: string; raw: string }[];
  vendorsSkippedEntirely: boolean;
  vendorsImported: number;
  vendorsReused: number;
  vendorDuplicatesInSheet: { name: string; count: number }[];
};

function parseStaffSheet(sheet: ExcelJS.Worksheet) {
  const parsedRows: ParsedStaffRow[] = [];
  const missingRecommendedBy: ImportReport["missingRecommendedBy"] = [];
  const skippedSelfReference: ImportReport["skippedSelfReference"] = [];
  const duplicateStaffNames: ImportReport["duplicateStaffNames"] = [];
  const malformedRows: ImportReport["malformedRows"] = [];
  const seenNames = new Map<string, number>();

  for (let i = 2; i <= sheet.rowCount; i++) {
    const v = sheet.getRow(i).values as CellValue[];
    const name = normalize(v[2]);
    const recBy = normalize(v[3]);
    const second = normalize(v[4]);

    if (!name) {
      malformedRows.push({ row: i, reason: "missing Name", raw: JSON.stringify(v) });
      continue;
    }

    const nameKey = name.toLowerCase();
    const firstSeenRow = seenNames.get(nameKey);
    if (firstSeenRow !== undefined) {
      duplicateStaffNames.push({ row: i, name, firstSeenRow });
      continue; // dedupe: only the first occurrence becomes a staff_members row
    }
    seenNames.set(nameKey, i);

    if (!recBy) {
      missingRecommendedBy.push({ row: i, name });
    }

    let secondAuthority: string | null = null;
    if (second) {
      if (second.toLowerCase() === name.toLowerCase()) {
        skippedSelfReference.push({ row: i, name, skippedValue: second });
      } else {
        secondAuthority = second;
      }
    }

    parsedRows.push({ row: i, name, firstAuthority: recBy || null, secondAuthority });
  }

  return { parsedRows, missingRecommendedBy, skippedSelfReference, duplicateStaffNames, malformedRows };
}

async function importStaffAndAuthorities(wb: ExcelJS.Workbook, report: ImportReport) {
  const sheet = wb.getWorksheet("Recommende");
  if (!sheet) throw new Error('Sheet "Recommende" not found in workbook');

  const { parsedRows, missingRecommendedBy, skippedSelfReference, duplicateStaffNames, malformedRows } =
    parseStaffSheet(sheet);
  report.missingRecommendedBy = missingRecommendedBy;
  report.skippedSelfReference = skippedSelfReference;
  report.duplicateStaffNames = duplicateStaffNames;
  report.malformedRows.push(...malformedRows);

  // Preload existing rows so re-runs reuse rather than duplicate.
  const authorityCache = new Map<string, typeof recommendingAuthorities.$inferSelect>();
  for (const a of await db.select().from(recommendingAuthorities)) {
    const key = isDG(a.authorityName) ? "dg" : a.authorityName.toLowerCase();
    authorityCache.set(key, a);
  }
  const staffCache = new Map<string, typeof staffMembers.$inferSelect>();
  for (const s of await db.select().from(staffMembers)) {
    staffCache.set(s.fullName.toLowerCase(), s);
  }

  async function getOrCreateAuthority(rawName: string) {
    const display = isDG(rawName) ? "DG" : rawName;
    const key = isDG(rawName) ? "dg" : display.toLowerCase();
    const cached = authorityCache.get(key);
    if (cached) {
      // Log the canonical stored casing, not this row's raw text — the
      // same authority can appear with different casing across rows (e.g.
      // "Nikhil Jain" vs. his own self-referencing row's "NIKHIL JAIN"),
      // and logging the raw text here made the report show phantom
      // duplicates even though the DB was correctly deduped.
      report.authoritiesReused.push(cached.authorityName);
      return cached;
    }
    const [created] = await db
      .insert(recommendingAuthorities)
      .values({ authorityName: display })
      .returning();
    authorityCache.set(key, created);
    report.authoritiesCreated.push(display);
    return created;
  }

  async function upsertOption(staffId: string, authorityId: string, sortOrder: number) {
    await db
      .insert(staffAuthorityOptions)
      .values({ staffMemberId: staffId, recommendingAuthorityId: authorityId, sortOrder })
      .onConflictDoUpdate({
        target: [staffAuthorityOptions.staffMemberId, staffAuthorityOptions.recommendingAuthorityId],
        set: { sortOrder },
      });
  }

  for (const r of parsedRows) {
    let staff = staffCache.get(r.name.toLowerCase());
    if (staff) {
      report.staffReused.push(r.name);
    } else {
      const [created] = await db.insert(staffMembers).values({ fullName: r.name }).returning();
      staff = created;
      staffCache.set(r.name.toLowerCase(), staff);
      report.staffCreated.push(r.name);
    }

    if (r.firstAuthority) {
      const auth = await getOrCreateAuthority(r.firstAuthority);
      await upsertOption(staff.id, auth.id, 1);
    }
    if (r.secondAuthority) {
      const auth2 = await getOrCreateAuthority(r.secondAuthority);
      await upsertOption(staff.id, auth2.id, 2);
    }
  }
}

async function importVendors(wb: ExcelJS.Workbook, report: ImportReport, force: boolean) {
  const sheet = wb.getWorksheet("Sheet2");
  if (!sheet) throw new Error('Sheet "Sheet2" not found in workbook');

  const [{ count: existingCount }] = await db.select({ count: count() }).from(vendors);
  if (existingCount > 0 && !force) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `vendors table already has ${existingCount} row(s). Import Sheet2's 663 rows anyway ` +
        `(existing names are reused, not duplicated)? [y/N] `,
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "y") {
      console.log("Skipping vendor import.");
      report.vendorsSkippedEntirely = true;
      return;
    }
  }

  const existingNames = new Set(
    (await db.select({ name: vendors.companyName }).from(vendors)).map((v) => v.name.toLowerCase()),
  );
  const seenInSheet = new Map<string, number>();
  const toInsert: { companyName: string; isActive: true }[] = [];

  for (let i = 2; i <= sheet.rowCount; i++) {
    const raw = (sheet.getRow(i).values as CellValue[])[2];
    const name = normalize(raw);
    if (!name) {
      report.malformedRows.push({ row: i, reason: "missing Party Name", raw: JSON.stringify(raw) });
      continue;
    }
    const key = name.toLowerCase();
    seenInSheet.set(key, (seenInSheet.get(key) ?? 0) + 1);
    if (seenInSheet.get(key)! > 1) continue; // report below; only first occurrence imported
    if (existingNames.has(key)) {
      report.vendorsReused += 1;
      continue;
    }
    toInsert.push({ companyName: name, isActive: true });
  }

  report.vendorDuplicatesInSheet = [...seenInSheet.entries()]
    .filter(([, c]) => c > 1)
    .map(([name, c]) => ({ name, count: c }));

  if (toInsert.length > 0) {
    await db.insert(vendors).values(toInsert);
  }
  report.vendorsImported = toInsert.length;
}

function renderReport(r: ImportReport): string {
  const lines: string[] = [];
  lines.push("# Master Data Import Report");
  lines.push("");
  lines.push(`Generated: ${r.generatedAt}`);
  lines.push(`Source file: ${r.sourceFile}`);
  lines.push("");
  lines.push("## Staff & Recommending Authorities");
  lines.push("");
  lines.push(`- Staff members created: ${r.staffCreated.length}`);
  if (r.staffReused.length) lines.push(`- Staff members reused (already existed): ${r.staffReused.length}`);
  lines.push(`- Recommending authorities created: ${r.authoritiesCreated.length}`);
  r.authoritiesCreated.forEach((a) => lines.push(`  - ${a}`));
  if (r.authoritiesReused.length) {
    const uniqueReused = [...new Set(r.authoritiesReused)];
    lines.push(`- Recommending authorities reused (already existed): ${uniqueReused.length}`);
    uniqueReused.forEach((a) => lines.push(`  - ${a}`));
  }
  lines.push("");
  lines.push(`### Duplicate staff Name rows (deduped — only first occurrence imported): ${r.duplicateStaffNames.length}`);
  r.duplicateStaffNames.forEach((d) =>
    lines.push(`  - row ${d.row}: "${d.name}" (duplicate of row ${d.firstSeenRow})`),
  );
  lines.push("");
  lines.push(`### Rows with no "Recommended by" value (staff created, no authority linked): ${r.missingRecommendedBy.length}`);
  r.missingRecommendedBy.forEach((m) => lines.push(`  - row ${m.row}: "${m.name}"`));
  lines.push("");
  lines.push(`### Skipped self-referencing second authority (data-entry artifact): ${r.skippedSelfReference.length}`);
  r.skippedSelfReference.forEach((s) =>
    lines.push(`  - row ${s.row}: "${s.name}" — skipped "${s.skippedValue}"`),
  );
  lines.push("");
  const staffMalformed = r.malformedRows.filter((m) => m.reason.includes("Name") && !m.reason.includes("Party"));
  lines.push(`### Rows that didn't parse cleanly (staff sheet): ${staffMalformed.length}`);
  staffMalformed.forEach((m) => lines.push(`  - row ${m.row}: ${m.reason} — ${m.raw}`));
  lines.push("");
  lines.push("## Vendors");
  lines.push("");
  if (r.vendorsSkippedEntirely) {
    lines.push("- SKIPPED — vendors already existed and import was not confirmed.");
  } else {
    lines.push(`- Imported: ${r.vendorsImported}`);
    lines.push(`- Reused (already existed in DB): ${r.vendorsReused}`);
    lines.push(`- Duplicate Party Name values within the sheet (only first occurrence imported): ${r.vendorDuplicatesInSheet.length}`);
    r.vendorDuplicatesInSheet.forEach((d) => lines.push(`  - "${d.name}" x${d.count}`));
    const vendorMalformed = r.malformedRows.filter((m) => m.reason.includes("Party"));
    if (vendorMalformed.length) {
      lines.push(`- Rows that didn't parse cleanly: ${vendorMalformed.length}`);
      vendorMalformed.forEach((m) => lines.push(`  - row ${m.row}: ${m.reason} — ${m.raw}`));
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const filePath = args.find((a) => !a.startsWith("--"));
  if (!filePath) {
    console.error("Usage: npm run import:master-data -- path/to/Master-_FILE_FOR_AI.xlsx [--force]");
    process.exit(1);
  }
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(resolvedPath);

  const report: ImportReport = {
    sourceFile: resolvedPath,
    generatedAt: new Date().toISOString(),
    staffCreated: [],
    staffReused: [],
    authoritiesCreated: [],
    authoritiesReused: [],
    missingRecommendedBy: [],
    skippedSelfReference: [],
    duplicateStaffNames: [],
    malformedRows: [],
    vendorsSkippedEntirely: false,
    vendorsImported: 0,
    vendorsReused: 0,
    vendorDuplicatesInSheet: [],
  };

  await importStaffAndAuthorities(wb, report);
  await importVendors(wb, report, force);

  const rendered = renderReport(report);
  console.log(rendered);

  const outPath = path.resolve(process.cwd(), "import-report.md");
  fs.writeFileSync(outPath, rendered);
  console.log(`\nReport written to ${outPath}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
