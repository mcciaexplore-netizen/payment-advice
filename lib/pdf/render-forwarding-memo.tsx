import fs from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { ForwardingMemoDocument } from "@/lib/pdf/ForwardingMemoDocument";
import { forwardingMemoSchema, type ForwardingMemoInput } from "@/lib/validation/forwarding-memo";

/** Pure rendering from caller-supplied fields, with no database, numbering,
 * audit, email or submission side effects. The logo is a local static asset. */
export async function renderForwardingMemoPdf(data: ForwardingMemoInput): Promise<Buffer> {
  const validated = forwardingMemoSchema.parse(data);
  const logoPath = path.join(process.cwd(), "public", "mccia-logo.png");
  const logoDataUrl = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`
    : undefined;
  return renderToBuffer(<ForwardingMemoDocument data={validated} logoDataUrl={logoDataUrl} />);
}
