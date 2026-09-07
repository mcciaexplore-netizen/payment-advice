import fs from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { CashVoucherDocument } from "../lib/pdf/CashVoucherDocument";

const descriptions = [
  "Local conveyance for industry delegation meeting and return travel",
  "Printing and binding of workshop participant material and feedback forms",
  "Refreshments for committee meeting attended by invited industry members",
  "Stationery purchased for the export documentation training programme",
  "Courier charges for dispatch of membership certificates and supporting papers",
  "Parking and toll expenses incurred during official visits to member units",
  "Emergency purchase of electrical accessories for the conference hall",
  "Photocopying and colour printing for regulatory awareness seminar",
  "Local transport for delivery of event material to the exhibition venue",
  "Miscellaneous consumables purchased for the monthly departmental meeting",
];

async function main() {
  const buffer = await renderToBuffer(
    <CashVoucherDocument
      data={{
        displayNo: "CASH/MCCIA/2026-27/0001",
        formDate: "2026-07-28",
        payeeName: "Acme Test Pvt Ltd",
        items: descriptions.map((description, index) => ({
          billDate: index % 3 === 0 ? null : `2026-08-${String(index + 10).padStart(2, "0")}`,
          billNo: index % 4 === 0 ? null : `INV-MCCIA-${String(index + 1).padStart(3, "0")}`,
          description,
          amount: String(250 + index * 137.25),
        })),
        submittedByName: "Priya Sharma",
        submittedAt: "2026-07-28T10:15:00.000Z",
        recommendingAuthorityName: "Applied AI Studio — Mr. Test Head",
        authorityApprovedAt: "2026-07-29T14:00:00.000Z",
        sanctionedBy: "Chintamani Shrotri",
        isAdvance: false,
        purposeOfAdvance: null,
        previousPendingAdvanceAmount: null,
        previousPendingAdvanceSince: null,
      }}
    />,
  );
  const outputDirectory = path.join(process.cwd(), "tmp", "pdfs");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outPath = path.join(outputDirectory, "cash-voucher-10-row-test.pdf");
  fs.writeFileSync(outPath, buffer);
  console.log("Wrote", outPath, buffer.length, "bytes");
}

main();
