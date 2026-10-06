import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { todayInIst } from "@/lib/date-time";
import { getCashReceiptFinancialYear } from "@/lib/cash-receipt-number";

export type LocalCashReceipt = {
  id: string;
  branch: string;
  receiptNumber: number;
  receiptDate: string;
  partyName: string;
  gstin: string | null;
  items: Array<{ particulars: string; copies: number; price: string; amount: string; billNo?: string; billDate?: string }>;
  total: string;
  issuedBy: string;
};

const storePath = path.join(process.cwd(), ".local-cash-receipts.json");
type QueueGlobal = typeof globalThis & { __cashReceiptWriteQueue?: Promise<void> };

async function withStoreLock<T>(action: () => Promise<T>): Promise<T> {
  const queueGlobal = globalThis as QueueGlobal;
  const previous = queueGlobal.__cashReceiptWriteQueue ?? Promise.resolve();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  queueGlobal.__cashReceiptWriteQueue = previous.then(() => hold);
  await previous;
  try {
    return await action();
  } finally {
    release();
  }
}

async function readReceipts(): Promise<LocalCashReceipt[]> {
  try {
    return JSON.parse(await readFile(storePath, "utf8")) as LocalCashReceipt[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function createLocalCashReceipt(input: Omit<LocalCashReceipt, "id" | "receiptNumber" | "receiptDate">) {
  return withStoreLock(async () => {
    const receipts = await readReceipts();
    const receiptDate = todayInIst();
    const financialYear = getCashReceiptFinancialYear(receiptDate);
    const receiptNumber = Math.max(0, ...receipts
      .filter((receipt) => receipt.branch === input.branch && getCashReceiptFinancialYear(receipt.receiptDate) === financialYear)
      .map((receipt) => receipt.receiptNumber)) + 1;
    const receipt: LocalCashReceipt = {
      ...input,
      id: randomUUID(),
      receiptNumber,
      receiptDate,
    };
    await writeFile(storePath, JSON.stringify([...receipts, receipt], null, 2), "utf8");
    return receipt;
  });
}

export async function getLocalCashReceipt(id: string) {
  return (await readReceipts()).find((receipt) => receipt.id === id) ?? null;
}
