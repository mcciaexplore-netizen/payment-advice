import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword } from "@/lib/admin-users";
import { saveLocalCashReceiptUser } from "@/lib/cash-receipt-local-users";
import { BRANCH_OPTIONS } from "@/lib/validation/payment-advice";

async function askHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command in a terminal so the password can be entered without echoing it.");
  }
  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    let value = "";
    const onData = (buffer: Buffer) => {
      const key = buffer.toString("utf8");
      if (key === "\u0003") {
        cleanup();
        reject(new Error("Cancelled."));
      } else if (key === "\r" || key === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
      } else if (key === "\u007f" || key === "\b") {
        value = value.slice(0, -1);
      } else if (!key.startsWith("\u001b")) {
        value += key;
      }
    };
    function cleanup() {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    }
    stdin.on("data", onData);
  });
}

async function main() {
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    const email = (await prompt.question("Email: ")).trim().toLowerCase();
    const fullName = (await prompt.question("Name shown on receipt: ")).trim();
    console.log("Select the account's branch:");
    BRANCH_OPTIONS.forEach((branch, index) => console.log(`  ${index + 1}. ${branch}`));
    const branchNumber = Number(await prompt.question("Branch number: "));
    const branch = BRANCH_OPTIONS[branchNumber - 1];
    if (!email.includes("@") || !fullName || !branch) throw new Error("Enter a valid email, name, and branch.");
    prompt.close();

    const password = await askHidden("Password (input hidden): ");
    if (!password) throw new Error("Password cannot be blank.");
    const confirmation = await askHidden("Confirm password (input hidden): ");
    if (password !== confirmation) throw new Error("Passwords do not match.");
    await saveLocalCashReceiptUser({ email, fullName, branch, passwordHash: await hashPassword(password) });
    console.log(`Cash Receipt access saved locally for ${email} (${branch}).`);
  } finally {
    prompt.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not save this local account.");
  process.exitCode = 1;
});
