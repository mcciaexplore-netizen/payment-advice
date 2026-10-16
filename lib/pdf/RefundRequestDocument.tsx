import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateOnly } from "@/lib/date-time";

const NAVY = "#0B1F3A";
const GREEN = "#2E8B57";
const BORDER = "0.8pt solid #B6C0CC";

const styles = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 36, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 9.5, color: "#152235" },
  masthead: { position: "relative", minHeight: 20, paddingBottom: 10, borderBottom: `2pt solid ${GREEN}` },
  logo: { position: "absolute", left: 0, top: 0, width: 68, height: 18, objectFit: "contain" },
  chamber: { width: "100%", textAlign: "center", fontFamily: "Helvetica-Bold", color: NAVY, fontSize: 10, lineHeight: 1.4 },
  title: { marginTop: 12, marginBottom: 10, fontFamily: "Helvetica-Bold", fontSize: 17, color: NAVY, textAlign: "center" },
  referenceRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  referenceNo: { fontFamily: "Helvetica-Bold", color: NAVY },
  section: { marginTop: 10, paddingBottom: 3, borderBottom: `1pt solid ${GREEN}`, fontFamily: "Helvetica-Bold", color: GREEN, fontSize: 9, letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", paddingTop: 5, paddingBottom: 5, paddingRight: 10, borderBottom: BORDER },
  wide: { width: "100%" },
  label: { fontSize: 7.5, color: "#5B6B80", marginBottom: 2 },
  // No lineHeight here: in a wrapping flex row react-pdf reserves extra
  // height for it under every value (measured), pushing the form to 2 pages.
  value: {},
  total: { fontFamily: "Helvetica-Bold", color: NAVY },
  signatures: { flexDirection: "row", marginTop: 30, gap: 24 },
  signature: { flex: 1 },
  signatureLine: { borderBottom: BORDER, height: 30 },
  signatureLabel: { marginTop: 5, fontSize: 8.5, color: NAVY, fontFamily: "Helvetica-Bold" },
  signatureName: { marginTop: 2, fontSize: 8.5 },
});

export type RefundRequestPdfData = {
  serialNo: string;
  requestDate: string;
  submittedByName: string;
  submittedByEmail: string;
  submittedByDepartment: string;
  branch: string;
  recommendingAuthority: string;
  payeeName: string;
  payeeAddress: string | null;
  payeeContactPerson: string | null;
  payeeContactPhone: string | null;
  payeeEmail: string | null;
  payeeGstin: string | null;
  payeeUdyamNumber: string | null;
  basicAmount: string;
  gstAmount: string;
  totalAmount: string;
  natureOfExpenditure: string;
  fromDate: string;
  bankName: string | null;
  beneficiaryName: string | null;
  bankAccountNo: string | null;
  bankIfsc: string | null;
  enclosures: string | null;
  specialRemarks: string | null;
  documents: Array<{ type: string; fileName: string }>;
};

const rupees = (value: string) => `Rs. ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DOCUMENT_LABELS: Record<string, string> = { EMAIL_COPY: "Email copy", CANCELLED_CHEQUE: "Cancelled cheque", OTHER: "Other" };

function Cell({ label, value, wide, bold }: { label: string; value: string | null | undefined; wide?: boolean; bold?: boolean }) {
  if (!value) return null;
  return (
    <View style={wide ? [styles.cell, styles.wide] : styles.cell} wrap={false}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={bold ? [styles.value, styles.total] : styles.value}>{value}</Text>
    </View>
  );
}

/** Printable Refund request, rendered only from a saved row (serial always
 * present). Signature areas stay blank: printing is not approval. No stamps,
 * and lib/pdf/Stamp.tsx is not used. */
export function RefundRequestDocument({ data, logoDataUrl }: { data: RefundRequestPdfData; logoDataUrl?: string }) {
  return (
    <Document title={`Refund Request ${data.serialNo}`} author="MCCIA" language="en-IN">
      <Page size="A4" style={styles.page}>
        <View style={styles.masthead} wrap={false}>
          {logoDataUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no HTML alt prop.
            <Image src={logoDataUrl} style={styles.logo} />
          ) : null}
          <Text style={styles.chamber}>Mahratta Chamber of Commerce, Industries and Agriculture</Text>
        </View>
        <Text style={styles.title}>Refund Request</Text>
        <View style={styles.referenceRow}>
          <Text style={styles.referenceNo}>No. : {data.serialNo}</Text>
          <Text>Date : {formatDateOnly(data.requestDate)}</Text>
        </View>

        <Text style={styles.section}>SUBMITTER</Text>
        <View style={styles.grid}>
          <Cell label="Name" value={data.submittedByName} />
          <Cell label="Email" value={data.submittedByEmail} />
          <Cell label="Department" value={data.submittedByDepartment} />
          <Cell label="Branch" value={data.branch} />
          <Cell label="Recommending Authority" value={data.recommendingAuthority} />
        </View>

        <Text style={styles.section}>PAYEE</Text>
        <View style={styles.grid}>
          <Cell label="Payee / Company Name" wide value={data.payeeName} />
          <Cell label="Address" wide value={data.payeeAddress} />
          <Cell label="Contact Person" value={data.payeeContactPerson} />
          <Cell label="Contact Phone" value={data.payeeContactPhone} />
          <Cell label="E-mail ID" value={data.payeeEmail} />
          <Cell label="GSTIN" value={data.payeeGstin} />
          <Cell label="Udyam / MSME No." value={data.payeeUdyamNumber} />
        </View>

        <Text style={styles.section}>REFUND</Text>
        <View style={styles.grid}>
          <Cell label="Nature of expenditure" wide value={data.natureOfExpenditure} />
          <Cell label="From Date" value={formatDateOnly(data.fromDate)} />
          <Cell label="Basic Amount" value={rupees(data.basicAmount)} />
          <Cell label="GST Amount" value={rupees(data.gstAmount)} />
          <Cell label="Total Refund" value={rupees(data.totalAmount)} bold />
        </View>

        {data.bankName || data.beneficiaryName || data.bankAccountNo || data.bankIfsc ? <>
          <Text style={styles.section}>BANK DETAILS</Text>
          <View style={styles.grid}>
            <Cell label="Bank Name" value={data.bankName} />
            <Cell label="Account Holder Name" value={data.beneficiaryName} />
            <Cell label="Bank Account Number" value={data.bankAccountNo} />
            <Cell label="IFSC Code" value={data.bankIfsc} />
          </View>
        </> : null}

        {data.enclosures || data.specialRemarks || data.documents.length ? <>
          <Text style={styles.section}>ENCLOSURES AND REMARKS</Text>
          <View style={styles.grid}>
            <Cell label="Enclosures" wide value={data.enclosures} />
            <Cell label="Remarks" wide value={data.specialRemarks} />
            <Cell label="Documents attached" wide value={data.documents.map((document) => `${DOCUMENT_LABELS[document.type] ?? document.type}: ${document.fileName}`).join("\n")} />
          </View>
        </> : null}

        <View style={styles.signatures} wrap={false}>
          <View style={styles.signature}><View style={styles.signatureLine} /><Text style={styles.signatureLabel}>Submitted by</Text><Text style={styles.signatureName}>{data.submittedByName}</Text></View>
          <View style={styles.signature}><View style={styles.signatureLine} /><Text style={styles.signatureLabel}>Recommended by</Text><Text style={styles.signatureName}>{data.recommendingAuthority}</Text></View>
          <View style={styles.signature}><View style={styles.signatureLine} /><Text style={styles.signatureLabel}>Accounts Department</Text></View>
        </View>
      </Page>
    </Document>
  );
}
