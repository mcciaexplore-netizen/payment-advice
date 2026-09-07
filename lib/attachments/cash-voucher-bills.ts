import type { UploadedAttachment } from "@/lib/attachments/client-upload";
import type { CashVoucherItem } from "@/lib/validation/payment-advice";

export function validateCashVoucherBillUploads(
  items: CashVoucherItem[],
  uploads: UploadedAttachment[],
  existingItemIds: ReadonlySet<string> = new Set(),
): string | null {
  const itemKeys = new Set(items.map((item) => item.clientKey));
  const counts = new Map<string, number>();

  for (const upload of uploads) {
    if (upload.docType !== "CASH_VOUCHER_BILL") continue;
    const key = upload.cashVoucherItemKey!;
    if (!itemKeys.has(key)) return "A Cash Voucher bill is linked to an unknown expense row.";
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (counts.get(key)! > 1) return "Only one bill may be attached to each Cash Voucher expense.";
  }

  for (const item of items) {
    if ((counts.get(item.clientKey) ?? 0) === 0 && (!item.id || !existingItemIds.has(item.id))) {
      return "Attach one Bill/Supplementary Document for every Cash Voucher expense.";
    }
  }
  return null;
}
