/** Feature flag for Refund requests. The table only exists once the owner
 * applies migration 0030, so saving is off everywhere until
 * REFUND_REQUESTS_ENABLED=true. That includes local development: dev and
 * prod share one database, so a local submit would be a production write.
 * Outside production the form stays reachable as a database-free preview. */
export function refundRequestsEnabled(): boolean {
  return process.env.REFUND_REQUESTS_ENABLED === "true";
}

/** Whether the home card and /refund page are shown: always in local
 * development (preview only while the flag is off), only with the flag in
 * production. */
export function refundEntryVisible(): boolean {
  return process.env.NODE_ENV !== "production" || refundRequestsEnabled();
}
