import {
  DIRECTORIES,
  directoryNeedsMemberId,
  selectedDirectories,
  type DirectoryEntry,
  type DirectorySelection,
} from "@/lib/cash-receipt-directories";

const inputClass = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-[#152235] focus:border-[#0b1f3a] focus:outline-none focus:ring-1 focus:ring-[#0b1f3a]";
const money = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The directories to tick for a "Sale of Directory" row. Several can be ticked;
 * each becomes its own line on the receipt. */
export function DirectoryChecklist({ selection, onToggle }: { selection: DirectorySelection; onToggle: (label: string, ticked: boolean) => void }) {
  return (
    <fieldset className="mt-2 grid gap-1.5">
      <legend className="mb-1 text-xs text-gray-600">Tick every directory sold</legend>
      {DIRECTORIES.map((directory) => (
        <label key={directory.label} className="flex cursor-pointer items-center gap-2 text-sm text-[#152235]">
          <input
            type="checkbox"
            checked={directory.label in selection}
            onChange={(event) => onToggle(directory.label, event.target.checked)}
            className="h-4 w-4 accent-[#0b1f3a]"
          />
          <span>{directory.label}</span>
          <span className="text-xs text-gray-500">Rs. {directory.price}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** One table line for each ticked directory: its Member ID (member directories),
 * copies, fixed price and amount. Rendered straight after the Sale of
 * Directory row so the columns line up with the rest of the receipt. */
export function DirectoryRows({ selection, onChange }: { selection: DirectorySelection; onChange: (label: string, field: keyof DirectoryEntry, value: string) => void }) {
  return (
    <>
      {selectedDirectories(selection).map((directory) => {
        const entry = selection[directory.label];
        const amount = (Number(entry.copies) || 0) * Number(directory.price);
        return (
          <tr key={directory.label} className="bg-gray-50/60">
            <td className="border-b border-r border-gray-300 p-2 pl-6">
              <p className="text-sm font-medium text-[#0b1f3a]">{directory.label}</p>
              {directoryNeedsMemberId(directory.label) ? (
                <input
                  aria-label={`Member ID for ${directory.label}`}
                  required
                  maxLength={100}
                  placeholder="Member ID"
                  value={entry.memberNo}
                  onChange={(event) => onChange(directory.label, "memberNo", event.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              ) : null}
            </td>
            <td className="border-b border-r border-gray-300 p-2">
              <input
                aria-label={`Copies of ${directory.label}`}
                type="number"
                min="1"
                step="1"
                value={entry.copies}
                onChange={(event) => onChange(directory.label, "copies", event.target.value)}
                className={inputClass}
              />
            </td>
            <td className="border-b border-r border-gray-300 p-2">
              <input aria-label={`Price of ${directory.label}`} type="number" value={directory.price} readOnly className={`${inputClass} bg-gray-100`} />
            </td>
            <td className="border-b border-gray-300 px-3 py-2 text-right">{amount ? money(amount) : ""}</td>
          </tr>
        );
      })}
    </>
  );
}
