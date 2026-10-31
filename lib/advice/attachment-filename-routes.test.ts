import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The admin attachment route, the emailed recommendation-link route and
 * the Authority dashboard attachment route used to put the raw file name in
 * Content-Disposition, so a name with a character above U+00FF (an en dash)
 * threw "Cannot convert argument to a ByteString" and the file never opened.
 * All three now use contentDisposition().
 * In the UI, View opens the URL and Download is the same URL with an
 * <a download> attribute, so both requests are checked. */
const mocks = vi.hoisted(() => {
  const queue: unknown[][] = [];
  const chain = () => {
    const result = queue.shift() ?? [];
    const node: Record<string, unknown> = {};
    for (const method of ["from", "where", "limit", "orderBy"]) node[method] = () => node;
    node.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return node;
  };
  return { queue, select: vi.fn(chain), blobGet: vi.fn(), getAdminSession: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@vercel/blob", () => ({ get: mocks.blobGet }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: mocks.getAdminSession }));

import { GET as adminGET } from "../../app/api/admin/attachments/[id]/route";
import { GET as approvalGET } from "../../app/api/authority-approval/[token]/attachments/[attachmentId]/route";
import { GET as authorityGET } from "../../app/api/authority/advice/[id]/attachments/[attachmentId]/route";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "approval-token";

const NAMES: Array<[string, string, string]> = [
  ["an en dash", "Tax Invoice – Sept.pdf", "Tax Invoice _ Sept.pdf"],
  ["accents", "Facture réglée Müller.pdf", "Facture r_gl_e M_ller.pdf"],
  ["quotes", 'Quote "final" copy.jpg', "Quote _final_ copy.jpg"],
  ["spaces", "Approval  Budget Letter 2026.png", "Approval  Budget Letter 2026.png"],
];

const ROUTES = [
  {
    label: "/api/admin/attachments/[id]",
    queue: (fileName: string) => [[{ id: ATTACHMENT_ID, fileName, blobPathname: "attachments/x" }]],
    call: () => adminGET(new NextRequest(`http://localhost/api/admin/attachments/${ATTACHMENT_ID}`), { params: Promise.resolve({ id: ATTACHMENT_ID }) }),
  },
  {
    label: "/api/authority-approval/[token]/attachments/[attachmentId]",
    queue: (fileName: string) => [[{ id: "advice-1" }], [{ id: ATTACHMENT_ID, fileName, blobPathname: "attachments/x", docType: "TAX_INVOICE" }]],
    call: () => approvalGET(new NextRequest(`http://localhost/api/authority-approval/${TOKEN}/attachments/${ATTACHMENT_ID}`), { params: Promise.resolve({ token: TOKEN, attachmentId: ATTACHMENT_ID }) }),
  },
  {
    label: "/api/authority/advice/[id]/attachments/[attachmentId]",
    queue: (fileName: string) => [[{ id: ADVICE_ID }], [{ id: ATTACHMENT_ID, fileName, blobPathname: "attachments/x" }]],
    call: () => authorityGET(new NextRequest(`http://localhost/api/authority/advice/${ADVICE_ID}/attachments/${ATTACHMENT_ID}`), { params: Promise.resolve({ id: ADVICE_ID, attachmentId: ATTACHMENT_ID }) }),
  },
];

describe.each(ROUTES)("$label file names", (route) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminSession.mockResolvedValue({ adminUserId: "u-auth", fullName: "Authority", roles: ["AUTHORITY"], recommendingAuthorityId: "auth-1" });
    mocks.blobGet.mockResolvedValue({ statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("file")); controller.close(); } }) });
  });

  it.each(NAMES.flatMap(([label, name, fallback]) => [["View", label, name, fallback], ["Download", label, name, fallback]]))(
    "%s with %s: safe ASCII fallback plus the UTF-8 filename*",
    async (_action, _label, name, fallback) => {
      mocks.queue.length = 0;
      mocks.queue.push(...route.queue(name));
      const response = await route.call();
      expect(response.status).toBe(200);
      const header = response.headers.get("content-disposition")!;
      expect(header).toBe(`inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`);
      expect(header).toMatch(/^[\x20-\x7e]+$/);
      expect(decodeURIComponent(header.split("filename*=UTF-8''")[1])).toBe(name);
      expect(await response.text()).toBe("file");
    },
  );
});
