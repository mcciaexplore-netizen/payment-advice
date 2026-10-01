import fs from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { ForwardingMemoDocument } from "@/lib/pdf/ForwardingMemoDocument";
import { forwardingMemoSchema, type ForwardingMemoInput } from "@/lib/validation/forwarding-memo";

/** Pure rendering from caller-supplied fields, with no database, numbering,
 * audit, email or submission side effects. The logo is a local static asset.
 * `serialNo`/`receivedAt`/`receivedBy` are optional - the database-free local
 * preview (POST /api/forwarding-memo/preview) renders before a real row (and
 * so a real serial) exists, and omits them entirely; the real, saved-memo PDF
 * route (GET /api/forwarding-memo/[id]/pdf) always supplies serialNo, and
 * receivedAt/receivedBy once Finance Admin has marked it received. */
export async function renderForwardingMemoPdf(
  data: ForwardingMemoInput,
  options?: { serialNo?: string; receivedAt?: string | null; receivedBy?: string | null },
): Promise<Buffer> {
  const validated = forwardingMemoSchema.parse(data);
  const logoPath = path.join(process.cwd(), "public", "mccia-logo.png");
  const logoDataUrl = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`
    : undefined;
  return renderToBuffer(
    <ForwardingMemoDocument
      data={validated}
      serialNo={options?.serialNo}
      receivedAt={options?.receivedAt}
      receivedBy={options?.receivedBy}
      logoDataUrl={logoDataUrl}
    />,
  );
}
