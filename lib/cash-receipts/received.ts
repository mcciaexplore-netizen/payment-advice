import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { adminUsers, auditLog, cashReceipts } from "@/lib/db/schema";
import { hasRole, type AdminSessionPayload } from "@/lib/auth";
import { formatIstDateTime } from "@/lib/date-time";
import { notifyCashReceiptReceived, type SendOutcome } from "@/lib/email/notify";

/** Marking cash as received: Finance roles ALL and CASH_VOUCHER only (Abha
 * Khatavkar holds CASH_VOUCHER). PAYMENT_ADVICE Finance users can see the
 * list but not mark. No role or login rule changes. */
export function canMarkCashReceiptReceived(session: Pick<AdminSessionPayload, "roles"> | null | undefined): boolean {
  return hasRole(session, "ALL") || hasRole(session, "CASH_VOUCHER");
}

/** Undoing a marking: ALL only, always with a reason, always audited. */
export function canUndoCashReceiptReceived(session: Pick<AdminSessionPayload, "roles"> | null | undefined): boolean {
  return hasRole(session, "ALL");
}

const uuid = z.string().uuid();

/** Only ids and an optional note are read from the request. Any receivedAt /
 * receivedBy the browser sends is stripped: time is server time, the user
 * is the session. */
export const markReceivedSchema = z.object({
  ids: z.array(uuid).min(1, "Select at least one Cash Receipt.").max(100, "Mark at most 100 receipts at a time."),
  note: z.string().trim().max(200, "Keep the note under 200 characters.").optional().default(""),
});

export const undoReceivedSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason for undoing (at least 3 characters).").max(300, "Keep the reason under 300 characters."),
});

const RETURNED = {
  id: cashReceipts.id,
  serialNo: cashReceipts.serialNo,
  partyName: cashReceipts.partyName,
  total: cashReceipts.total,
  receiptDate: cashReceipts.receiptDate,
  submittedByName: cashReceipts.submittedByName,
  submittedByEmail: cashReceipts.submittedByEmail,
  issuedByUserId: cashReceipts.issuedByUserId,
  receivedAt: cashReceipts.receivedAt,
  receivedBy: cashReceipts.receivedBy,
  receivedNote: cashReceipts.receivedNote,
};
type ReceivedRow = { id: string; serialNo: string; partyName: string; total: string; receiptDate: string; submittedByName: string; submittedByEmail: string | null; issuedByUserId: string; receivedAt: Date | null; receivedBy: string | null; receivedNote: string | null };

/** The issuer's address: the email saved on the receipt, else their current
 * admin_users email. */
async function issuerEmail(row: ReceivedRow): Promise<string | null> {
  if (row.submittedByEmail) return row.submittedByEmail;
  const [user] = await db.select({ email: adminUsers.email }).from(adminUsers).where(eq(adminUsers.id, row.issuedByUserId)).limit(1);
  return user?.email ?? null;
}

/** Sends the "Cash received" email for one marked receipt and records
 * received_email_sent_at only when the provider really accepted it. */
async function sendReceivedEmail(row: ReceivedRow): Promise<SendOutcome | "no-address"> {
  const to = await issuerEmail(row);
  if (!to) return "no-address";
  const outcome = await notifyCashReceiptReceived({
    serialNo: row.serialNo,
    issuerName: row.submittedByName,
    partyName: row.partyName,
    amount: Number(row.total).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    receiptDate: row.receiptDate,
    receivedOn: formatIstDateTime(row.receivedAt!),
    receivedBy: row.receivedBy!,
    note: row.receivedNote,
  }, to, row.id);
  return outcome;
}

export type MarkResult = {
  marked: Array<{ id: string; serialNo: string; email: SendOutcome | "no-address" }>;
  alreadyReceived: string[];
};

/** Marks the given receipts as received in one transaction. The UPDATE only
 * touches rows still pending (received_at IS NULL), so a second click, a
 * second tab or a concurrent request marks nothing and sends nothing: one
 * marking and one email per receipt. Emails go out after commit; a failed
 * email never undoes the marking. */
export async function markCashReceiptsReceived(input: { ids: string[]; note: string; actor: string; ip: string | null; now?: Date }): Promise<MarkResult> {
  const now = input.now ?? new Date();
  const ids = [...new Set(input.ids)];
  const updated: ReceivedRow[] = await db.transaction(async (tx) => {
    const rows = await tx.update(cashReceipts)
      .set({ receivedAt: now, receivedBy: input.actor, receivedNote: input.note || null })
      .where(and(inArray(cashReceipts.id, ids), isNull(cashReceipts.receivedAt)))
      .returning(RETURNED);
    for (const row of rows) {
      await tx.insert(auditLog).values({
        cashReceiptId: row.id,
        action: "CASH_RECEIPT_RECEIVED",
        actor: input.actor,
        ipAddress: input.ip,
        details: { serialNo: row.serialNo, total: row.total, note: input.note || null, batchSize: rows.length },
      });
    }
    return rows;
  });

  const marked: MarkResult["marked"] = [];
  for (const row of updated) {
    const email = await sendReceivedEmail(row);
    if (email === "sent") {
      await db.update(cashReceipts).set({ receivedEmailSentAt: new Date() })
        .where(and(eq(cashReceipts.id, row.id), isNull(cashReceipts.receivedEmailSentAt)));
    }
    marked.push({ id: row.id, serialNo: row.serialNo, email });
  }
  const markedIds = new Set(updated.map((row) => row.id));
  const alreadyReceived = ids.length === updated.length ? [] : (await db.select({ id: cashReceipts.id, serialNo: cashReceipts.serialNo, receivedAt: cashReceipts.receivedAt })
    .from(cashReceipts).where(inArray(cashReceipts.id, ids.filter((id) => !markedIds.has(id)))))
    .filter((row) => row.receivedAt).map((row) => row.serialNo);
  return { marked, alreadyReceived };
}

/** Resends the "Cash received" email for a received receipt whose email did
 * not go out. Claims the send first (received_email_sent_at set only if it
 * is still null) so two clicks cannot send twice; releases the claim if the
 * send fails. */
export async function resendCashReceiptReceivedEmail(id: string): Promise<{ status: "sent" | "failed" | "preview" | "no-address" | "not-eligible"; serialNo?: string }> {
  const [claimed] = await db.update(cashReceipts).set({ receivedEmailSentAt: new Date() })
    .where(and(eq(cashReceipts.id, id), isNotNull(cashReceipts.receivedAt), isNull(cashReceipts.receivedEmailSentAt)))
    .returning(RETURNED);
  if (!claimed) return { status: "not-eligible" };
  const outcome = await sendReceivedEmail(claimed);
  if (outcome !== "sent") {
    await db.update(cashReceipts).set({ receivedEmailSentAt: null }).where(eq(cashReceipts.id, id));
  }
  return { status: outcome, serialNo: claimed.serialNo };
}

/** Undoes a marking (ALL only, checked by the route). Clears the received
 * fields only if the receipt is still received, and writes
 * CASH_RECEIPT_RECEIVED_UNDONE with the reason and what was undone. */
export async function undoCashReceiptReceived(input: { id: string; reason: string; actor: string; ip: string | null }): Promise<{ status: "undone" | "not-received"; serialNo?: string }> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select(RETURNED).from(cashReceipts).where(eq(cashReceipts.id, input.id)).limit(1).for("update");
    if (!before?.receivedAt) return { status: "not-received" as const };
    await tx.update(cashReceipts)
      .set({ receivedAt: null, receivedBy: null, receivedNote: null, receivedEmailSentAt: null })
      .where(eq(cashReceipts.id, input.id));
    await tx.insert(auditLog).values({
      cashReceiptId: input.id,
      action: "CASH_RECEIPT_RECEIVED_UNDONE",
      actor: input.actor,
      ipAddress: input.ip,
      details: { serialNo: before.serialNo, reason: input.reason, previousReceivedAt: before.receivedAt.toISOString(), previousReceivedBy: before.receivedBy, previousNote: before.receivedNote },
    });
    return { status: "undone" as const, serialNo: before.serialNo };
  });
}
