import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type LocalCashReceiptUser = {
  email: string;
  fullName: string;
  branch: string;
  /** Omit for localhost accounts whose password is verified against admin_users. */
  passwordHash?: string;
};

const usersPath = path.join(process.cwd(), ".local-cash-receipt-users.json");

export async function getLocalCashReceiptUsers(): Promise<LocalCashReceiptUser[]> {
  try {
    return JSON.parse(await readFile(usersPath, "utf8")) as LocalCashReceiptUser[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function findLocalCashReceiptUser(email: string) {
  const normalized = email.trim().toLowerCase();
  return (await getLocalCashReceiptUsers()).find((user) => user.email === normalized) ?? null;
}

export async function saveLocalCashReceiptUser(user: LocalCashReceiptUser) {
  const users = await getLocalCashReceiptUsers();
  const existingIndex = users.findIndex((existing) => existing.email === user.email);
  if (existingIndex === -1) users.push(user);
  else users[existingIndex] = user;
  await writeFile(usersPath, JSON.stringify(users, null, 2), { encoding: "utf8", mode: 0o600 });
}
