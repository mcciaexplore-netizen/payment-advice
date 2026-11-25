import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Edit and resubmit a sent-back third party refund: the API route and its
 * logic, against a fake DB. Nothing is written anywhere and no email is sent
 * (notifyRefundSubmission is mocked). */
const state = vi.hoisted(() => ({
  session: null as unknown,
  accountEmail: "sandhyaa@mcciapune.com",
  found: [] as unknown[],
  deletedReviews: [] as unknown[],
  deleteCalls: 0,
  updates: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
  locks: 0,
  notified: [] as Array<Record<string, unknown>>,
  verified: [] as unknown[],
}));

vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => state.session }));
vi.mock("@/lib/advice/refund-review", () => ({ notifyRefundSubmission: async (input: Record<string, unknown>) => { state.notified.push(input); } }));
vi.mock("@/lib/attachments/verify-uploaded", () => ({ verifyUploadedAttachments: async (documents: unknown[]) => { state.verified.push(...documents); return null; } }));
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const chain = (result: () => unknown) => {
    const node: Record<string, unknown> = {};
    for (const method of ["from", "leftJoin", "where", "orderBy"]) node[method] = () => node;
    node.limit = async () => result();
    return node;
  };
  return {
    db: {
      select: (fields?: Record<string, unknown>) => chain(() => (fields && "email" in fields && Object.keys(fields).length === 1 ? (state.session ? [{ email: state.accountEmail }] : []) : state.found)),
      transaction: async (callback: (tx: unknown) => unknown) => callback({
        execute: async () => { state.locks++; return { rows: [] }; },
        delete: (table: unknown) => ({ where: () => ({ returning: async () => { state.deleteCalls++; expect(table).toBe(schema.refundRequestReviews); const rows = state.deletedReviews; state.deletedReviews = []; return rows; } }) }),
        update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { state.updates.push(values); } }) }),
        insert: () => ({ values: async (values: Record<string, unknown>) => { state.audits.push(values); } }),
      }),
    },
  };
});

import { POST } from "../app/api/refund/[id]/resubmit/route";
import { mergeRefundDocuments } from "@/lib/advice/refund-resubmit";

const ID = "71111111-1111-4111-8111-111111111111";
const doc = (type: string, name: string) => ({ type, fileName: name, blobPathname: `pending-uploads/${name}`, blobUrl: `https://x.private.blob.vercel-storage.com/pending-uploads/${name}`, sizeBytes: 1000 });
const REFUND = {
  id: ID, serialNo: "REF/MCCIA/2026-27/0007", financialYear: "2026-27", requestDate: "2026-11-17", submittedByName: "Sandhya Acharya", submittedByEmail: "sandhyaa@mcciapune.com",
  submittedByDepartment: "CBP", branch: "SB Road Office", recommendingAuthority: "Aniruddha Brahma", payeeName: "Deccan", payeeAddress: null, payeeContactPerson: null,
  payeeContactPhone: null, payeeEmail: null, payeeGstin: null, payeeUdyamNumber: null, basicAmount: "4000.00", gstAmount: "720.00", totalAmount: "4720.00",
  natureOfExpenditure: "Fee refund", fromDate: "2026-11-10", bankName: null, beneficiaryName: null, bankAccountNo: null, bankIfsc: null, enclosures: null, specialRemarks: null,
  documents: [doc("EMAIL_COPY", "old-email.pdf"), doc("OTHER", "other-1.pdf")], createdAt: new Date("2026-11-17T05:00:00Z"),
};
const SENT_BACK = { refundRequestId: ID, decision: "SENT_BACK", decidedByName: "Aniruddha Brahma", decidedAt: new Date(), remarks: "Amount does not match" };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ payeeName: "Deccan Mechanical", basicAmount: "4500", gstAmount: "810", natureOfExpenditure: "Fee refund", fromDate: "2026-11-10", keepDocuments: "[0,1]", documents: "[]", ...fields })) data.set(key, value);
  return data;
}
const call = (fields: Record<string, string> = {}, id = ID) => POST(new NextRequest(`http://localhost/api/refund/${id}/resubmit`, { method: "POST", body: form(fields) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
  vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "true");
  state.session = { adminUserId: "u", fullName: "Sandhya", roles: ["DEPARTMENT"], recommendingAuthorityId: null };
  state.found = [{ refund: { ...REFUND }, review: SENT_BACK }];
  state.deletedReviews = [{ remarks: SENT_BACK.remarks, decidedByName: SENT_BACK.decidedByName }];
  state.deleteCalls = 0; state.updates = []; state.audits = []; state.locks = 0; state.notified = []; state.verified = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/refund/[id]/resubmit", () => {
  it("resubmits the SAME refund: clears the sent-back review (back to the same authority), keeps reference number, dates and submitter, audits it and emails the authority again", async () => {
    const response = await call({ payeeName: "Deccan Mechanical Works" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: ID, serialNo: "REF/MCCIA/2026-27/0007" });
    expect(state.locks).toBe(1);
    expect(state.deleteCalls).toBe(1);
    expect(state.updates).toHaveLength(1);
    const update = state.updates[0];
    for (const key of ["serialNo", "financialYear", "requestDate", "createdAt", "submittedByName", "submittedByEmail", "submittedByDepartment", "branch", "recommendingAuthority"]) expect(update).not.toHaveProperty(key);
    expect(update).toMatchObject({ payeeName: "Deccan Mechanical Works", basicAmount: "4500.00", gstAmount: "810.00", totalAmount: "5310.00" });
    expect(state.audits).toEqual([{ refundRequestId: ID, action: "REFUND_REQUEST_RESUBMITTED", actor: "Sandhya Acharya", ipAddress: null, details: { serialNo: REFUND.serialNo, sentBackBy: "Aniruddha Brahma", sentBackRemarks: "Amount does not match", changed: expect.arrayContaining(["payeeName", "basicAmount", "gstAmount", "totalAmount"]) } }]);
    expect(state.notified).toEqual([expect.objectContaining({ id: ID, serialNo: REFUND.serialNo, recommendingAuthority: "Aniruddha Brahma", requestDate: "2026-11-17" })]);
  });

  it("ignores any attempt to change who submitted it, the email or the recommending authority", async () => {
    await call({ submittedByEmail: "other@mcciapune.com", recommendingAuthority: "Someone Else", submittedByName: "X", branch: "Bhosari Office" });
    expect(state.updates[0]).not.toHaveProperty("submittedByEmail");
    expect(state.updates[0]).not.toHaveProperty("recommendingAuthority");
    expect(state.notified[0]).toMatchObject({ recommendingAuthority: "Aniruddha Brahma", submittedByEmail: "sandhyaa@mcciapune.com" });
  });

  it("a second click (the review is already cleared) is a 409 and writes nothing more", async () => {
    expect((await call()).status).toBe(200);
    const second = await call();
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("This third party refund request is not waiting for your corrections.");
    expect(state.updates).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
    expect(state.notified).toHaveLength(1);
  });

  it.each([
    ["waiting for the authority", null],
    ["recommended", { ...SENT_BACK, decision: "RECOMMENDED", remarks: null }],
    ["rejected (final)", { ...SENT_BACK, decision: "REJECTED", remarks: "No" }],
  ])("a refund that is %s cannot be resubmitted (409), nothing written", async (_label, review) => {
    state.found = [{ refund: { ...REFUND }, review }];
    expect((await call()).status).toBe(409);
    expect(state.deleteCalls).toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it("someone else's refund, or nobody signed in, is a 404; so is everything while the flag is off", async () => {
    state.found = [];
    expect((await call()).status).toBe(404);
    state.found = [{ refund: { ...REFUND }, review: SENT_BACK }];
    state.session = null;
    expect((await call()).status).toBe(404);
    state.session = { adminUserId: "u", fullName: "S", roles: ["SELF"], recommendingAuthorityId: null };
    vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "");
    expect((await call()).status).toBe(404);
    expect((await call({}, "not-a-uuid")).status).toBe(404);
    expect(state.updates).toHaveLength(0);
  });

  it("validates the corrected request like a new one (400), against its original request date", async () => {
    expect((await call({ payeeName: "" })).status).toBe(400);
    expect((await call({ basicAmount: "0", gstAmount: "0" })).status).toBe(400);
    expect((await call({ fromDate: "2026-11-20" })).status).toBe(400); // after the request date 2026-11-17
    expect(state.updates).toHaveLength(0);
  });

  it("documents: stored ones come from the database; a new Email copy replaces the old one, unticked ones are dropped, new Other documents are added and verified", async () => {
    const added = [doc("EMAIL_COPY", "new-email.pdf"), doc("OTHER", "other-2.pdf")];
    await call({ keepDocuments: "[0]", documents: JSON.stringify(added) });
    expect(state.updates[0].documents).toEqual([doc("EMAIL_COPY", "new-email.pdf"), doc("OTHER", "other-2.pdf")]);
    expect(state.verified).toEqual(added);
  });
});

describe("mergeRefundDocuments", () => {
  it("keeps ticked stored documents, replaces single types, adds Other documents", () => {
    const stored = [doc("EMAIL_COPY", "a.pdf"), doc("CANCELLED_CHEQUE", "b.pdf"), doc("OTHER", "c.pdf")] as never[];
    expect(mergeRefundDocuments(stored, [0, 1, 2], [])).toEqual(stored);
    expect(mergeRefundDocuments(stored, [0, 2], [])).toEqual([stored[0], stored[2]]);
    expect(mergeRefundDocuments(stored, [0, 1, 2], [doc("CANCELLED_CHEQUE", "d.pdf"), doc("OTHER", "e.pdf")] as never[])).toEqual([stored[0], stored[2], doc("CANCELLED_CHEQUE", "d.pdf"), doc("OTHER", "e.pdf")]);
  });
});
