import fs from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { RefundRequestDocument, type RefundRequestPdfData } from "@/lib/pdf/RefundRequestDocument";

/** Pure rendering from a saved Refund request row: no database, numbering,
 * audit or email side effects. */
export async function renderRefundRequestPdf(data: RefundRequestPdfData): Promise<Buffer> {
  const logoPath = path.join(process.cwd(), "public", "mccia-logo.png");
  const logoDataUrl = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`
    : undefined;
  return renderToBuffer(<RefundRequestDocument data={data} logoDataUrl={logoDataUrl} />);
}
