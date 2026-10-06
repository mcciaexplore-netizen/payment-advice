const BRANCH_CODES: Record<string, string> = {
  "SB Road Office": "SBR",
  "Tilak Road Office": "TRB",
  "Bhosari Office": "BHO",
  "Hadapsar Office": "HDP",
  "Ahilyanagar Office": "AHN",
};

export function getCashReceiptFinancialYear(date: string) {
  const [calendarYear, month] = date.slice(0, 10).split("-").map(Number);
  const startYear = month < 4 ? calendarYear - 1 : calendarYear;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function formatCashReceiptNumber(branch: string, date: string, sequence: number) {
  const code = BRANCH_CODES[branch];
  if (!code) throw new Error(`No Cash Receipt code is configured for branch: ${branch}`);
  return `CR/${code}/${getCashReceiptFinancialYear(date)}/${String(sequence).padStart(4, "0")}`;
}
