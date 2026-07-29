import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import fs from "node:fs";
import path from "node:path";

export type CashVoucherPdfData = {
  serialNo: string;
  formDate: string;
  payeeName: string;
  items: { description: string; amount: string }[];
  submittedByName: string;
  recommendingAuthorityName: string;
  sanctionedByName: string | null;
};

const NAVY = "#0B1F3A";
const GREEN = "#2E8B57";
const BORDER = "0.8pt solid #B6C0CC";

const styles = StyleSheet.create({
  page: { paddingTop: 38, paddingBottom: 40, paddingHorizontal: 42, fontFamily: "Helvetica", color: "#152235", fontSize: 9 },
  masthead: { flexDirection: "row", alignItems: "center", borderBottom: `2pt solid ${GREEN}`, paddingBottom: 12 },
  logo: { width: 68, height: 18, objectFit: "contain" },
  logoPlaceholder: { width: 68, height: 18 },
  heading: { flex: 1, textAlign: "center", paddingHorizontal: 12 },
  chamber: { fontFamily: "Helvetica-Bold", fontSize: 9, color: NAVY },
  address: { fontSize: 7.5, color: "#536275", marginTop: 3 },
  title: { marginTop: 18, fontFamily: "Helvetica-Bold", fontSize: 18, color: NAVY, letterSpacing: 0.5, textAlign: "center" },
  titleRule: { width: 82, height: 3, backgroundColor: GREEN, alignSelf: "center", marginTop: 7, marginBottom: 16 },
  metadata: { flexDirection: "row", justifyContent: "flex-end", gap: 22, marginBottom: 18 },
  metadataItem: { alignItems: "flex-end" },
  metadataLabel: { fontSize: 7, color: "#607087", textTransform: "uppercase", letterSpacing: 0.5 },
  metadataValue: { fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 2 },
  payee: { borderLeft: `3pt solid ${GREEN}`, backgroundColor: "#F3F7F5", padding: 11, marginBottom: 16 },
  payeeLabel: { fontSize: 7.5, color: "#607087", textTransform: "uppercase", letterSpacing: 0.7 },
  payeeValue: { fontFamily: "Helvetica-Bold", fontSize: 12, color: NAVY, marginTop: 4 },
  table: { borderTop: BORDER, borderLeft: BORDER },
  row: { flexDirection: "row" },
  headerCell: { backgroundColor: NAVY, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8, padding: 8, borderRight: BORDER, borderBottom: BORDER },
  description: { width: "76%" },
  amount: { width: "24%", textAlign: "right" },
  cell: { borderRight: BORDER, borderBottom: BORDER, padding: 8, lineHeight: 1.3 },
  totalLabel: { backgroundColor: "#EAF3ED", fontFamily: "Helvetica-Bold", color: NAVY },
  totalAmount: { backgroundColor: "#EAF3ED", fontFamily: "Helvetica-Bold", color: NAVY, textAlign: "right" },
  signatures: { flexDirection: "row", marginTop: 32, borderTop: BORDER, borderLeft: BORDER },
  signature: { width: "25%", minHeight: 77, borderRight: BORDER, borderBottom: BORDER, padding: 8 },
  signatureLabel: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: NAVY },
  signatureName: { fontSize: 8, marginTop: 5, minHeight: 19 },
  date: { fontSize: 7.5, marginTop: 8 },
});

function resolveLogoPath(): string | null {
  const logoPath = path.join(process.cwd(), "public", "mccia-logo.png");
  return fs.existsSync(logoPath) ? logoPath : null;
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function formatAmount(amount: string) {
  return Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

export function CashVoucherDocument({ data }: { data: CashVoucherPdfData }) {
  const logoPath = resolveLogoPath();
  const total = data.items.reduce((sum, item) => sum + Number(item.amount), 0).toFixed(2);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.masthead}>
          {logoPath ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no HTML alt prop.
            <Image src={logoPath} style={styles.logo} />
          ) : <View style={styles.logoPlaceholder} />}
          <View style={styles.heading}>
            <Text style={styles.chamber}>MAHRATTA CHAMBER OF COMMERCE, INDUSTRIES & AGRICULTURE</Text>
            <Text style={styles.address}>Senapati Bapat Road, Pune 411 016.</Text>
          </View>
        </View>
        <Text style={styles.title}>CASH PAYMENT VOUCHER</Text>
        <View style={styles.titleRule} />

        <View style={styles.metadata}>
          <View style={styles.metadataItem}><Text style={styles.metadataLabel}>No.</Text><Text style={styles.metadataValue}>{data.serialNo}</Text></View>
          <View style={styles.metadataItem}><Text style={styles.metadataLabel}>Date</Text><Text style={styles.metadataValue}>{formatDate(data.formDate)}</Text></View>
        </View>

        <View style={styles.payee}>
          <Text style={styles.payeeLabel}>Name of the Payee</Text>
          <Text style={styles.payeeValue}>{data.payeeName}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={[styles.headerCell, styles.description]}>NATURE OF EXPENDITURE</Text>
            <Text style={[styles.headerCell, styles.amount]}>AMOUNT (RS.)</Text>
          </View>
          {data.items.map((item, index) => (
            <View style={styles.row} key={`${index}-${item.description}`} wrap={false}>
              <Text style={[styles.cell, styles.description]}>{item.description}</Text>
              <Text style={[styles.cell, styles.amount]}>{formatAmount(item.amount)}</Text>
            </View>
          ))}
          <View style={styles.row} wrap={false}>
            <Text style={[styles.cell, styles.description, styles.totalLabel]}>TOTAL</Text>
            <Text style={[styles.cell, styles.amount, styles.totalAmount]}>{formatAmount(total)}</Text>
          </View>
        </View>

        <View style={styles.signatures} wrap={false}>
          <Signature label="Submitted by" name={data.submittedByName} />
          <Signature label="Recommended by" name={data.recommendingAuthorityName} />
          <Signature label="Sanctioned by" name={data.sanctionedByName ?? ""} />
          <Signature label="Payee's Signature" name="" />
        </View>
      </Page>
    </Document>
  );
}

function Signature({ label, name }: { label: string; name: string }) {
  return <View style={styles.signature}><Text style={styles.signatureLabel}>{label}</Text><Text style={styles.signatureName}>{name}</Text><Text style={styles.date}>Date: __________________</Text></View>;
}
