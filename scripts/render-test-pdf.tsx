import fs from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { PaymentAdviceDocument } from "../lib/pdf/PaymentAdviceDocument";

const longText =
  "Reimbursement for travel, boarding and lodging expenses incurred during the official visit to New Delhi for the Annual Trade Policy Consultation with the Ministry of Commerce and Industry, including flight tickets for two officials, three nights of hotel accommodation at India Habitat Centre, local conveyance by taxi between the airport, hotel and ministry office, and per-diem meal expenses as per the approved travel policy circular dated 12th June 2026. ".repeat(2).slice(0, 600);

async function main() {
  const buffer = await renderToBuffer(
    <PaymentAdviceDocument
      data={{
        serialNo: "MCCIA/2026-27/0001",
        formDate: "2026-07-28",
        payeeName: "Acme Test Pvt Ltd",
        payeeAddress: "123 Test Street, Shivajinagar, Pune 411005, Maharashtra",
        payeeEmail: "acme@example.com",
        payeeContactPerson: "Ravi Kumar",
        payeeContactPhone: "9876543210",
        poNumber: "PO-0099",
        poDate: "2026-07-01",
        deliveryChallanNo: "DC-042",
        deliveryChallanDate: "2026-07-15",
        billNo: "INV-2026-311",
        billDate: "2026-07-20",
        amount: "125000.00",
        billPassedFor: "124500.00",
        natureOfExpenditure: longText,
        enclosures: "Tax invoice, approval letter, purchase order copy",
        specialRemarks: "Urgent — vendor payment terms are net 7 days from invoice date.",
        paymentMode: "NEFT",
        bankAccountNo: "123456789012",
        bankIfsc: "HDFC0001234",
        beneficiaryName: "Acme Test Pvt Ltd",
        submittedByName: "Priya Sharma",
        recommendingAuthorityName: "Applied AI Studio — Mr. Test Head",
        verifiedByName: "Anita Deshmukh",
        sanctionedByName: "Rajesh Kulkarni",
        submittedAt: "2026-07-28T10:15:00.000Z",
        approvedAt: "2026-07-30T09:00:00.000Z",
        approvedByName: "Suresh Patil",
      }}
    />,
  );
  const outPath = path.join(process.cwd(), "scripts", "test-output.pdf");
  fs.writeFileSync(outPath, buffer);
  console.log("Wrote", outPath, buffer.length, "bytes");
}

main();
