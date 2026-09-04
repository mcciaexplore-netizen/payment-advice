export const ATTACHMENT_SIZE_ERROR =
  "Your attachments are too large to submit — please compress them or contact Accounts for help.";

export async function readSubmitResponse(response: Response) {
  const text = await response.text();
  let data: Record<string, string | null> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, string | null>) : {};
  } catch {
    // Vercel/platform failures can return HTML or an empty body. The caller
    // still gets a status-aware message instead of a JSON parse exception.
  }
  return { data, sizeError: response.status === 413 };
}
