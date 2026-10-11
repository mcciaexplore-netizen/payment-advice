import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/public/PublicLoginMenu", () => ({ PublicLoginMenu: () => null }));

import PaymentDeskPage from "../app/page";
import { NSW_BRANCH_LOGIN_URL } from "@/lib/external-links";

const html = renderToStaticMarkup(createElement(PaymentDeskPage));
const cards = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>.*?<h3[^>]*>([^<]+)<\/h3>.*?<\/a>/g)].map((match) => ({ href: match[1], title: match[2], markup: match[0] }));

describe("Payment Desk home page cards", () => {
  it("shows six cards, with National Safety Week last, right after Cash Receipt", () => {
    expect(cards.map((card) => card.title)).toEqual([
      "Payment Advice",
      "Cash Payment Voucher",
      "Advance Payment Form",
      "Forwarding Memo",
      "Cash Receipt",
      "National Safety Week - Branch Login",
    ]);
  });

  it("links the National Safety Week card to the exact portal URL, same tab, with its own copy and accent", () => {
    expect(NSW_BRANCH_LOGIN_URL).toBe("https://nsw-web.vercel.app/select-branch");
    const card = cards[5];
    expect(card.href).toBe(NSW_BRANCH_LOGIN_URL);
    expect(card.markup).not.toContain("target=");
    expect(card.markup).toContain("Branch login for the National Safety Week portal.");
    expect(card.markup).toContain("Open portal →");
    expect(card.markup).toContain("bg-rose-600");
    expect(card.markup).toContain("border-rose-300 hover:border-rose-600");
  });

  it("leaves the other five cards' links and CTA unchanged, and shares one card class list", () => {
    expect(cards.slice(0, 5).map((card) => card.href)).toEqual(["/payment-advice", "/cash-voucher", "/advance", "/forwarding-memo", "/cash-receipt"]);
    for (const card of cards.slice(0, 5)) expect(card.markup).toContain("Open form →");
    const baseClass = (markup: string) => /class="([^"]+)"/.exec(markup)![1].split(" ").filter((name) => !name.includes("border-[") && !/border-(sky|violet|rose)-/.test(name)).join(" ");
    for (const card of cards) expect(baseClass(card.markup)).toBe(baseClass(cards[0].markup));
  });
});
