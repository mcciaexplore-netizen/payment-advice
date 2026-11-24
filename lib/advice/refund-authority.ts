import { sql, type SQL } from "drizzle-orm";
import { recommendingAuthorities, refundRequests } from "@/lib/db/schema";

/** The refund requests that name a given recommending authority, for that
 * authority's own dashboard (read only).
 *
 * A refund stores its recommending authority as the text typed or picked on
 * the form, not as a link to the authority row, so the match is on the name:
 * case-insensitive and ignoring extra spaces (the authority list has names
 * such as "RAJNIKANT  GAIKWAD" with a double space). The authority's name
 * always comes from the signed-in account's own authority record on the
 * server, never from the URL, so one authority can never ask for another's
 * refunds. */
export function refundsForAuthorityWhere(authorityName: string): SQL {
  return sql`lower(regexp_replace(btrim(${refundRequests.recommendingAuthority}), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim(${authorityName}), '\\s+', ' ', 'g'))`;
}

/** The other direction: the authority record a refund's typed authority name
 * refers to (same case and extra-space tolerance), to find where to email. */
export function authorityNamedWhere(refundAuthorityText: string): SQL {
  return sql`lower(regexp_replace(btrim(${recommendingAuthorities.authorityName}), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim(${refundAuthorityText}), '\\s+', ' ', 'g'))`;
}
