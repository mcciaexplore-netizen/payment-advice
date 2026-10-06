"use client";

export function PrintButton() {
  return <button onClick={() => window.print()} className="rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white">Print / Save as PDF</button>;
}
