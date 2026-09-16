import { and, eq, sql } from "drizzle-orm";
import { captureVendorBankAccount } from "@/lib/advice/vendor-bank-accounts";
import { db } from "@/lib/db";
import { auditLog, paymentAdvices, vendors } from "@/lib/db/schema";
import type { VendorReviewAction } from "@/lib/validation/vendor-review";

type ReviewResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      vendorId: string;
      companyName: string;
      payeeAddress: string;
      vendorCreated: boolean;
    };

type LockedAdvice = {
  id: string;
  payment_mode: string;
  is_advance: boolean;
  vendor_id: string | null;
  payee_name: string;
  payee_address: string;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  beneficiary_name: string | null;
  submitted_at: Date | string;
};

function trimmedOrNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function performVendorReviewAction(input: {
  adviceId: string;
  action: VendorReviewAction;
  actor: string;
  ipAddress: string | null;
}): Promise<ReviewResult> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute<LockedAdvice>(sql`
      select
        id,
        payment_mode,
        is_advance,
        vendor_id,
        payee_name,
        payee_address,
        bank_account_no,
        bank_ifsc,
        beneficiary_name,
        submitted_at
      from payment_advices
      where id = ${input.adviceId}
      for update
    `);
    const advice = locked.rows[0];
    if (!advice) return { ok: false, status: 404, error: "Submission not found." };
    if (advice.payment_mode !== "NEFT" || advice.is_advance) {
      return {
        ok: false,
        status: 409,
        error: "Only regular Payment Advice submissions can be reviewed here.",
      };
    }
    if (advice.vendor_id) {
      return {
        ok: false,
        status: 409,
        error: "This submission is already linked to a vendor.",
      };
    }

    let vendor: { id: string; companyName: string; address: string | null };
    let vendorCreated = false;

    if (input.action.action === "link") {
      const [existing] = await tx
        .select({
          id: vendors.id,
          companyName: vendors.companyName,
          address: vendors.address,
        })
        .from(vendors)
        .where(and(eq(vendors.id, input.action.vendorId), eq(vendors.isActive, true)))
        .limit(1);
      if (!existing) {
        return { ok: false, status: 404, error: "Active vendor not found." };
      }
      vendor = existing;
    } else {
      // Prevent two Finance users resolving the same spelling at the same
      // moment from creating duplicate canonical vendors. Vendors predate
      // this workflow and have no unique company-name constraint, so this
      // transaction-scoped advisory lock closes that race without changing
      // the wider vendor schema.
      await tx.execute(sql`
        select pg_advisory_xact_lock(hashtext(lower(trim(${input.action.companyName}))))
      `);
      const [sameName] = await tx
        .select({ id: vendors.id })
        .from(vendors)
        .where(sql`lower(trim(${vendors.companyName})) = lower(trim(${input.action.companyName}))`)
        .limit(1);
      if (sameName) {
        return {
          ok: false,
          status: 409,
          error: "A vendor with this name already exists. Link to the existing vendor instead.",
        };
      }

      const canonicalAddress = input.action.address ?? advice.payee_address;
      const [created] = await tx
        .insert(vendors)
        .values({
          companyName: input.action.companyName,
          address: canonicalAddress,
          isMsme: false,
          isActive: true,
        })
        .returning({
          id: vendors.id,
          companyName: vendors.companyName,
          address: vendors.address,
        });
      vendor = created;
      vendorCreated = true;
    }

    const canonicalAddress = trimmedOrNull(vendor.address) ?? advice.payee_address;
    await tx
      .update(paymentAdvices)
      .set({
        vendorId: vendor.id,
        payeeName: vendor.companyName,
        payeeAddress: canonicalAddress,
      })
      .where(eq(paymentAdvices.id, advice.id));

    const bankAccountNo = trimmedOrNull(advice.bank_account_no);
    const bankIfsc = trimmedOrNull(advice.bank_ifsc);
    const beneficiaryName = trimmedOrNull(advice.beneficiary_name);
    if (bankAccountNo && bankIfsc && beneficiaryName) {
      const submittedAt = advice.submitted_at instanceof Date
        ? advice.submitted_at
        : new Date(advice.submitted_at);
      await captureVendorBankAccount(tx, {
        vendorId: vendor.id,
        bankAccountNo,
        bankIfsc,
        beneficiaryName,
        sourceAdviceId: advice.id,
        usedAt: submittedAt,
      });
    }

    await tx.insert(auditLog).values({
      paymentAdviceId: advice.id,
      action: vendorCreated ? "VENDOR_CREATED_AND_LINKED" : "VENDOR_LINKED",
      actor: input.actor,
      ipAddress: input.ipAddress,
      details: {
        oldPayeeName: advice.payee_name,
        newPayeeName: vendor.companyName,
        oldPayeeAddress: advice.payee_address,
        newPayeeAddress: canonicalAddress,
        vendorId: vendor.id,
        vendorCreated,
        correctionPolicy: "approved-canonical-vendor-snapshot-exception",
      },
    });

    return {
      ok: true,
      vendorId: vendor.id,
      companyName: vendor.companyName,
      payeeAddress: canonicalAddress,
      vendorCreated,
    };
  });
}
