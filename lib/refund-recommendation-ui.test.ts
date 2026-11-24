import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The refund recommendation screens (authority tab, pending notice, My
 * Refunds status, the review page) rendered through the real pages against a
 * fake DB. With the process switched off nothing about the reviews table may
 * be touched: that is what makes the code safe to deploy before migration 0032. */
const state = vi.hoisted(() => ({
  session: null as unknown,
  roleRows: [] as unknown[],
  authorityRecord: [{ authorityName: "Head Admin" }] as unknown[],
  refunds: [] as unknown[],
  joined: [] as unknown[],
  waiting: 0,
  queries: [] as Array<{ table: unknown; joined: unknown[] }>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => state.session }));
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return {
    db: {
      select: (fields?: Record<string, unknown>) => {
        const query: { table: unknown; joined: unknown[]; limited?: boolean } = { table: undefined, joined: [] };
        state.queries.push(query);
        const node: Record<string, unknown> = {};
        node.from = (table: unknown) => { query.table = table; return node; };
        node.leftJoin = (table: unknown) => { query.joined.push(table); return node; };
        for (const method of ["where", "orderBy"]) node[method] = () => node;
        const resultFor = () => query.table === schema.adminUsers ? [{ email: "me@mcciapune.com" }]
          : query.table === schema.adminUserRoles ? state.roleRows
          : query.table === schema.recommendingAuthorities ? state.authorityRecord
          : query.table === schema.refundRequests && fields && "count" in fields ? [{ count: state.waiting }]
          : query.table === schema.refundRequests && query.joined.length > 0 && query.limited ? state.joined
          : query.table === schema.refundRequests ? state.refunds
          : query.table === schema.paymentAdvices && fields && "total" in fields ? [{}]
          : [];
        node.limit = () => { query.limited = true; return node; };
        node.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(resultFor()).then(resolve, reject);
        return node;
      },
    },
  };
});

import { refundRequestReviews } from "@/lib/db/schema";
import TeamDashboard from "../app/authority/page";
import AuthorityRefundPage from "../app/authority/refund/[id]/page";

const AUTHORITY = { session: { adminUserId: "u", fullName: "A", roles: ["AUTHORITY"], recommendingAuthorityId: "auth-1" }, roleRows: [{ role: "AUTHORITY", recommendingAuthorityId: "auth-1", scopeValue: null }] };
const SELF = { session: { adminUserId: "u", fullName: "S", roles: ["SELF"], recommendingAuthorityId: null }, roleRows: [{ role: "SELF", recommendingAuthorityId: null, scopeValue: null }] };

async function render(who: typeof AUTHORITY | typeof SELF, params: Record<string, string>) {
  state.session = who.session;
  state.roleRows = [...who.roleRows];
  state.queries = [];
  const role = who === AUTHORITY ? "AUTHORITY" : "SELF";
  return renderToStaticMarkup((await TeamDashboard({ searchParams: Promise.resolve({ role, ...params }) }))!);
}
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const touchedReviews = () => state.queries.some((query) => query.joined.includes(refundRequestReviews) || query.table === refundRequestReviews);

const row = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `${n}1111111-1111-4111-8111-111111111111`, serialNo: `REF/MCCIA/2026-27/000${n}`, requestDate: "2026-11-17",
  submittedByName: `Submitter ${n}`, submittedByEmail: `s${n}@mcciapune.com`, department: "CBP", branch: "SB Road Office",
  payeeName: `Payee ${n}`, nature: `Reason ${n}`, totalAmount: "4720.00", decision: null, decidedAt: null, decidedByName: null, remarks: null, ...extra,
});
const DECIDED = new Date("2026-11-20T10:00:00Z");

beforeEach(() => {
  vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
  vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "true");
  state.waiting = 0;
  state.refunds = [row(7), row(6, { decision: "RECOMMENDED", decidedAt: DECIDED, decidedByName: "Head Admin" }), row(5, { decision: "SENT_BACK", decidedAt: DECIDED, decidedByName: "Head Admin", remarks: "Fix amount" })];
});
afterEach(() => vi.unstubAllEnvs());

describe("authority's Refund Requests tab with the recommendation process on", () => {
  it("shows each refund's status and a Review button for the waiting one, Details for the decided ones", async () => {
    const html = await render(AUTHORITY, { view: "refund-requests" });
    const page = text(html);
    expect(page).toContain("3 refund requests naming you as the recommending authority");
    expect(page).toContain("1 waiting for your recommendation.");
    expect(page).toContain("Waiting for recommendation");
    expect(page).toContain("Recommended on 20/11/2026");
    expect(page).toContain("Sent back on 20/11/2026");
    expect(html).toMatch(/href="\/authority\/refund\/71111111-1111-4111-8111-111111111111"[^>]*>Review</);
    expect(html).toMatch(/href="\/authority\/refund\/61111111-1111-4111-8111-111111111111"[^>]*>Details</);
    expect(touchedReviews()).toBe(true);
  });
});

describe("Pending My Recommendation", () => {
  it("points the authority to refunds waiting for them", async () => {
    state.waiting = 2;
    const html = await render(AUTHORITY, { view: "pending" });
    expect(text(html)).toContain("2 refund requests waiting for your recommendation Review →");
    expect(html).toContain('href="/authority?role=AUTHORITY&amp;view=refund-requests"');
  });

  it("says nothing when none are waiting", async () => {
    state.waiting = 0;
    expect(text(await render(AUTHORITY, { view: "pending" }))).not.toMatch(/refund requests? waiting for your recommendation/);
  });

  it("singular wording for one", async () => {
    state.waiting = 1;
    expect(text(await render(AUTHORITY, { view: "pending" }))).toContain("1 refund request waiting for your recommendation");
  });
});

describe("My Refunds (the submitter) shows where each refund stands", () => {
  it("status for each, and the authority's remarks when sent back", async () => {
    const page = text(await render(SELF, { view: "my-refunds" }));
    expect(page).toContain("Waiting for recommendation");
    expect(page).toContain("Recommended on 20/11/2026");
    expect(page).toContain("Sent back on 20/11/2026");
    expect(page).toContain("Remarks: Fix amount");
  });
});

describe("with the recommendation process OFF the reviews table is never touched", () => {
  beforeEach(() => vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", ""));

  it("authority tab: no status column, no Review button, no join", async () => {
    const html = await render(AUTHORITY, { view: "refund-requests" });
    const page = text(html);
    expect(page).toContain("naming you as the recommending authority");
    expect(page).not.toContain("waiting for your recommendation");
    expect(page).not.toContain("Waiting for recommendation");
    expect(html).not.toContain("/authority/refund/");
    expect(touchedReviews()).toBe(false);
  });

  it("pending notice and My Refunds status are absent, again with no join", async () => {
    state.waiting = 5;
    expect(text(await render(AUTHORITY, { view: "pending" }))).not.toMatch(/refund requests? waiting for your recommendation/);
    expect(touchedReviews()).toBe(false);
    expect(text(await render(SELF, { view: "my-refunds" }))).not.toContain("Waiting for recommendation");
    expect(touchedReviews()).toBe(false);
  });
});

describe("the review page", () => {
  const refund = {
    id: "71111111-1111-4111-8111-111111111111", serialNo: "REF/MCCIA/2026-27/0007", requestDate: "2026-11-17", fromDate: "2026-11-01",
    submittedByName: "Sandhya Acharya", submittedByEmail: "sandhyaa@mcciapune.com", submittedByDepartment: "CBP", branch: "SB Road Office",
    payeeName: "Deccan Mechanical", payeeAddress: "Pune", payeeContactPerson: null, payeeContactPhone: null, payeeEmail: null, payeeGstin: null, payeeUdyamNumber: null,
    basicAmount: "4000.00", gstAmount: "720.00", totalAmount: "4720.00", natureOfExpenditure: "Refund of participation fee",
    bankName: "HDFC", beneficiaryName: "Deccan", bankAccountNo: "123", bankIfsc: "HDFC0001234", enclosures: null, specialRemarks: null,
    documents: [{ type: "CANCELLED_CHEQUE", fileName: "cheque.jpg", blobPathname: "x", blobUrl: "y", sizeBytes: 1 }],
  };
  const open = async () => renderToStaticMarkup(await AuthorityRefundPage({ params: Promise.resolve({ id: refund.id }) }));

  beforeEach(() => { state.session = AUTHORITY.session; });

  it("a waiting refund shows the details, the documents through the authority route, and the Recommend and Send back buttons", async () => {
    state.joined = [{ refund, review: null }];
    const html = await open();
    const page = text(html);
    expect(page).toContain("REF/MCCIA/2026-27/0007");
    expect(page).toContain("Sandhya Acharya (sandhyaa@mcciapune.com)");
    expect(page).toContain("Total refund ₹ 4,720.00");
    expect(page).toContain("Refund of participation fee");
    expect(html).toContain('/api/authority/refund/71111111-1111-4111-8111-111111111111/documents/0');
    expect(page).toContain("Recommend");
    expect(page).toContain("Send back");
  });

  it("a recommended refund shows who recommended it and no buttons", async () => {
    state.joined = [{ refund, review: { decision: "RECOMMENDED", decidedByName: "Head Admin", decidedAt: DECIDED, remarks: null } }];
    const page = text(await open());
    expect(page).toContain("Recommended by Head Admin on 20/11/2026");
    expect(page).not.toMatch(/Send back\b/);
  });

  it("a sent-back refund shows the remarks", async () => {
    state.joined = [{ refund, review: { decision: "SENT_BACK", decidedByName: "Head Admin", decidedAt: DECIDED, remarks: "Fix amount" } }];
    const page = text(await open());
    expect(page).toContain("Sent back by Head Admin on 20/11/2026");
    expect(page).toContain("Remarks: Fix amount");
  });

  it("is a 404 for a refund that does not name this authority, for a non-authority, and while the process is off", async () => {
    state.joined = [];
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
    state.joined = [{ refund, review: null }];
    state.session = SELF.session;
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
    state.session = AUTHORITY.session;
    vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "");
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
