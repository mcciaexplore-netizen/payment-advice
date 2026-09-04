/** FormData.get() returns null for an absent key, but the Zod schemas here
 * expect `string | undefined` — the public form's own client omits blank
 * optional fields from the FormData it sends entirely, so this conversion
 * is hit on every real submission, not just malformed ones. */
export function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export function parsePaymentAdviceFormData(formData: FormData) {
  const rawAmount = str(formData, "amount");
  const rawBasicAmount = str(formData, "basicAmount");
  const rawGstAmount = str(formData, "gstAmount");
  const rawCashVoucherItems = str(formData, "cashVoucherItems");
  let cashVoucherItems: unknown = [];
  if (rawCashVoucherItems) {
    try {
      cashVoucherItems = JSON.parse(rawCashVoucherItems);
    } catch {
      cashVoucherItems = undefined;
    }
  }
  const rawIsAdvance = str(formData, "isAdvance");
  const rawPreviousPendingAdvanceAmount = str(formData, "previousPendingAdvanceAmount");
  const rawAdvanceParticulars = str(formData, "advanceParticulars");
  let advanceParticulars: unknown = [];
  if (rawAdvanceParticulars) {
    try {
      advanceParticulars = JSON.parse(rawAdvanceParticulars);
    } catch {
      advanceParticulars = undefined;
    }
  }
  return {
    submittedByName: str(formData, "submittedByName"),
    submittedByEmail: str(formData, "submittedByEmail"),
    submittedByDepartment: str(formData, "submittedByDepartment"),
    recommendingAuthorityId: str(formData, "recommendingAuthorityId"),
    vendorId: str(formData, "vendorId"),
    payeeName: str(formData, "payeeName"),
    payeeAddress: str(formData, "payeeAddress"),
    payeeContactPerson: str(formData, "payeeContactPerson"),
    payeeContactPhone: str(formData, "payeeContactPhone"),
    payeeEmail: str(formData, "payeeEmail"),
    payeeGstin: str(formData, "payeeGstin"),
    payeeUdyamNumber: str(formData, "payeeUdyamNumber"),
    billNo: str(formData, "billNo"),
    billDate: str(formData, "billDate"),
    poNumber: str(formData, "poNumber"),
    poDate: str(formData, "poDate"),
    deliveryChallanNo: str(formData, "deliveryChallanNo"),
    deliveryChallanDate: str(formData, "deliveryChallanDate"),
    amount: rawAmount ? Number(rawAmount) : undefined,
    basicAmount: rawBasicAmount ? Number(rawBasicAmount) : undefined,
    gstAmount: rawGstAmount ? Number(rawGstAmount) : undefined,
    natureOfExpenditure: str(formData, "natureOfExpenditure"),
    cashVoucherItems,
    isAdvance: rawIsAdvance === "true",
    purposeOfAdvance: str(formData, "purposeOfAdvance"),
    previousPendingAdvanceAmount: rawPreviousPendingAdvanceAmount
      ? Number(rawPreviousPendingAdvanceAmount)
      : undefined,
    previousPendingAdvanceSince: str(formData, "previousPendingAdvanceSince"),
    advanceParticulars,
    paymentMode: str(formData, "paymentMode"),
    bankAccountNo: str(formData, "bankAccountNo"),
    bankIfsc: str(formData, "bankIfsc"),
    beneficiaryName: str(formData, "beneficiaryName"),
    bankName: str(formData, "bankName"),
    enclosures: str(formData, "enclosures"),
    specialRemarks: str(formData, "specialRemarks"),
    formDate: str(formData, "formDate"),
  };
}
