import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import fs from "node:fs";
import path from "node:path";
import { Stamp } from "@/lib/pdf/Stamp";
import { billPassedForLabelFor } from "@/lib/advice/document-identity";
import { formatDateOnly, formatIstDate } from "@/lib/date-time";

export type PaymentAdvicePdfData = {
  // Resolved primary document number — serial_no normally, or advance_no
  // when isAdvance (per lib/advice/document-identity.ts's displayNoFor()).
  displayNo: string;
  formDate: string; // YYYY-MM-DD
  payeeName: string;
  payeeAddress: string;
  payeeEmail: string | null;
  payeeContactPerson: string | null;
  payeeContactPhone: string | null;
  poNumber: string | null;
  poDate: string | null;
  deliveryChallanNo: string | null;
  deliveryChallanDate: string | null;
  billNo: string;
  billDate: string;
  amount: string;
  // Basic/GST split, NEFT only — null for Cash and for pre-split NEFT rows
  // (see AGENT_HANDOFF.md). Both null/both set, never one without the
  // other, since submission always writes them together.
  basicAmount: string | null;
  gstAmount: string | null;
  billPassedFor: string | null;
  natureOfExpenditure: string;
  enclosures: string | null;
  specialRemarks: string | null;
  paymentMode: "NEFT" | "CASH";
  bankAccountNo: string | null;
  bankIfsc: string | null;
  beneficiaryName: string | null;
  submittedByName: string;
  recommendingAuthorityName: string;
  // Both admin-recorded during the Finance Verification + Sanctioning
  // pipeline — null/blank until that stage happens, same convention as
  // every other signature line on this form.
  verifiedBy: string | null;
  verifiedAt: string | null; // ISO timestamp — drives the Verified stamp's date
  sanctionedBy: string | null;
  submittedAt: string; // ISO timestamp
  // ISO timestamp — drives the Recommended-by (Approved) stamp; null until
  // the Recommending Authority actually approves.
  authorityApprovedAt: string | null;
  approvedAt: string | null; // ISO timestamp
  approvedByName: string | null;
  // Advance Payment fields — all null/empty for a regular submission. See
  // AGENT_HANDOFF.md. purposeOfAdvance is also mirrored into
  // natureOfExpenditure above (same dual-representation the Cash Voucher's
  // line items already use), so the "Nature of Expenditure" cell reads
  // correctly either way — these are for the advance-specific additions
  // (Particulars table, Previous Pending Advance line) only.
  isAdvance: boolean;
  previousPendingAdvanceAmount: string | null;
  previousPendingAdvanceSince: string | null; // YYYY-MM-DD
  particulars: { description: string; amount: string }[];
};

const BORDER = "1pt solid #000000";

const styles = StyleSheet.create({
  page: {
    padding: "1.5cm",
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#000000",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  // Real logo is a wide wordmark (1085x258, ~4.2:1) — size to match so it
  // never stretches, and cap the height so the centered title still has
  // room to sit on one line.
  logo: { width: 67, height: 16, objectFit: "contain" },
  logoPlaceholder: { width: 67, height: 16 },
  headerCenter: { flex: 1, alignItems: "center", textAlign: "center", paddingHorizontal: 4 },
  headerTitle: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  headerSubtitle: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 2 },
  // Invisible spacer, same width the old form-number text occupied —
  // headerCenter is centered (flex: 1) between two fixed-width flanks, so
  // removing that text without a same-size stand-in would visibly shift
  // the centered title left, off where it was balanced before.
  headerRightSpacer: { width: 92 },
  serialRow: { textAlign: "right", marginBottom: 4 },
  serialText: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  dateRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  dateText: { fontSize: 9 },
  table: { borderTop: BORDER, borderLeft: BORDER },
  tableRow: { flexDirection: "row" },
  cell: {
    width: "50%",
    borderRight: BORDER,
    borderBottom: BORDER,
    padding: 5,
  },
  cellLabel: { fontFamily: "Helvetica-Bold", fontSize: 8.5, marginBottom: 2 },
  cellSubRow: { marginBottom: 4 },
  sectionHeading: { fontFamily: "Helvetica-Bold", fontSize: 9, marginTop: 10, marginBottom: 4 },
  particularsTable: { borderTop: BORDER, borderLeft: BORDER },
  particularsRow: { flexDirection: "row" },
  particularsHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    padding: 4,
    borderRight: BORDER,
    borderBottom: BORDER,
  },
  particularsCell: { fontSize: 8.5, padding: 4, borderRight: BORDER, borderBottom: BORDER },
  particularsDescription: { width: "80%" },
  particularsAmount: { width: "20%", textAlign: "right" },
  particularsTotalLabel: { fontFamily: "Helvetica-Bold" },
  previousPendingText: { fontSize: 9, marginTop: 6 },
  cellValue: { fontSize: 9 },
  footerTable: { flexDirection: "row", borderTop: BORDER, borderLeft: BORDER, marginTop: 14 },
  footerCell: {
    width: "25%",
    borderRight: BORDER,
    borderBottom: BORDER,
    padding: 6,
    minHeight: 80,
    position: "relative",
  },
  footerLabel: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  footerLine: { fontSize: 8, marginTop: 16 },
  footerValue: { fontSize: 8.5, marginTop: 3 },
});

function formatDMY(iso: string | null): string {
  return iso ? formatIstDate(iso) : "";
}

function formatAmount(value: string | null): string {
  if (value === null || value === undefined) return "";
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

/** Long free-text cells (Nature of Expenditure, Enclosures, Special Remarks)
 * must never overflow their cell or spill off the page — shrink the font
 * for unusually long values instead of letting them wrap indefinitely. */
function autoFontSize(text: string, base = 9, min = 6, softLimit = 180) {
  if (!text || text.length <= softLimit) return base;
  const scale = Math.max(min / base, softLimit / text.length);
  return Math.max(min, Math.round(base * scale * 10) / 10);
}

function resolveLogoPath(): string | null {
  const p = path.join(process.cwd(), "public", "mccia-logo.png");
  return fs.existsSync(p) ? p : null;
}

export function PaymentAdviceDocument({ data }: { data: PaymentAdvicePdfData }) {
  const logoPath = resolveLogoPath();

  const modeOfPaymentValue =
    data.paymentMode === "NEFT" ? (
      <>
        <Text>NEFT</Text>
        <Text>A/c No.: {data.bankAccountNo}</Text>
        <Text>IFSC: {data.bankIfsc}</Text>
        <Text>Beneficiary: {data.beneficiaryName}</Text>
      </>
    ) : (
      <Text>Cash</Text>
    );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {logoPath ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image is a PDF primitive, not an HTML <img>; it has no alt prop.
            <Image src={logoPath} style={styles.logo} />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              MAHRATTA CHAMBER OF COMMERCE INDUSTRIES AND AGRICULTURE
            </Text>
            <Text style={styles.headerSubtitle}>Payment Advice</Text>
          </View>
          <View style={styles.headerRightSpacer} />
        </View>

        <View style={styles.serialRow}>
          <Text style={styles.serialText}>{data.displayNo}</Text>
        </View>

        <View style={styles.dateRow}>
          <Text style={styles.dateText}>Submitted on : {formatDMY(data.submittedAt)}</Text>
          <Text style={styles.dateText}>
            Approved on : {data.approvedAt ? formatDMY(data.approvedAt) : ""}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={styles.cell}>
              <Text style={styles.cellLabel}>Name and Address of the Payee :</Text>
              <Text style={styles.cellValue}>{data.payeeName}</Text>
              <Text style={styles.cellValue}>{data.payeeAddress}</Text>
              {data.payeeContactPerson ? (
                <Text style={styles.cellValue}>Contact: {data.payeeContactPerson}</Text>
              ) : null}
              {data.payeeContactPhone ? (
                <Text style={styles.cellValue}>Phone: {data.payeeContactPhone}</Text>
              ) : null}
            </View>
            <View style={styles.cell}>
              <View style={styles.cellSubRow}>
                <Text style={styles.cellLabel}>P. O. No. / Date :</Text>
                <Text style={styles.cellValue}>
                  {data.poNumber ?? "—"} {data.poDate ? `/ ${formatDateOnly(data.poDate)}` : ""}
                </Text>
              </View>
              <View>
                <Text style={styles.cellLabel}>Del. Challan No. / Date :</Text>
                <Text style={styles.cellValue}>
                  {data.deliveryChallanNo ?? "—"}{" "}
                  {data.deliveryChallanDate ? `/ ${formatDateOnly(data.deliveryChallanDate)}` : ""}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.cell}>
              <Text style={styles.cellLabel}>E-mail ID :</Text>
              <Text style={styles.cellValue}>{data.payeeEmail ?? "—"}</Text>
            </View>
            <View style={styles.cell}>
              <View style={styles.cellSubRow}>
                <Text style={styles.cellLabel}>Bill No. / Date :</Text>
                <Text style={styles.cellValue}>
                  {data.billNo} / {formatDateOnly(data.billDate)}
                </Text>
              </View>
              {data.basicAmount !== null && data.gstAmount !== null ? (
                <View>
                  <Text style={styles.cellLabel}>Basic Amount Rs. (*Subject to TDS) :</Text>
                  <Text style={styles.cellValue}>{formatAmount(data.basicAmount)}</Text>
                  <Text style={[styles.cellLabel, { marginTop: 4 }]}>GST Amount Rs. :</Text>
                  <Text style={styles.cellValue}>{formatAmount(data.gstAmount)}</Text>
                  <Text style={[styles.cellLabel, { marginTop: 4 }]}>Total Rs. :</Text>
                  <Text style={styles.cellValue}>{formatAmount(data.amount)}</Text>
                </View>
              ) : (
                <View>
                  <Text style={styles.cellLabel}>Amount Rs. :</Text>
                  <Text style={styles.cellValue}>{formatAmount(data.amount)}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.cell}>
              {/* "Purpose of Advance" reuses this same cell/column — same
                  underlying natureOfExpenditure value (mirrored server-side
                  from purposeOfAdvance), just relabeled, per the "Bill
                  passed for Rs. -> Amount Sanctioned" precedent. Avoids
                  printing the purpose text twice under two labels. */}
              <Text style={styles.cellLabel}>
                {data.isAdvance ? "Purpose of Advance :" : "Nature of Expenditure :"}
              </Text>
              <Text style={{ fontSize: autoFontSize(data.natureOfExpenditure) }}>
                {data.natureOfExpenditure}
              </Text>
            </View>
            <View style={styles.cell}>
              <View style={styles.cellSubRow}>
                <Text style={styles.cellLabel}>{billPassedForLabelFor(data.isAdvance)} :</Text>
                <Text style={styles.cellValue}>
                  {data.billPassedFor ? formatAmount(data.billPassedFor) : ""}
                </Text>
              </View>
              <View>
                <Text style={styles.cellLabel}>Mode of Payment : Cheque / DD payable at -</Text>
                <View style={styles.cellValue}>{modeOfPaymentValue}</View>
              </View>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.cell}>
              <Text style={styles.cellLabel}>Enclosures :</Text>
              <Text style={{ fontSize: autoFontSize(data.enclosures ?? "") }}>
                {data.enclosures ?? ""}
              </Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.cellLabel}>Special Remarks :</Text>
              <Text style={{ fontSize: autoFontSize(data.specialRemarks ?? "") }}>
                {data.specialRemarks ?? ""}
              </Text>
            </View>
          </View>
        </View>

        {data.isAdvance ? (
          <View>
            <Text style={styles.sectionHeading}>Particulars</Text>
            <View style={styles.particularsTable}>
              <View style={styles.particularsRow}>
                <Text style={[styles.particularsHeaderCell, styles.particularsDescription]}>
                  Description
                </Text>
                <Text style={[styles.particularsHeaderCell, styles.particularsAmount]}>Amount Rs.</Text>
              </View>
              {data.particulars.map((item, index) => (
                <View style={styles.particularsRow} key={index}>
                  <Text style={[styles.particularsCell, styles.particularsDescription]}>
                    {item.description}
                  </Text>
                  <Text style={[styles.particularsCell, styles.particularsAmount]}>
                    {formatAmount(item.amount)}
                  </Text>
                </View>
              ))}
              <View style={styles.particularsRow}>
                <Text
                  style={[
                    styles.particularsCell,
                    styles.particularsDescription,
                    styles.particularsTotalLabel,
                  ]}
                >
                  Total
                </Text>
                <Text
                  style={[styles.particularsCell, styles.particularsAmount, styles.particularsTotalLabel]}
                >
                  {formatAmount(data.amount)}
                </Text>
              </View>
            </View>
            <Text style={styles.previousPendingText}>
              Previous Pending Advance :{" "}
              {data.previousPendingAdvanceAmount && Number(data.previousPendingAdvanceAmount) > 0
                ? `Rs. ${formatAmount(data.previousPendingAdvanceAmount)} (since ${formatDateOnly(data.previousPendingAdvanceSince)})`
                : "None"}
            </Text>
          </View>
        ) : null}

        <View style={styles.footerTable}>
          <View style={styles.footerCell}>
            <Text style={styles.footerLabel}>Submitted by :</Text>
            <Text style={styles.footerValue}>{data.submittedByName}</Text>
            <Stamp
              label="SUBMITTED"
              name={data.submittedByName}
              date={formatDMY(data.submittedAt)}
              color="navy"
            />
          </View>
          <View style={styles.footerCell}>
            <Text style={styles.footerLabel}>Recommended by :</Text>
            <Text style={styles.footerValue}>{data.recommendingAuthorityName}</Text>
            {data.authorityApprovedAt ? (
              <Stamp
                label="RECOMMENDED"
                name={data.recommendingAuthorityName}
                date={formatDMY(data.authorityApprovedAt)}
                color="green"
              />
            ) : null}
          </View>
          <View style={styles.footerCell}>
            <Text style={styles.footerLabel}>Verified by :</Text>
            <Text style={styles.footerValue}>{data.verifiedBy ?? ""}</Text>
            {data.verifiedAt && data.verifiedBy ? (
              <Stamp
                label="VERIFIED"
                name={data.verifiedBy}
                date={formatDMY(data.verifiedAt)}
                color="amber"
              />
            ) : null}
          </View>
          {/* Sanctioned by: never stamped, per spec — stays a physical
              wet-ink box for Chintamani, untouched by the stamp feature. */}
          <View style={[styles.footerCell, { borderRight: BORDER }]}>
            <Text style={styles.footerLabel}>Sanctioned by :</Text>
            <Text style={styles.footerValue}>{data.sanctionedBy ?? ""}</Text>
            <Text style={styles.footerLine}>Date :</Text>
            <Text style={styles.footerLine}>Signature :</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
