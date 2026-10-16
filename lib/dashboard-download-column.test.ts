import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminUserRoles, adminUsers, attachments, paymentAdvices, paymentEntries, recommendingAuthorities } from "@/lib/db/schema";

/** Renders the real Team Dashboard page (app/authority/page.tsx) against an
 * in-memory fake of the DB, so the Download column can be checked, and
 * screenshotted, with fixture rows that have one, several, and no
 * attachments, without touching the shared database. Set
 * DASHBOARD_FIXTURE_HTML_DIR to also write the rendered pages as HTML. */
const state = vi.hoisted(() => ({
  session: null as unknown,
  roleRows: [] as unknown[],
  rows: [] as unknown[],
  files: [] as unknown[],
}));

vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => state.session }));
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  function resultFor(table: unknown, fields: Record<string, unknown> | undefined) {
    if (table === schema.adminUsers) return [{ email: "owner@mcciapune.com" }];
    if (table === schema.adminUserRoles) return state.roleRows;
    if (table === schema.recommendingAuthorities) return [{ authorityName: "Head Admin" }];
    if (table === schema.paymentEntries) return [];
    if (table === schema.attachments) return state.files;
    if (table === schema.paymentAdvices) return fields && "count" in fields ? [{ count: 0, sum: null }] : state.rows;
    return [];
  }
  return {
    db: {
      select: (fields?: Record<string, unknown>) => {
        let table: unknown;
        const node: Record<string, unknown> = {};
        for (const method of ["where", "orderBy", "limit", "leftJoin"]) node[method] = () => node;
        node.from = (value: unknown) => { table = value; return node; };
        node.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(resultFor(table, fields)).then(resolve, reject);
        return node;
      },
    },
  };
});

import TeamDashboard from "../app/authority/page";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
function advice(id: string, serialNo: string, payeeName: string, nature: string, amount: string, extra: Record<string, unknown> = {}) {
  return {
    id, serialNo, cashVoucherNo: null, advanceNo: null, isAdvance: false, paymentMode: "NEFT", payeeName, amount, nature,
    submittedBy: "Mandar Mhaskar", submittedAt: daysAgo(9), status: "SUBMITTED", approvedAt: daysAgo(8), rejectedAt: null,
    authorityRemarks: null, adminRemarks: null, financeReceivedAt: daysAgo(6), verifiedAt: null, paymentDoneAt: null,
    totalPaid: null, revisionCount: 0, updatedAt: daysAgo(6), sentBackAt: null, finalRejectedAt: null, finalRejectedBy: null,
    finalRejectionRemarks: null, ...extra,
  };
}

const ONE = "11111111-1111-4111-8111-111111111111";
const MANY = "22222222-2222-4222-8222-222222222222";
const NONE = "33333333-3333-4333-8333-333333333333";
const FIXTURE_ROWS = [
  advice(ONE, "MCCIA/2026-27/0231", "SIDDHIVINAYAK WATER SUPPLIERS", "Use 20LTR (Baily) water jar for office use. Bill for the month of August 2026", "1260.00"),
  advice(MANY, "CASH/MCCIA/2026-27/0049", "NIDHI CATERERS", "Food charges for full day session on Total Productive Maintenance at MCCIA Bhosari Office dt. 2nd September 2026", "7350.00", { paymentMode: "CASH", cashVoucherNo: "CASH/MCCIA/2026-27/0049" }),
  advice(NONE, "ADV/MCCIA/2026-27/0012", "PUNE EXPO SERVICES PVT. LTD.", "Advance for stall booking at the Pune Industrial Expo", "25000.00", { isAdvance: true, advanceNo: "ADV/MCCIA/2026-27/0012" }),
];
const FIXTURE_FILES = [
  { id: "a1111111-1111-4111-8111-111111111111", adviceId: ONE, fileName: "Siddhivinayak Water Bill.jpg" },
  { id: "a2222222-2222-4222-8222-222222222221", adviceId: MANY, fileName: "Nidhi Caterers - Tax Invoice.pdf" },
  { id: "a2222222-2222-4222-8222-222222222222", adviceId: MANY, fileName: "Programme Budget.jpg" },
  { id: "a2222222-2222-4222-8222-222222222223", adviceId: MANY, fileName: "Attendance Sheet 1.jpg" },
  { id: "a2222222-2222-4222-8222-222222222224", adviceId: MANY, fileName: "Attendance Sheet 2.jpg" },
];

const VIEWS = {
  "authority-my-submissions": {
    session: { adminUserId: "u-auth", fullName: "Engineer", roles: ["AUTHORITY"], recommendingAuthorityId: "auth-1" },
    roleRows: [{ role: "AUTHORITY", recommendingAuthorityId: "auth-1", scopeValue: null }],
    params: { role: "AUTHORITY", view: "my-submissions" },
  },
  "team-submissions": {
    session: { adminUserId: "u-branch", fullName: "Mandar", roles: ["BRANCH"], recommendingAuthorityId: null },
    roleRows: [{ role: "BRANCH", recommendingAuthorityId: null, scopeValue: "Bhosari Office" }],
    params: { role: "BRANCH" },
  },
} as const;

async function renderView(name: keyof typeof VIEWS) {
  const view = VIEWS[name];
  state.session = view.session;
  state.roleRows = [...view.roleRows];
  const element = await TeamDashboard({ searchParams: Promise.resolve({ ...view.params }) });
  return renderToStaticMarkup(element!);
}

const buttons = (html: string) => [...html.matchAll(/<(?:a|button)\b([^>]*)>(.*?)<\/(?:a|button)>/g)]
  .map((match) => ({ attrs: match[1], text: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/ \(/g, "(").trim() }));

describe("dashboard Download column with fixture rows", () => {
  beforeEach(() => {
    state.rows = FIXTURE_ROWS.map((row) => ({ ...row }));
    state.files = FIXTURE_FILES.map((file) => ({ ...file }));
  });

  it.each(Object.keys(VIEWS) as Array<keyof typeof VIEWS>)("%s: compact attachment buttons, divider, full PDF label, per row", async (name) => {
    const html = await renderView(name);
    const all = buttons(html);
    // One attachment: direct View / Download, full names as tooltip and accessible name.
    expect(all).toContainEqual(expect.objectContaining({ text: "View View Attachment" }));
    expect(all.find((b) => b.text === "Download" && b.attrs.includes(`/api/advice/${ONE}/attachments/`))?.attrs).toContain('aria-label="Download Attachment"');
    expect(html).toContain('title="View Attachment"');
    // Several: count suffix, full names in tooltip / aria-label.
    expect(all.find((b) => b.text === "View(4) ▾")?.attrs).toContain('aria-label="View Attachment (4)"');
    expect(all.find((b) => b.text === "Download(4) ▾")?.attrs).toContain('title="Download Attachment (4)"');
    // None: disabled, aligned, tooltip.
    expect(html.match(/title="No attachment"/g)).toHaveLength(2);
    // PDF labels by type.
    expect(all.map((b) => b.text)).toEqual(expect.arrayContaining(["Download Payment Advice", "Download Cash Voucher", "Download Advance"]));
    expect(html).toContain('role="group" aria-label="Attachment"');
    expect(html).toContain("dashboard-scroll-frame");
    expect(html).not.toContain("Download PDF");

    const dir = process.env.DASHBOARD_FIXTURE_HTML_DIR;
    if (dir) {
      const staticDir = path.join(process.cwd(), ".next/static");
      const css = (fs.readdirSync(staticDir, { recursive: true }) as string[]).filter((file) => file.endsWith(".css"))
        .map((file) => `<link rel="stylesheet" href="file://${path.join(staticDir, file)}">`).join("");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${name}.html`), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css}</head><body><div class="flex min-h-full flex-1 flex-col"><header class="border-b border-gray-200 bg-[#0b1f3a]"><div class="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3"><span class="font-heading text-lg text-white">Team Dashboard (fixture data)</span></div></header><div class="mx-auto w-full max-w-6xl flex-1 px-6 py-8">${html}</div></div></body></html>`);
    }
  });

  it("never reads Blob URLs into the page", async () => {
    state.files = FIXTURE_FILES.map((file) => ({ ...file, blobUrl: "https://secret.public.blob.vercel-storage.com/x" }));
    const html = await renderView("team-submissions");
    expect(html).not.toContain("vercel-storage.com");
  });
});

// Keep the imported tables referenced so the fake's identity checks stay honest.
void [adminUserRoles, adminUsers, attachments, paymentAdvices, paymentEntries, recommendingAuthorities];
