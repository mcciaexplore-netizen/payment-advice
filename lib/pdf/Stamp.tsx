import { StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Digital "stamp" overlay for a signature-box footer cell — a clean bordered
 * rectangle with a slight rotation for a stamped feel, not an attempt at
 * rough ink-texture artwork (unreliable in a generated PDF). Renders name +
 * date INSIDE the stamp itself, per the spec — never as separate text
 * elsewhere in the cell. Solid brand colors, same box style across all
 * three uses (Submitted/Approved/Verified), only the accent color differs.
 */
export type StampColor = "navy" | "green" | "amber";

const COLORS: Record<StampColor, { border: string; text: string }> = {
  navy: { border: "#0B1F3A", text: "#0B1F3A" },
  green: { border: "#2E8B57", text: "#2E8B57" },
  amber: { border: "#B8790C", text: "#B8790C" }, // darkened from the UI's #E8A33D for print legibility
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 3,
    right: 3,
  },
  box: {
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 4,
    width: 68,
    transform: "rotate(-6deg)",
  },
  label: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    letterSpacing: 0.4,
    textAlign: "center",
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 5.5,
    textAlign: "center",
    marginTop: 1,
  },
  date: {
    fontSize: 5,
    textAlign: "center",
    marginTop: 1,
  },
});

export function Stamp({
  label,
  name,
  date,
  color,
}: {
  label: string;
  name: string;
  date: string;
  color: StampColor;
}) {
  const { border, text } = COLORS[color];
  return (
    <View style={styles.wrapper}>
      <View style={[styles.box, { borderColor: border }]}>
        <Text style={[styles.label, { color: text }]}>{label}</Text>
        <Text style={[styles.name, { color: text }]}>{name}</Text>
        <Text style={[styles.date, { color: text }]}>{date}</Text>
      </View>
    </View>
  );
}
