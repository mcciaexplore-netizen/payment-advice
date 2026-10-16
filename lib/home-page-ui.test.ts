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
  const cards = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>.*?<h3[^>]*>([^<]+)<\/h3>.*?<\/a>/g)]
    .map((match) => ({ href: match[1], title: match[2], markup: match[0], wide: /class="[^"]*sm:col-span-2/.test(match[0]) }));
  return { html, cards };
}

const FORMS = ["Payment Advice", "Cash Payment Voucher", "Advance Payment Form", "Forwarding Memo", "Cash Receipt"];
const NSW = "National Safety Week - Branch Login";

describe("Payment Desk home page cards", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("flag on: 7 cards in order, Refund after Cash Receipt, National Safety Week last and full width, the six forms in three even rows", () => {
    const { cards } = render(true);
    expect(cards.map((card) => card.title)).toEqual([...FORMS, "Refund", NSW]);
    expect(cards.map((card) => card.wide)).toEqual([false, false, false, false, false, false, true]);
  });

  it("gives Refund its own teal accent, distinct from Cash Receipt's sky blue beside it", () => {
    const { cards } = render(true);
    const refund = cards.find((card) => card.title === "Refund")!;
    const cashReceipt = cards.find((card) => card.title === "Cash Receipt")!;
    expect(refund.markup).toContain("bg-teal-600");
    expect(refund.markup).toContain("border-teal-300 hover:border-teal-600");
    expect(refund.markup).not.toContain("sky-");
    expect(cashReceipt.markup).toContain("bg-sky-600");
  });

  it("flag off: 6 cards, no Refund, the odd last form (Cash Receipt) spans its row, National Safety Week last and full width", () => {
    const { cards, html } = render(false);
    expect(cards.map((card) => card.title)).toEqual([...FORMS, NSW]);
    expect(cards.map((card) => card.wide)).toEqual([false, false, false, false, true, true]);
    expect(html).not.toContain('href="/refund"');
  });

  it("uses two columns from tablet width up and one per row on mobile, with no three-column step", () => {
    const { html } = render(true);
    expect(html).toContain('class="grid grid-cols-1 gap-5 sm:grid-cols-2"');
    expect(html).not.toContain("lg:grid-cols-3");
  });

  it("links the National Safety Week card to the exact portal URL, same tab, with its own copy and accent", () => {
    expect(NSW_BRANCH_LOGIN_URL).toBe("https://nsw-web.vercel.app/select-branch");
    const card = render(true).cards.at(-1)!;
    expect(card.href).toBe(NSW_BRANCH_LOGIN_URL);
    expect(card.markup).not.toContain("target=");
    expect(card.markup).toContain("Branch login for the National Safety Week portal.");
    expect(card.markup).toContain("Open portal →");
    expect(card.markup).toContain("bg-rose-600");
    expect(card.markup).toContain("border-rose-300 hover:border-rose-600");
  });

  it("keeps the form links, Open form CTA, and one shared card class list", () => {
    const { cards } = render(true);
    expect(cards.slice(0, 6).map((card) => card.href)).toEqual(["/payment-advice", "/cash-voucher", "/advance", "/forwarding-memo", "/cash-receipt", "/refund"]);
    for (const card of cards.slice(0, 6)) expect(card.markup).toContain("Open form →");
    const baseClass = (markup: string) => /class="([^"]+)"/.exec(markup)![1].split(" ")
      .filter((name) => !name.includes("border-[") && !/border-(sky|violet|rose|teal)-/.test(name) && name !== "sm:col-span-2").join(" ");
    for (const card of cards) expect(baseClass(card.markup)).toBe(baseClass(cards[0].markup));
  });
});
