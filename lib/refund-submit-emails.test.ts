import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** When a refund is saved: the recommending authority is emailed (a link to
 * the review page) and the submitter is sent a confirmation, but only with the
 * recommendation process on, and a failed email never fails the submission. */
const state = vi.hoisted(() => ({
  authority: [] as unknown[],
  selectWhere: undefined as unknown,
  authorityEmails: [] as Array<{ data: Record<string, unknown>; to: string | null; id: string }>,
  submitterEmails: [] as Array<{ data: Record<string, unknown>; to: string; id: string }>,
  emailError: null as Error | null,
}));

vi.mock("@/lib/email/notify", () => ({
  notifyRefundAuthority: async (data: Record<string, unknown>, to: string | null, id: string) => { if (state.emailError) throw state.emailError; state.authorityEmails.push({ data, to, id }); },
  notifyRefundSubmitted: async (data: Record<string, unknown>, to: string, id: string) => { state.submitterEmails.push({ data, to, id }); },
  notifyRefundRecommended: async () => undefined,
  notifyRefundSentBack: async () => undefined,
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const node: Record<string, unknown> = {};
      node.from = () => node;
      node.where = (where: unknown) => { state.selectWhere = where; return node; };
      node.limit = () => Promise.resolve(state.authority);
      return node;
    },
    transaction: async (callback: (tx: unknown) => unknown) => callback({
      execute: async () => ({ rows: [{ last_number: 7 }] }),
      insert: () => ({ values: (values: Record<string, unknown>) => ({ returning: async () => [{ id: "99999999-9999-4999-8999-999999999999", serialNo: values.serialNo }], then: (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve) }) }),
    }),
  },
}));
vi.mock("@/lib/attachments/verify-uploaded", () => ({ verifyUploadedAttachments: async () => null }));
vi.mock("@/lib/date-time", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/date-time")>()), todayInIst: () => "2026-11-24" }));

import { POST } from "@/app/api/refund/submit/route";
import { notifyRefundSubmission } from "@/lib/advice/refund-review";

const INPUT = {
  id: "99999999-9999-4999-8999-999999999999", serialNo: "REF/MCCIA/2026-27/0008", requestDate: "2026-11-24", submittedByName: "Sandhya Acharya",
  submittedByEmail: "sandhyaa@mcciapune.com", payeeName: "Deccan", natureOfExpenditure: "Refund of fee", totalAmount: "4720.00",
  recommendingAuthority: "aniruddha  brahma", origin: "https://payment-advice.vercel.app",
};

beforeEach(() => { state.authority = [{ name: "ANIRUDDHA BRAHMA", email: "aniruddhab@mcciapune.com" }]; state.authorityEmails = []; state.submitterEmails = []; state.emailError = null; });
afterEach(() => vi.unstubAllEnvs());

describe("notifyRefundSubmission", () => {
  it("emails the authority a link to the review page, and the submitter a confirmation naming the authority", async () => {
    await notifyRefundSubmission(INPUT);
    expect(state.authorityEmails).toHaveLength(1);
    expect(state.authorityEmails[0].to).toBe("aniruddhab@mcciapune.com");
    expect(state.authorityEmails[0].data).toMatchObject({ authorityName: "ANIRUDDHA BRAHMA", displayNo: "REF/MCCIA/2026-27/0008", amount: "4,720.00", reviewLink: "https://payment-advice.vercel.app/authority/refund/99999999-9999-4999-8999-999999999999" });
    expect(state.submitterEmails[0].to).toBe("sandhyaa@mcciapune.com");
    expect(state.submitterEmails[0].data).toMatchObject({ authorityName: "ANIRUDDHA BRAHMA", myRefundsLink: "https://payment-advice.vercel.app/authority?view=my-refunds" });
  });

  it("finds the authority by the typed name, ignoring case and extra spaces", async () => {
    await notifyRefundSubmission(INPUT);
    const where = new PgDialect().sqlToQuery(state.selectWhere as SQL);
    expect(where.sql).toContain("regexp_replace(btrim(");
    expect(where.params).toEqual(["aniruddha  brahma"]);
  });

  it("an authority with no email on file still gets the submitter confirmation (and the gap is logged, not thrown)", async () => {
    state.authority = [{ name: "ANIRUDDHA BRAHMA", email: null }];
    await notifyRefundSubmission(INPUT);
    expect(state.authorityEmails[0].to).toBeNull();
    expect(state.submitterEmails).toHaveLength(1);
  });

  it("a typed name that matches no authority falls back to the typed name", async () => {
    state.authority = [];
    await notifyRefundSubmission({ ...INPUT, recommendingAuthority: "Nobody Known" });
    expect(state.authorityEmails[0]).toMatchObject({ to: null });
    expect(state.authorityEmails[0].data.authorityName).toBe("Nobody Known");
  });

  it("never throws, even when sending fails", async () => {
    state.emailError = new Error("smtp down");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(notifyRefundSubmission(INPUT)).resolves.toBeUndefined();
  });
});

describe("POST /api/refund/submit sends those emails only with the recommendation process on", () => {
  const body = () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      submittedByName: "Sandhya Acharya", submittedByEmail: "sandhyaa@mcciapune.com", submittedByDepartment: "ADMIN", branch: "Tilak Road Office",
      recommendingAuthority: "ANIRUDDHA BRAHMA", payeeName: "Deccan", basicAmount: "4000.00", gstAmount: "720.00",
      natureOfExpenditure: "Refund of fee", fromDate: "2026-11-01", documents: "[]",
    })) form.set(key, value);
    return form;
  };
  const submit = () => POST(new NextRequest("https://payment-advice.vercel.app/api/refund/submit", { method: "POST", body: body(), headers: { "x-forwarded-for": `10.2.0.${Math.floor(Math.random() * 250)}` } }));

  it("on: the refund is saved and the authority and the submitter are emailed", async () => {
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
    vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "true");
    const response = await submit();
    expect(response.status).toBe(200);
    expect(state.authorityEmails).toHaveLength(1);
    expect(state.authorityEmails[0].data.reviewLink).toBe("https://payment-advice.vercel.app/authority/refund/99999999-9999-4999-8999-999999999999");
    expect(state.submitterEmails).toHaveLength(1);
  });

  it("off: the refund is saved exactly as before and no email is sent", async () => {
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
    vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "");
    expect((await submit()).status).toBe(200);
    expect(state.authorityEmails).toHaveLength(0);
    expect(state.submitterEmails).toHaveLength(0);
  });
});
