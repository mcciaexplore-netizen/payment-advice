import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Each db.select() call resolves the next queued result, in call order:
 * [advice], [account], roleRows, then [attachment]. */
const mocks = vi.hoisted(() => {
  const queue: unknown[][] = [];
  const chain = () => {
    const result = queue.shift() ?? [];
    const node: Record<string, unknown> = {};
    for (const method of ["from", "where", "limit", "orderBy"]) node[method] = () => node;
    node.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return node;
  };
  return { queue, select: vi.fn(chain), getAdminSession: vi.fn(), blobGet: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@vercel/blob", () => ({ get: mocks.blobGet }));

import { GET } from "../../app/api/advice/[id]/attachments/[attachmentId]/route";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT_ID = "22222222-2222-4222-8222-222222222222";
const ADVICE = { id: ADVICE_ID, submittedByEmail: "owner@mcciapune.com", recommendingAuthorityId: "auth-1", branch: "SB Road Office", submittedByDepartment: "Library" };
const ATTACHMENT = { fileName: "Facture é.pdf", blobPathname: "attachments/x.pdf" };

function session(adminUserId: string, roles: string[], extra: Record<string, unknown> = {}) {
  return { adminUserId, fullName: "Someone", roles, recommendingAuthorityId: null, ...extra };
}

function call(query = "", ids = { id: ADVICE_ID, attachmentId: ATTACHMENT_ID }) {
  return GET(new NextRequest(`http://localhost/api/advice/${ids.id}/attachments/${ids.attachmentId}${query}`), { params: Promise.resolve(ids) });
}

function queue(email: string | null, roleRows: unknown[], { advice = ADVICE, attachment = ATTACHMENT }: { advice?: unknown; attachment?: unknown } = {}) {
  mocks.queue.length = 0;
  mocks.queue.push(advice ? [advice] : [], email ? [{ email }] : [], roleRows, attachment ? [attachment] : []);
}

describe("GET /api/advice/[id]/attachments/[attachmentId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blobGet.mockResolvedValue({ statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("%PDF-1.4")); controller.close(); } }) });
  });

  it("the submitter views their own attachment inline, with nosniff and the original filename", async () => {
    mocks.getAdminSession.mockResolvedValue(session("owner", ["SELF"]));
    queue("owner@mcciapune.com", [{ role: "SELF", recommendingAuthorityId: null, scopeValue: null }]);
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe(`inline; filename="Facture _.pdf"; filename*=UTF-8''${encodeURIComponent("Facture é.pdf")}`);
    expect(await response.text()).toBe("%PDF-1.4");
    expect(mocks.blobGet).toHaveBeenCalledWith("attachments/x.pdf", { access: "private" });
  });

  it("?download=1 sends Content-Disposition: attachment", async () => {
    mocks.getAdminSession.mockResolvedValue(session("owner", ["SELF"]));
    queue("owner@mcciapune.com", []);
    const response = await call("?download=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="/);
  });

  it.each([
    ["the routed authority", ["AUTHORITY"], [{ role: "AUTHORITY", recommendingAuthorityId: "auth-1", scopeValue: null }]],
    ["a BRANCH member of that branch (case-insensitive)", ["BRANCH"], [{ role: "BRANCH", recommendingAuthorityId: null, scopeValue: "sb road office" }]],
    ["a DEPARTMENT member of that department", ["DEPARTMENT"], [{ role: "DEPARTMENT", recommendingAuthorityId: null, scopeValue: "Library" }]],
    ["Finance", ["ALL"], []],
  ])("%s can open it", async (_label, roles, roleRows) => {
    mocks.getAdminSession.mockResolvedValue(session("viewer", roles));
    queue("viewer@mcciapune.com", roleRows);
    expect((await call()).status).toBe(200);
  });

  it.each([
    ["a different authority", ["AUTHORITY"], [{ role: "AUTHORITY", recommendingAuthorityId: "auth-2", scopeValue: null }]],
    ["a BRANCH member of another branch", ["BRANCH"], [{ role: "BRANCH", recommendingAuthorityId: null, scopeValue: "Tilak Road Office" }]],
    ["a DEPARTMENT member of another department", ["DEPARTMENT"], [{ role: "DEPARTMENT", recommendingAuthorityId: null, scopeValue: "Marketing" }]],
    ["a SELF user who is not the submitter", ["SELF"], [{ role: "SELF", recommendingAuthorityId: null, scopeValue: null }]],
    ["a CASH_RECEIPT user of the same branch", ["CASH_RECEIPT"], [{ role: "CASH_RECEIPT", recommendingAuthorityId: null, scopeValue: "SB Road Office" }]],
    ["a session whose BRANCH role was revoked in the DB", ["BRANCH"], []],
  ])("%s gets 404 and the blob is never fetched", async (_label, roles, roleRows) => {
    mocks.getAdminSession.mockResolvedValue(session("stranger", roles));
    queue("stranger@mcciapune.com", roleRows);
    const response = await call();
    expect(response.status).toBe(404);
    expect(mocks.blobGet).not.toHaveBeenCalled();
  });

  it("unauthenticated gets 401 without touching the DB", async () => {
    mocks.getAdminSession.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("an attachment id that belongs to a different submission is 404 (guessed id pair)", async () => {
    mocks.getAdminSession.mockResolvedValue(session("owner", ["SELF"]));
    queue("owner@mcciapune.com", [], { attachment: null });
    expect((await call()).status).toBe(404);
    expect(mocks.blobGet).not.toHaveBeenCalled();
  });

  it("a submission with no attachments, or an unknown submission, is 404", async () => {
    mocks.getAdminSession.mockResolvedValue(session("owner", ["SELF"]));
    queue("owner@mcciapune.com", [], { attachment: null });
    expect((await call()).status).toBe(404);
    queue("owner@mcciapune.com", [], { advice: null });
    expect((await call()).status).toBe(404);
  });

  it("each of several attachments on one submission is served by its own id", async () => {
    mocks.getAdminSession.mockResolvedValue(session("owner", ["SELF"]));
    queue("owner@mcciapune.com", [], { attachment: { fileName: "bill-1.png", blobPathname: "a/1.png" } });
    const first = await call();
    expect(first.headers.get("content-type")).toBe("image/png");
    queue("owner@mcciapune.com", [], { attachment: { fileName: "bill-2.jpg", blobPathname: "a/2.jpg" } });
    const second = await call("?download=1", { id: ADVICE_ID, attachmentId: "33333333-3333-4333-8333-333333333333" });
    expect(second.headers.get("content-type")).toBe("image/jpeg");
    expect(second.headers.get("content-disposition")).toContain('attachment; filename="bill-2.jpg"');
    expect(mocks.blobGet).toHaveBeenNthCalledWith(1, "a/1.png", { access: "private" });
    expect(mocks.blobGet).toHaveBeenNthCalledWith(2, "a/2.jpg", { access: "private" });
  });

  it("malformed ids are 404 before any lookup", async () => {
    mocks.getAdminSession.mockResolvedValue(session("owner", ["SELF"]));
    expect((await call("", { id: "1 or 1=1", attachmentId: ATTACHMENT_ID })).status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
