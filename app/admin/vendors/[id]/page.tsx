import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendorBankAccounts, vendors } from "@/lib/db/schema";
import { VendorForm } from "@/components/admin/VendorForm";
import { BackLink } from "@/components/admin/BackLink";
import { VendorBankAccountsAdmin } from "@/components/admin/VendorBankAccountsAdmin";

export const dynamic = "force-dynamic";

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  if (!vendor) notFound();

  const bankAccounts = await db
    .select()
    .from(vendorBankAccounts)
    .where(eq(vendorBankAccounts.vendorId, id))
    .orderBy(desc(vendorBankAccounts.lastUsedAt));

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <div className="flex flex-col gap-6">
        <BackLink label="Back to Vendors" fallbackHref="/admin/vendors" />
        <h1 className="font-heading text-3xl text-[#0b1f3a]">Edit Vendor</h1>
        <VendorForm
          vendorId={vendor.id}
          initialValues={{
            companyName: vendor.companyName,
            contactPerson: vendor.contactPerson ?? undefined,
            contactPhone: vendor.contactPhone ?? undefined,
            address: vendor.address ?? undefined,
            email: vendor.email ?? undefined,
            gstin: vendor.gstin ?? undefined,
            udyamNumber: vendor.udyamNumber ?? undefined,
            isMsme: vendor.isMsme,
            isActive: vendor.isActive,
          }}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-xl text-[#0b1f3a]">Saved Bank Accounts</h2>
        <p className="text-sm text-gray-500">
          Captured automatically from previous submissions for this vendor. By default every account is
          visible to any submitter who selects this vendor - restrict an account to specific submitter
          emails below if it should only be usable by one or a few people (e.g. an individual payee whose
          payments only one person handles).
        </p>
        <VendorBankAccountsAdmin accounts={bankAccounts} />
      </div>
    </div>
  );
}
