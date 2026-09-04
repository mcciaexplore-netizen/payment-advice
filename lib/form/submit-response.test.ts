import { describe, expect, it } from "vitest";
import { readSubmitResponse } from "@/lib/form/submit-response";

describe("readSubmitResponse", () => {
  it("recognizes a non-JSON 413 response without throwing", async () => {
    const result = await readSubmitResponse(
      new Response("Request Entity Too Large", { status: 413, headers: { "content-type": "text/html" } }),
    );
    expect(result).toEqual({ data: {}, sizeError: true });
  });

  it("preserves a normal JSON API error", async () => {
    const result = await readSubmitResponse(
      Response.json({ error: "Invalid form data" }, { status: 400 }),
    );
    expect(result).toEqual({ data: { error: "Invalid form data" }, sizeError: false });
  });
});
