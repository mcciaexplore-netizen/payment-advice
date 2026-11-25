"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { todayInIst } from "@/lib/date-time";
import { directoryAmount, directoryItems, directoryProblem, toggleDirectory, updateDirectoryEntry, type DirectoryEntry, type DirectorySelection } from "@/lib/cash-receipt-directories";
import { DirectoryChecklist, DirectoryRows } from "@/components/form/DirectoryPicker";

const PARTICULARS = [
  "Sale of Directory",
  "Sale of Safety Material",
  "Sampada / Casual Sale",
  "Computer Printout / Xerox",
  "Hall Hiring Charges",
  "Course / Seminar Fee",
  "Others (Specify)",
] as const;

type ReceiptLine = {
  id: number;
  particulars: string;
  detail: string;
  courseName: string;
  /** The directories ticked on a Sale of Directory row; each becomes its own receipt line. */
  directories: DirectorySelection;
  copies: string;
  price: string;
  billNo: string;
  billDate: string;
};

const blankLine = (id: number): ReceiptLine => ({
  id, particulars: "", detail: "", courseName: "", directories: {}, copies: "", price: "", billNo: "", billDate: "",
});

function lineAmount(line: ReceiptLine) {
  if (line.particulars === "Sale of Directory") return directoryAmount(line.directories);
  const price = Number(line.price) || 0;
  return line.particulars === "Hall Hiring Charges" ? price : (Number(line.copies) || 0) * price;
}

const inputClass = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-[#152235] focus:border-[#0b1f3a] focus:outline-none focus:ring-1 focus:ring-[#0b1f3a]";

export function CashReceiptForm({ branch, issuedBy }: { branch: string; issuedBy: string }) {
  const router = useRouter();
  const [partyName, setPartyName] = useState("");
  const [gstin, setGstin] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([blankLine(1)]);
  const [nextId, setNextId] = useState(2);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const total = useMemo(
    () => lines.reduce((sum, line) => sum + lineAmount(line), 0),
    [lines],
  );

  function updateLine(id: number, field: keyof Omit<ReceiptLine, "id" | "directories">, value: string) {
    setLines((current) => current.map((line) => {
      if (line.id !== id) return line;
      let updated = { ...line, [field]: value };
      // Changing the particulars starts the row afresh (no directories ticked).
      if (field === "particulars") {
        updated = { ...updated, directories: {}, courseName: "", price: "" };
      }
      return updated;
    }));
  }

  function toggleLineDirectory(id: number, label: string, ticked: boolean) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, directories: toggleDirectory(line.directories, label, ticked) } : line)));
  }

  function changeLineDirectory(id: number, label: string, field: keyof DirectoryEntry, value: string) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, directories: updateDirectoryEntry(line.directories, label, field, value) } : line)));
  }

  function addLine() {
    if (lines.length >= 20) return;
    setLines((current) => [...current, blankLine(nextId)]);
    setNextId((value) => value + 1);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    // A Sale of Directory row needs at least one ticked directory, with copies (and a
    // Member ID for a member directory) for each.
    const directoryError = lines.map((line) => (line.particulars === "Sale of Directory" ? directoryProblem(line.directories) : null)).find(Boolean);
    if (directoryError) {
      setError(directoryError);
      return;
    }
    const hasPartialLine = lines.some((line) => {
      if (line.particulars === "Sale of Directory") return false; // checked above
      const hasAnyValue = line.particulars || line.copies || line.price || line.courseName.trim();
      const isHallHiring = line.particulars === "Hall Hiring Charges";
      const courseInfoMissing = line.particulars === "Course / Seminar Fee" && !line.courseName.trim();
      return (hasAnyValue && (!line.particulars || (!isHallHiring && Number(line.copies) <= 0) || Number(line.price) <= 0)) || courseInfoMissing;
    });
    if (hasPartialLine) {
      setError("Complete the particulars, required details, and price for each row, or leave the row empty.");
      return;
    }
    // One receipt line per row, except Sale of Directory: one per ticked directory.
    const items = lines.flatMap((line) => {
      if (line.particulars === "Sale of Directory") return directoryItems(line.directories).map((item) => ({ ...item, billNo: "", billDate: "" }));
      const filled = line.particulars && (line.particulars === "Hall Hiring Charges" || Number(line.copies) > 0) && Number(line.price) > 0;
      if (!filled) return [];
      return [{
        particulars: line.particulars === "Others (Specify)" && line.detail.trim()
          ? `${line.particulars}: ${line.detail.trim()}`
          : line.particulars === "Course / Seminar Fee" && line.courseName.trim()
            ? `${line.particulars}: ${line.courseName.trim()}`
            : line.particulars,
        copies: line.particulars === "Hall Hiring Charges" ? 1 : Number(line.copies),
        price: Number(line.price),
        billNo: line.billNo,
        billDate: line.billDate,
      }];
    });
    if (!items.length) {
      setError("Add at least one particulars row with a price.");
      return;
    }
    if (items.length > 20) {
      setError("A receipt can have at most 20 lines. Each ticked directory counts as one line; split this into two receipts.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/cash-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyName,
          gstin,
          items,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not save the receipt.");
        return;
      }
      router.push(`/cash-receipt/${data.id}`);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-5">
      <div className="flex items-center gap-4"><Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-12 w-auto" /><div><h1 className="font-heading text-2xl text-[#0b1f3a]">Cash Receipt</h1><p className="text-sm text-gray-600">{branch}</p></div></div>
      <div className="flex items-center gap-4 text-sm text-gray-600"><span>{issuedBy}</span><button type="button" onClick={async () => { await fetch("/api/cash-receipt/logout", { method: "POST" }); router.replace("/cash-receipt/login"); router.refresh(); }} className="text-[#0b1f3a] underline">Sign out</button></div>
    </header>
    <form onSubmit={submit} className="space-y-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap justify-between gap-4 text-sm"><p className="font-medium text-[#0b1f3a]">Receipt No.: <span className="text-gray-500">Assigned on saving</span></p><p className="font-medium text-[#0b1f3a]">Date: <span className="text-gray-700">{todayInIst()}</span></p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-[#0b1f3a]">M/s - Party Name<input required value={partyName} onChange={(event) => setPartyName(event.target.value)} className={`${inputClass} mt-1 font-normal`} /></label>
        <label className="text-sm font-medium text-[#0b1f3a]">GSTIN (optional)<input value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase())} maxLength={15} className={`${inputClass} mt-1 font-normal`} /></label>
      </div>
      <div className="overflow-x-auto rounded-md border border-gray-300">
        <table className="w-full min-w-[740px] border-collapse text-sm">
          <thead className="bg-gray-100 text-[#0b1f3a]"><tr><th className="w-[50%] border-b border-r border-gray-300 px-3 py-3 text-left">Particulars</th><th className="w-[14%] border-b border-r border-gray-300 px-3 py-3 text-left">Copies</th><th className="w-[16%] border-b border-r border-gray-300 px-3 py-3 text-left">Price</th><th className="w-[20%] border-b border-gray-300 px-3 py-3 text-right">Amount (Rs.)</th></tr></thead>
          <tbody>
            {lines.map((line) => {
              const isHallHiring = line.particulars === "Hall Hiring Charges";
              const isDirectory = line.particulars === "Sale of Directory";
              const amount = lineAmount(line);
              return <Fragment key={line.id}><tr>
                <td className="border-b border-r border-gray-300 p-2">
                  <select aria-label="Particulars" value={line.particulars} onChange={(event) => updateLine(line.id, "particulars", event.target.value)} className={inputClass}>
                    <option value="">Select particulars</option>
                    {PARTICULARS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  {isDirectory ? <DirectoryChecklist selection={line.directories} onToggle={(label, ticked) => toggleLineDirectory(line.id, label, ticked)} /> : null}
                  {line.particulars === "Others (Specify)" ? <input aria-label="Specify other particulars" placeholder="Specify" value={line.detail} onChange={(event) => updateLine(line.id, "detail", event.target.value)} className="mt-2 w-full border-b border-gray-400 px-1 py-1 text-sm outline-none" /> : null}
                  {line.particulars === "Course / Seminar Fee" ? <input aria-label="Course or seminar name" required maxLength={200} placeholder="Course / seminar name" value={line.courseName} onChange={(event) => updateLine(line.id, "courseName", event.target.value)} className="mt-2 w-full border-b border-gray-400 px-1 py-1 text-sm outline-none" /> : null}
                  {line.particulars === "Hall Hiring Charges" ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><label>Bill No. <input value={line.billNo} onChange={(event) => updateLine(line.id, "billNo", event.target.value)} className="w-24 border-b border-gray-400 px-1 py-1 outline-none" /></label><label>Date <input type="date" value={line.billDate} onChange={(event) => updateLine(line.id, "billDate", event.target.value)} className="border-b border-gray-400 px-1 py-1 outline-none" /></label></div> : null}
                </td>
                {isDirectory ? <td colSpan={3} className="border-b border-gray-300 px-3 py-2 text-xs text-gray-500">Enter the copies for each ticked directory in the lines below.</td> : <>
                <td className="border-b border-r border-gray-300 p-2">{isHallHiring ? <input aria-label="Copies" type="text" value="" disabled tabIndex={-1} className={`${inputClass} cursor-not-allowed bg-gray-100`} /> : <input aria-label="Copies" type="number" min="1" step="1" value={line.copies} onChange={(event) => updateLine(line.id, "copies", event.target.value)} className={inputClass} />}</td>
                <td className="border-b border-r border-gray-300 p-2"><input aria-label="Price" type="number" min="0.01" step="0.01" value={line.price} onChange={(event) => updateLine(line.id, "price", event.target.value)} className={`${inputClass} read-only:bg-gray-100`} /></td>
                <td className="border-b border-gray-300 px-3 py-2 text-right">{amount ? amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}</td>
                </>}
              </tr>{isDirectory ? <DirectoryRows selection={line.directories} onChange={(label, field, value) => changeLineDirectory(line.id, label, field, value)} /> : null}</Fragment>;
            })}
            <tr className="bg-gray-50 font-semibold"><td colSpan={3} className="border-r border-gray-300 px-3 py-3 text-right">Total</td><td className="px-3 py-3 text-right">{total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={lines.length >= 20} onClick={addLine} className="rounded-md border border-[#0b1f3a] px-4 py-2 text-sm font-medium text-[#0b1f3a] disabled:opacity-50">+ Add Particular</button>{lines.length > 1 ? <button type="button" onClick={() => setLines((current) => current.slice(0, -1))} className="text-sm text-gray-600 underline">Remove last row</button> : null}</div>
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-3"><Link href="/" className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-[#0b1f3a]">Cancel</Link><button disabled={saving} className="rounded-md bg-[#0b1f3a] px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving…" : "Save & Print Receipt"}</button></div>
    </form>
  </main>;
}
