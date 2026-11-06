import type { Metadata } from "next";
import { PublicSubmissionPage } from "@/components/public/PublicSubmissionPage";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reimbursement" };
export default function Page() { return <PublicSubmissionPage type="reimbursement" />; }
