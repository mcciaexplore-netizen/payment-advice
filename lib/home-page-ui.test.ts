import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/public/PublicLoginMenu", () => ({ PublicLoginMenu: () => null }));

import PaymentDeskPage from "../app/page";
import { NSW_BRANCH_LOGIN_URL } from "@/lib/external-links";

/** Renders the home page as production would, with the Refund flag off or on. */
function render(flag: boolean) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("REFUND_REQUESTS_ENABLED", flag ? "true" : "");
  const html = renderToStaticMarkup(createElement(PaymentDeskPage));
  // Attribute order is not guaranteed, so read href and class separately.
  const cards = [...html.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)]
    .filter((match) => match[2].includes("<h3"))
    .map((match) => ({
      href: /href="([^"]+)"/.exec(match[1])![1],
      classes: /class="([^"]*)"/.exec(match[1])![1].split(" "),
      title: /<h3[^>]*>([^<]+)<\/h3>/.exec(match[2])![1],
      markup: match[0],
    }));
  return { html, cards };
}
const spans = (card: { classes: string[] }) => card.classes.filter((name) => /^(sm|lg):col-span-/.test(name)).join(" ");

const NSW = "National Safety Week - Branch Login";

describe("Payment Desk home page cards (compact, fits a laptop screen)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("flag on: owner order, two full rows of three on desktop, then the National Safety Week bar full width", () => {
    const { cards } = render(true);
    expect(cards.map((card) => card.title)).toEqual(["Payment Advice", "Cash Payment Voucher", "Advance Payment Form", "Refund", "Cash Receipt", "Forwarding Memo", NSW]);
    expect(cards.map(spans)).toEqual(["", "", "", "", "", "sm:col-span-1 lg:col-span-1", "sm:col-span-2 lg:col-span-3"]);
  });

  it("flag off: no Refund, Forwarding Memo before Cash Receipt, Cash Receipt spans the gap (2 of 3 desktop columns, full tablet row), then the bar", () => {
    const { cards, html } = render(false);
    expect(cards.map((card) => card.title)).toEqual(["Payment Advice", "Cash Payment Voucher", "Advance Payment Form", "Forwarding Memo", "Cash Receipt", NSW]);
    expect(cards.map(spans)).toEqual(["", "", "", "", "sm:col-span-2 lg:col-span-2", "sm:col-span-2 lg:col-span-3"]);
    expect(html).not.toContain('href="/refund"');
  });

  it("uses 1 column on mobile, 2 from 640px, 3 from 1024px", () => {
    expect(render(true).html).toContain('class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"');
  });

  it("compact cards: one-line title, description clamped to 2 lines, accent bar and Open form kept", () => {
    const { cards } = render(true);
    for (const card of cards.slice(0, 6)) {
      expect(card.markup).toContain('<h3 class="truncate font-heading text-lg');
      expect(card.markup).toContain("line-clamp-2");
      expect(card.markup).toMatch(/<span class="mb-3 block h-1\.5 w-12 rounded-full[^"]*bg-/);
      expect(card.markup).toContain("Open form →");
      expect(card.classes).toContain("p-4");
    }
  });

  it("shortens only the two long descriptions, keeping the meaning", () => {
    const { cards } = render(true);
    const description = (title: string) => /<p[^>]*>([^<]+)<\/p>/.exec(cards.find((card) => card.title === title)!.markup)![1];
    expect(description("Forwarding Memo")).toBe("For forwarding cheques, demand drafts, and other instruments to Accounts.");
    expect(description("Refund")).toBe("Request a refund with payee, amount, bank details, and documents.");
    expect(description("Payment Advice")).toBe("For payments made by NEFT to a vendor or beneficiary.");
    expect(description("Cash Payment Voucher")).toBe("For cash reimbursements paid directly to the submitter.");
    expect(description("Advance Payment Form")).toBe("For money needed before travel, events, or other planned expenses.");
    expect(description("Cash Receipt")).toBe("Create and print branch-numbered receipts for cash received.");
  });

  it("National Safety Week is a slim single-row bar: same link (same tab), rose accent, title left, Open portal right", () => {
    expect(NSW_BRANCH_LOGIN_URL).toBe("https://nsw-web.vercel.app/select-branch");
    const bar = render(true).cards.at(-1)!;
    expect(bar.href).toBe(NSW_BRANCH_LOGIN_URL);
    expect(bar.markup).not.toContain("target=");
    expect(bar.classes).toEqual(expect.arrayContaining(["flex", "items-center", "py-3", "border-rose-300", "hover:border-rose-600"]));
    expect(bar.markup).toContain("bg-rose-600");
    expect(bar.markup.indexOf("<h3")).toBeLessThan(bar.markup.indexOf("Open portal →"));
    expect(bar.markup).toContain("Branch login for the National Safety Week portal.");
  });

  it("keeps every form link and accent colour", () => {
    const { cards } = render(true);
    const byTitle = Object.fromEntries(cards.map((card) => [card.title, card]));
    expect(byTitle["Payment Advice"].href).toBe("/payment-advice");
    expect(byTitle["Cash Payment Voucher"].href).toBe("/cash-voucher");
    expect(byTitle["Advance Payment Form"].href).toBe("/advance");
    expect(byTitle["Refund"].href).toBe("/refund");
    expect(byTitle["Cash Receipt"].href).toBe("/cash-receipt");
    expect(byTitle["Forwarding Memo"].href).toBe("/forwarding-memo");
    expect(byTitle["Payment Advice"].markup).toContain("bg-[#2e8b57]");
    expect(byTitle["Cash Payment Voucher"].markup).toContain("bg-[#e8a33d]");
    expect(byTitle["Advance Payment Form"].markup).toContain("bg-violet-600");
    expect(byTitle["Refund"].markup).toContain("bg-teal-600");
    expect(byTitle["Cash Receipt"].markup).toContain("bg-sky-600");
    expect(byTitle["Forwarding Memo"].markup).toContain("bg-[#2e8b57]");
  });
});
