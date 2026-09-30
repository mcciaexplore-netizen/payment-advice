import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateOnly } from "@/lib/date-time";
import { Stamp } from "@/lib/pdf/Stamp";
import type { ForwardingMemoInput } from "@/lib/validation/forwarding-memo";

const NAVY = "#0B1F3A";
const GREEN = "#2E8B57";
const BORDER = "0.8pt solid #B6C0CC";

const styles = StyleSheet.create({
  page: { paddingTop: 38, paddingBottom: 40, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 10, color: "#152235" },
  masthead: { position: "relative", minHeight: 20, paddingBottom: 12, borderBottom: `2pt solid ${GREEN}` },
  logo: { position: "absolute", left: 0, top: 0, width: 68, height: 18, objectFit: "contain" },
  heading: { width: "100%", textAlign: "center" },
  chamber: { fontFamily: "Helvetica-Bold", color: NAVY, fontSize: 10, lineHeight: 1.4 },
  title: { marginTop: 14, marginBottom: 14, fontFamily: "Helvetica-Bold", fontSize: 18, color: NAVY, textAlign: "center" },
  date: { textAlign: "right", marginBottom: 16 },
  addressee: { fontFamily: "Helvetica-Bold", lineHeight: 1.5 },
  introduction: { marginTop: 6, marginBottom: 16, lineHeight: 1.5 },
  row: { borderBottom: BORDER, paddingTop: 7, paddingBottom: 8 },
  label: { fontFamily: "Helvetica-Bold", color: NAVY, fontSize: 10, lineHeight: 1.3 },
  value: { marginTop: 3, lineHeight: 1.35 },
  details: { borderTop: BORDER },
  instrumentDate: { marginTop: 7 },
  signatures: { flexDirection: "row", marginTop: 18, gap: 30 },
  signature: { flex: 1, minHeight: 90 },
  signatureHeading: { fontFamily: "Helvetica-Bold", color: NAVY, lineHeight: 1.5, minHeight: 15 },
  signatureSubheading: { marginTop: 8, lineHeight: 1.5 },
  submitterName: { marginTop: 8, fontSize: 9, lineHeight: 1.4 },
  signatureStampSlot: { height: 45, justifyContent: "flex-start" },
  submitterStamp: { alignSelf: "center", marginTop: 8 },
  submitterSignatureLine: { borderBottom: BORDER, paddingBottom: 3, fontSize: 9, lineHeight: 1.4 },
  signatureLine: { borderBottom: BORDER, marginTop: 8 },
  signatureLabel: { marginTop: 7, fontSize: 9 },
});

/** Explicit line breaks keep long, unspaced identifiers inside the page without
 * adding visible hyphens that could be mistaken for part of an instrument No. */
function printableText(value: string, maxTokenLength = 48): string {
  return value.replace(/\S+/gu, (token) => {
    const characters = Array.from(token);
    if (characters.length <= maxTokenLength) return token;
    const lines: string[] = [];
    for (let offset = 0; offset < characters.length; offset += maxTokenLength) {
      lines.push(characters.slice(offset, offset + maxTokenLength).join(""));
    }
    return lines.join("\n");
  });
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      {/* One text block lets orphan protection keep the label with the first
          value line while long values continue naturally onto later pages. */}
      <Text style={styles.value} orphans={2} widows={2} hyphenationCallback={(word) => [word]}>
        <Text style={styles.label}>{label}{"\n"}</Text>
        {printableText(value)}
      </Text>
    </View>
  );
}

/** Printable paper-form foundation only. Receipt and signature areas remain
 * blank: rendering a memo is not submission, acknowledgement or approval. */
export function ForwardingMemoDocument({
  data,
  logoDataUrl,
}: {
  data: ForwardingMemoInput;
  logoDataUrl?: string;
}) {
  const mode = data.instrumentMode === "CHEQUE" ? "Cheque" : "D.D.";
  return (
    <Document title="Forwarding Memo" author="MCCIA" language="en-IN">
      <Page size="A4" style={styles.page}>
        <View style={styles.masthead} wrap={false}>
          {logoDataUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no HTML alt prop.
            <Image src={logoDataUrl} style={styles.logo} />
          ) : null}
          <View style={styles.heading}>
            <Text style={styles.chamber}>Mahratta Chamber of Commerce, Industries and Agriculture</Text>
          </View>
        </View>
        <Text style={styles.title}>Forwarding Memo</Text>
        <Text style={styles.date}>Date : {formatDateOnly(data.memoDate)}</Text>
        <View wrap={false}>
          <Text style={styles.addressee}>To{"\n"}The Chief Accountant</Text>
          <Text style={styles.introduction}>
            Please accept the enclosed Cheque / D. D. and issue a receipt as per the details given below :-
          </Text>
        </View>

        <View style={styles.details}>
          <Detail label="Name & Address of the Party" value={`${data.partyName}\n${data.partyAddress}`} />
          <Detail label="Purpose (in details)" value={data.purpose} />
          <Detail
            label="Against our Bill No. / Date"
            value={`${data.billNo || "____________________"} / ${data.billDate ? formatDateOnly(data.billDate) : "____________________"}`}
          />
          <View style={styles.row}>
            <Text style={styles.value} orphans={2} widows={2} hyphenationCallback={(word) => [word]}>
              <Text style={styles.label}>Mode : Cheque / D.D. No.{"\n"}</Text>
              {mode} : {printableText(data.instrumentNo)}
            </Text>
            <Text style={styles.instrumentDate}>Dt. : {formatDateOnly(data.instrumentDate)}</Text>
          </View>
          <Detail label="Drawn on (name of bank)" value={data.drawnOnBank} />
          <Detail label="Amount — for Rs." value={data.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
        </View>

        <View style={styles.signatures} wrap={false}>
          <View style={styles.signature}>
            <Text style={styles.signatureHeading}>Received the above instrument</Text>
            <Text style={styles.signatureSubheading}>for Accounts Department</Text>
            <View style={styles.signatureStampSlot} />
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Signature</Text>
          </View>
          <View style={styles.signature}>
            <Text style={styles.signatureHeading}>Submitted by</Text>
            <Text style={styles.submitterName} hyphenationCallback={(word) => [word]}>{printableText(data.submittedByName, 24)}</Text>
            <View style={styles.signatureStampSlot}>
              <View style={styles.submitterStamp}>
                <Stamp inFlow label="SUBMITTED" name={data.submittedByName} date={formatDateOnly(data.memoDate)} color="navy" />
              </View>
            </View>
            <Text style={styles.submitterSignatureLine}>Name &amp; Signature</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
