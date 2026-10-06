import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateOnly } from "@/lib/date-time";

export type CashReceiptPdfItem = {
  particulars: string;
  copies: number;
  price: string;
  amount: string;
  billNo?: string;
  billDate?: string;
};

export type CashReceiptPdfData = {
  serialNo: string;
  receiptDate: string;
  partyName: string;
  gstin: string | null;
  items: CashReceiptPdfItem[];
  total: string;
  issuedBy: string;
};

const BORDER = "0.8pt solid #111111";

const styles = StyleSheet.create({
  page: { paddingTop: 20, paddingBottom: 20, paddingHorizontal: 24, fontFamily: "Helvetica", fontSize: 9, color: "#152235" },
  logo: { width: 90, height: 21, objectFit: "contain", alignSelf: "center", marginBottom: 6 },
  title: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12 },
  chamber: { marginTop: 5, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 10 },
  address: { marginTop: 2, textAlign: "center", fontSize: 7.5, lineHeight: 1.3 },
  idRow: { marginTop: 3, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5 },
  refRow: { marginTop: 12, flexDirection: "row", justifyContent: "space-between" },
  refLabel: { fontFamily: "Helvetica-Bold" },
  partyRow: { marginTop: 10, borderBottom: "0.8pt solid #000000", paddingBottom: 6 },
  partyLabel: { fontFamily: "Helvetica-Bold" },
  gstinRow: { marginTop: 4, minHeight: 14, borderBottom: "0.8pt solid #000000", fontSize: 8 },
  table: { marginTop: 12, borderTop: BORDER, borderLeft: BORDER },
  row: { flexDirection: "row" },
  headerCell: { fontFamily: "Helvetica-Bold", fontSize: 8, padding: 6, borderRight: BORDER, borderBottom: BORDER, textAlign: "center" },
  cell: { fontSize: 8, padding: 6, borderRight: BORDER, borderBottom: BORDER },
  particularsCol: { width: "52%" },
  copiesCol: { width: "13%", textAlign: "center" },
  priceCol: { width: "15%", textAlign: "right" },
  amountCol: { width: "20%", textAlign: "right" },
  billDetail: { marginTop: 3, fontSize: 7 },
  totalLabel: { fontFamily: "Helvetica-Bold", textAlign: "right" },
  totalValue: { fontFamily: "Helvetica-Bold", textAlign: "right" },
  issuedByBlock: { marginTop: 18 },
  issuedByLabel: { fontSize: 8 },
  issuedByName: { marginTop: 3, fontFamily: "Helvetica-Bold" },
});

/** Mirrors the A5-landscape print page (app/cash-receipt/[id]/page.tsx)
 * exactly, through the real server-rendered @react-pdf/renderer pipeline
 * every other document type in this app already uses, rather than relying
 * on a browser's own "print to PDF." Same data, same layout, same real
 * serial number. */
export function CashReceiptDocument({ data, logoDataUrl }: { data: CashReceiptPdfData; logoDataUrl?: string }) {
  return (
    <Document title={`Cash Receipt ${data.serialNo}`} author="MCCIA" language="en-IN">
      <Page size="A5" orientation="landscape" style={styles.page}>
        {logoDataUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no HTML alt prop.
          <Image src={logoDataUrl} style={styles.logo} />
        ) : null}
        <Text style={styles.title}>CASH RECEIPT</Text>
        <Text style={styles.chamber}>MAHRATTA CHAMBER OF COMMERCE, INDUSTRIES &amp; AGRICULTURE</Text>
        <Text style={styles.address}>
          505 &amp; 506 A &amp; B Wing, 5th Floor, MCCIA Trade Tower, International Convention Centre,{"\n"}
          403 - A Senapati Bapat Road, Pune - 411 016 Ph. 25709000
        </Text>
        <View style={styles.idRow}>
          <Text>GSTIN: 27AAATM5559Q1ZS</Text>
          <Text>PAN: AATMM5559Q</Text>
        </View>

        <View style={styles.refRow}>
          <Text><Text style={styles.refLabel}>Receipt No: </Text>{data.serialNo}</Text>
          <Text><Text style={styles.refLabel}>Date: </Text>{formatDateOnly(data.receiptDate)}</Text>
        </View>

        <View style={styles.partyRow}>
          <Text><Text style={styles.partyLabel}>M/s  </Text>{data.partyName}</Text>
        </View>
        <Text style={styles.gstinRow}>GSTIN: {data.gstin ?? ""}</Text>

        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={[styles.headerCell, styles.particularsCol]}>PARTICULARS</Text>
            <Text style={[styles.headerCell, styles.copiesCol]}>COPIES</Text>
            <Text style={[styles.headerCell, styles.priceCol]}>PRICE</Text>
            <Text style={[styles.headerCell, styles.amountCol]}>AMOUNT{"\n"}Rs.</Text>
          </View>
          {data.items.map((item, index) => (
            <View key={`${item.particulars}-${index}`} style={styles.row}>
              <View style={[styles.cell, styles.particularsCol]}>
                <Text>{index + 1}) {item.particulars}</Text>
                {item.particulars.startsWith("Hall Hiring Charges") ? (
                  <Text style={styles.billDetail}>
                    Bill No. {item.billNo || "________"}    Date {item.billDate ? formatDateOnly(item.billDate) : "________"}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.cell, styles.copiesCol]}>{item.copies || ""}</Text>
              <Text style={[styles.cell, styles.priceCol]}>{item.copies ? Number(item.price).toFixed(2) : ""}</Text>
              <Text style={[styles.cell, styles.amountCol]}>{item.copies ? Number(item.amount).toFixed(2) : ""}</Text>
            </View>
          ))}
          <View style={styles.row}>
            <Text style={[styles.cell, styles.totalLabel, { width: "80%" }]}>Total</Text>
            <Text style={[styles.cell, styles.totalValue, styles.amountCol]}>{Number(data.total).toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.issuedByBlock}>
          <Text style={styles.issuedByLabel}>Issued by</Text>
          <Text style={styles.issuedByName}>{data.issuedBy}</Text>
        </View>
      </Page>
    </Document>
  );
}
