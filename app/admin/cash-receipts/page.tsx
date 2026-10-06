import { CashReceiptsSection } from "@/components/admin/CashReceiptsSection";

export const dynamic = "force-dynamic";

export default async function CashReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-600">Every receipt issued across all branches, newest first.</p>
      <CashReceiptsSection searchParams={sp} baseHref="/admin/cash-receipts" />
    </div>
  );
}
