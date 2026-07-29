import fs from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { CashVoucherDocument } from "../lib/pdf/CashVoucherDocument";

const longDescription = "Reimbursement of travel, local conveyance, incidental meeting expenses and materials purchased for the MCCIA delegation programme, including receipts reconciled against the approved activity budget. ".repeat(3);

async function main() {
  const buffer = await renderToBuffer(
    <CashVoucherDocument
      data={{
        serialNo: "MCCIA/2026-27/0001",
        formDate: "2026-07-28",
        payeeName: "Acme Test Pvt Ltd",
        items: [
          { description: "Meeting stationery and printing", amount: "1250.00" },
          { description: longDescription, amount: "4850.50" },
          { description: "Local conveyance", amount: "350.00" },
        ],
        submittedByName: "Priya Sharma",
        recommendingAuthorityName: "Applied AI Studio — Mr. Test Head",
        sanctionedByName: "Rajesh Kulkarni",
      }}
    />,
  );
  const outPath = path.join(process.cwd(), "scripts", "cash-voucher-test-output.pdf");
  fs.writeFileSync(outPath, buffer);
  console.log("Wrote", outPath, buffer.length, "bytes");
}

main();
