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

/** Whether refunds go through the recommending authority (recommend or send
 * back, with emails, the Recommended stamp and statuses). It needs migration
 * 0032 (the refund_request_reviews table), which the owner applies, so it is
 * off until REFUND_RECOMMENDATION_ENABLED=true; with it off, refunds behave
 * exactly as before and nothing reads that table. */
export function refundRecommendationEnabled(): boolean {
  return refundRequestsEnabled() && process.env.REFUND_RECOMMENDATION_ENABLED === "true";
}
