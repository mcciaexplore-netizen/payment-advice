import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StageBadge } from "@/components/admin/StageBadge";
import { NewSubmissionLink } from "@/components/account/NewSubmissionLink";

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("dashboard header at phone width", () => {
  it("the Authority / Team header wraps like the Finance one instead of overlapping", () => {
    const layout = source("app/authority/layout.tsx");
    expect(layout).toContain("flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3");
    // The longer "Authority Recommendations" title may wrap on a phone, never overflow.
    expect(layout).toContain('<Link href="/authority" className="flex min-w-0 items-center gap-3">');
    expect(layout).toContain('className="font-heading text-base text-white sm:text-lg"');
    expect(layout).toContain('className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"');
    expect(source("app/admin/layout.tsx")).toContain("flex-wrap items-center justify-between gap-x-6 gap-y-3");
  });

  it("+ New Submission never breaks inside the button", () => {
    expect(renderToStaticMarkup(<NewSubmissionLink />)).toContain('class="whitespace-nowrap rounded-md');
  });
});

describe("StageBadge", () => {
  it("shows the short label by default (Finance and other tables unchanged) and a given label with the same colors", () => {
    expect(renderToStaticMarkup(<StageBadge stage="Received & In Process" />)).toContain(">In Process</span>");
    const custom = renderToStaticMarkup(<StageBadge stage="Received & In Process" label="Received & In Process" />);
    expect(custom).toContain(">Received &amp; In Process</span>");
    expect(custom).toContain("bg-blue-100");
  });
});
