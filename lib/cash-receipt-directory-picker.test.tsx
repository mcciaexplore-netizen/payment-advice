import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DirectoryChecklist, DirectoryRows } from "@/components/form/DirectoryPicker";
import { DIRECTORIES, type DirectorySelection } from "@/lib/cash-receipt-directories";

const noop = () => undefined;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("DirectoryChecklist", () => {
  it("shows every directory with its price as a tick box, so several can be chosen", () => {
    const html = renderToStaticMarkup(<DirectoryChecklist selection={{}} onToggle={noop} />);
    expect(html.match(/type="checkbox"/g)).toHaveLength(DIRECTORIES.length);
    const page = text(html);
    expect(page).toContain("Tick every directory sold");
    for (const directory of DIRECTORIES) expect(page).toContain(`${directory.label} Rs. ${directory.price}`);
    expect(page).toContain("Electronics Directory - Member Rs. 600");
    expect(page).toContain("Electronics Directory - Non-member Rs. 1200");
    expect(html).not.toContain("checked");
  });

  it("marks as ticked exactly the directories in the selection", () => {
    const selection: DirectorySelection = {
      "Electronics Directory - Member": { copies: "1", memberNo: "M" },
      "Agriculture Directory": { copies: "1", memberNo: "" },
    };
    const html = renderToStaticMarkup(<DirectoryChecklist selection={selection} onToggle={noop} />);
    expect(html.match(/checked=""/g)).toHaveLength(2);
  });
});

describe("DirectoryRows", () => {
  const rows = (selection: DirectorySelection) =>
    renderToStaticMarkup(<table><tbody><DirectoryRows selection={selection} onChange={noop} /></tbody></table>);

  it("renders no lines when no directory is ticked", () => {
    expect(rows({})).not.toContain("<tr");
  });

  it("gives each ticked directory its own line with copies, its fixed price and the amount", () => {
    const html = rows({
      "Electronics Directory - Non-member": { copies: "2", memberNo: "" },
      "Agriculture Directory": { copies: "3", memberNo: "" },
    });
    expect(html.match(/<tr/g)).toHaveLength(2);
    const page = text(html);
    expect(page).toContain("Electronics Directory - Non-member");
    expect(page).toContain("2,400.00"); // 2 x 1200
    expect(page).toContain("1,500.00"); // 3 x 500
    expect(html).toContain('aria-label="Copies of Electronics Directory - Non-member"');
    const price = html.match(/<input[^>]*aria-label="Price of Electronics Directory - Non-member"[^>]*>/)?.[0] ?? "";
    expect(price).toContain('value="1200"');
    expect(price).toContain('readOnly=""'); // fixed: the cashier cannot change a directory's price
  });

  it("asks for a Member ID on the member directories only", () => {
    const html = rows({
      "Electronics Directory - Member": { copies: "1", memberNo: "M-45" },
      "Electronics Directory - Non-member": { copies: "1", memberNo: "" },
      "Defence Directory - Member": { copies: "1", memberNo: "" },
    });
    expect(html).toContain('aria-label="Member ID for Electronics Directory - Member"');
    expect(html).toContain('value="M-45"');
    expect(html).toContain('aria-label="Member ID for Defence Directory - Member"');
    expect(html).not.toContain("Member ID for Electronics Directory - Non-member");
    expect(html.match(/placeholder="Member ID"/g)).toHaveLength(2);
  });
});
