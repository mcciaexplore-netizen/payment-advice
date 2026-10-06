import fs from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { CashReceiptDocument, type CashReceiptPdfData } from "@/lib/pdf/CashReceiptDocument";

/** Pure rendering from caller-supplied fields, no database or audit side
 * effects - the route calling this owns the access check, the audit write,
 * and the response headers. The logo is the same local static asset every
 * other PDF in this app embeds. */
export async function renderCashReceiptPdf(data: CashReceiptPdfData): Promise<Buffer> {
  const logoPath = path.join(process.cwd(), "public", "mccia-logo.png");
  const logoDataUrl = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`
    : undefined;
  return renderToBuffer(<CashReceiptDocument data={data} logoDataUrl={logoDataUrl} />);
}
