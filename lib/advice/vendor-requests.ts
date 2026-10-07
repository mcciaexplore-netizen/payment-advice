import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, paymentAdvices, vendorRequests, vendors } from "@/lib/db/schema";
import { scoreVendorsByName, type VendorNameCandidate } from "@/lib/advice/vendor-name-matching";
import { captureVendorBankAccount } from "@/lib/advice/vendor-bank-accounts";

/** Powers the small badge on the Finance Admin nav's "Vendors" item - a
 * cheap count query, not the full row fetch the Vendor Addition Requests
 * tab itself does, since the nav needs this on every admin page load. */
export async function getPendingVendorRequestCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vendorRequests)
    .where(and(isNull(vendorRequests.approvedAt), isNull(vendorRequests.sentBackAt)));
  return row?.count ?? 0;
}

/** Lenient, warning-only duplicate check shown to Finance before they approve
 * a vendor request - deliberately a much lower bar than
 * findConfidentInvoiceVendor's strict >=95%+unique auto-select gate,
 * since a false positive here just means an extra glance at a name Finance
 * can immediately dismiss, not a wrongly-auto-selected vendor. Never blocks
 * approval; the caller decides what to do with the result. */
export function findPossibleDuplicateVendors<T extends VendorNameCandidate>(
  requestedName: string,
  activeVendors: T[],
  threshold = 0.8,
): { vendor: T; score: number }[] {
  return scoreVendorsByName(requestedName, activeVendors).filter((s) => s.score >= threshold);
}

export type MsmeStatus = "MICRO" | "SMALL" | "MEDIUM" | "NOT_REGISTERED" | "UNKNOWN";

function isMsmeFromStatus(status: MsmeStatus): boolean {
  return status === "MICRO" || status === "SMALL" || status === "MEDIUM";
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type ApproveResult =
  | { ok: false; status: number; error: string }
  | { ok: true; vendorId: string; companyName: string; address: string };

/**
 * Approve a vendor request: create the real vendor row from the (possibly
 * Finance-edited) name/address, link it, and backfill the waiting Payment
 * Advice - all in one transaction. Mirrors performVendorReviewAction's own
 * create-vendor shape (lib/advice/vendor-review.ts), including its hard
 * block on an exact-name duplicate (not just the lenient warning above,
 * which is advisory-only and surfaced separately before this is even
 * called). Exact-name blocking plus a separate fuzzy warning gives Finance
 * both a hard safety net and an informed choice, same split used
 * elsewhere in this app (e.g. bank-details-mismatch: system value always
 * wins, but a contradiction is still flagged for review).
 */
export async function approveVendorRequest(input: {
  requestId: string;
  editedName: string;
  editedAddress: string;
  editedGstin?: string | null;
  approvedBy: string;
  ipAddress: string | null;
}): Promise<ApproveResult> {
  return db.transaction(async (tx): Promise<ApproveResult> => {
    const [request] = await tx
      .select()
      .from(vendorRequests)
      .where(eq(vendorRequests.id, input.requestId))
      .limit(1);
    if (!request) return { ok: false, status: 404, error: "Vendor request not found." };
    if (request.approvedAt) return { ok: false, status: 409, error: "Already approved." };
    if (request.sentBackAt) {
      return { ok: false, status: 409, error: "This request was sent back - it must be resubmitted first." };
    }

    // A submitter can detach a vendor request from its PA on resubmit (see
    // app/api/edit/[token]/route.ts) by picking a real vendor instead -
    // refuse to approve a request that's no longer the PA's current
    // pending one, so this can't silently overwrite the vendor the PA now
    // actually uses.
    const [linkedAdvice] = await tx
      .select({
        pendingVendorRequestId: paymentAdvices.pendingVendorRequestId,
        paymentMode: paymentAdvices.paymentMode,
        isAdvance: paymentAdvices.isAdvance,
        bankAccountNo: paymentAdvices.bankAccountNo,
        bankIfsc: paymentAdvices.bankIfsc,
        beneficiaryName: paymentAdvices.beneficiaryName,
      })
      .from(paymentAdvices)
      .where(eq(paymentAdvices.id, request.paymentAdviceId))
      .limit(1);
    if (linkedAdvice?.pendingVendorRequestId !== request.id) {
      return {
        ok: false,
        status: 409,
        error: "This request is no longer linked to its Payment Advice - the submitter likely picked a different vendor on resubmission.",
      };
    }

    const companyName = input.editedName.trim();
    const address = input.editedAddress.trim();
    if (!companyName || !address) {
      return { ok: false, status: 400, error: "Vendor name and address are required." };
    }

    // Same per-spelling advisory lock pattern as the existing vendor-review
    // "create new" path, to close the same two-Finance-users-at-once race.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(lower(trim(${companyName}))))`);

    const [exactDuplicate] = await tx
      .select({ id: vendors.id })
      .from(vendors)
      .where(sql`lower(trim(${vendors.companyName})) = lower(trim(${companyName}))`)
      .limit(1);
    if (exactDuplicate) {
      return {
        ok: false,
        status: 409,
        error: "A vendor with this exact name already exists. Use the Historical Review tab on Vendor Addition Requests to link to it instead of approving a duplicate.",
      };
    }

    const msmeStatus = (request.msmeStatus as MsmeStatus | null) ?? "UNKNOWN";
    const [vendor] = await tx
      .insert(vendors)
      .values({
        companyName,
        address,
        gstin: trimmedOrNull(input.editedGstin ?? request.requestedGstin),
        // The vendor's own email is mandatory on a request (2026-10-01) -
        // carried onto the new vendor record itself, same as GSTIN above,
        // so Finance doesn't have to re-find/re-enter it later.
        email: trimmedOrNull(request.requestedVendorEmail),
        isMsme: isMsmeFromStatus(msmeStatus),
        isActive: true,
      })
      .returning({ id: vendors.id, companyName: vendors.companyName, address: vendors.address });

    const now = new Date();
    await tx
      .update(vendorRequests)
      .set({ approvedAt: now, approvedBy: input.approvedBy, approvedVendorId: vendor.id })
      .where(eq(vendorRequests.id, request.id));

    await tx
      .update(paymentAdvices)
      .set({
        vendorId: vendor.id,
        pendingVendorRequestId: null,
        payeeName: vendor.companyName,
        payeeAddress: vendor.address ?? address,
      })
      .where(eq(paymentAdvices.id, request.paymentAdviceId));

    // This vendor's very first payment never went through the normal
    // vendorId-at-submission-time path, so it also missed the automatic
    // bank-account capture every other NEFT submission gets (see
    // app/api/submit/route.ts) - do it now so the next payment to this
    // vendor can offer it back, same as any other vendor's repeat payment.
    if (
      linkedAdvice?.paymentMode === "NEFT" &&
      !linkedAdvice.isAdvance &&
      linkedAdvice.bankAccountNo &&
      linkedAdvice.bankIfsc &&
      linkedAdvice.beneficiaryName
    ) {
      await captureVendorBankAccount(tx, {
        vendorId: vendor.id,
        bankAccountNo: linkedAdvice.bankAccountNo,
        bankIfsc: linkedAdvice.bankIfsc,
        beneficiaryName: linkedAdvice.beneficiaryName,
        sourceAdviceId: request.paymentAdviceId,
        usedAt: now,
      });
    }

    await tx.insert(auditLog).values({
      paymentAdviceId: request.paymentAdviceId,
      vendorRequestId: request.id,
      action: "VENDOR_REQUEST_APPROVED",
      actor: input.approvedBy,
      ipAddress: input.ipAddress,
      details: {
        vendorId: vendor.id,
        companyName: vendor.companyName,
        requestedName: request.requestedName,
        edited: request.requestedName.trim() !== companyName,
      },
    });

    return { ok: true, vendorId: vendor.id, companyName: vendor.companyName, address: vendor.address ?? address };
  });
}
