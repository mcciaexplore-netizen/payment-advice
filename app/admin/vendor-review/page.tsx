import { redirect } from "next/navigation";

/** Vendor Review was merged into the Vendor Addition Requests page as its
 * "Historical Review" tab (2026-10-07) - kept as a redirect, not removed
 * outright, so bookmarks and any old links into this URL still land
 * somewhere real instead of 404ing. Runs behind the same proxy.ts session
 * gate every other /admin/* route does, so an unauthenticated hit here
 * still goes to /admin/login first. */
export default function VendorReviewRedirectPage() {
  redirect("/admin/vendor-requests?tab=review");
}
