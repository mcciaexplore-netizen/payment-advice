import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices } from "@/lib/db/schema";

/**
 * "In progress" = status still SUBMITTED (covers every pre-final pipeline
 * stage: waiting on authority, awaiting finance, received/in process,
 * verified-awaiting-sanction). SENT_BACK and APPROVED (which, since
 * sanctioning is the only path that sets it, always means sanctioned) are
 * both closed-out for this purpose, per the human's own framing: "not yet
 * Sanctioned, rejected/closed out."
 */
const IN_PROGRESS_STATUS = "SUBMITTED";

/** Recommending authorities are a live FK on payment_advices — reliable. */
export async function countInProgressForAuthority(authorityId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(paymentAdvices)
    .where(
      and(
        eq(paymentAdvices.recommendingAuthorityId, authorityId),
        eq(paymentAdvices.status, IN_PROGRESS_STATUS),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Staff members are NOT referenced by any FK on payment_advices —
 * `submitted_by_name` is a plain snapshotted string copied at submission
 * time (see AGENT_HANDOFF.md §4 audit). This is therefore a best-effort
 * case-insensitive, whitespace-trimmed name match, not a reliable
 * reference check — it can miss a submission where the typed name differs
 * from the canonical staff record (typo, nickname), and there is no way to
 * make it exact without adding a staff_member_id FK to payment_advices
 * (a bigger, unrequested schema change — flagged to the human, not built).
 */
export async function countInProgressForStaffName(fullName: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(paymentAdvices)
    .where(
      and(
        eq(paymentAdvices.status, IN_PROGRESS_STATUS),
        sql`lower(trim(${paymentAdvices.submittedByName})) = lower(trim(${fullName}))`,
      ),
    );
  return row?.count ?? 0;
}
