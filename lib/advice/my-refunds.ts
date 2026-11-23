import { sql, type SQL } from "drizzle-orm";
import { refundRequests } from "@/lib/db/schema";

/** The refund requests a signed-in person submitted: matched on their login
 * email, case-insensitively (the form saves the email as typed, and the same
 * email they sign in with is what ties it to them, exactly as My Submissions
 * does for the other documents). Nobody's refunds are ever shown to anyone
 * else: this is the only scope the My Refunds tab uses, for every role. */
export function myRefundsWhere(accountEmail: string): SQL {
  return sql`lower(${refundRequests.submittedByEmail}) = lower(${accountEmail})`;
}
