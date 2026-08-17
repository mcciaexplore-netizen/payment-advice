import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";
import { VendorForm } from "@/components/admin/VendorForm";
import { BackLink } from "@/components/admin/BackLink";

export const dynamic = "force-dynamic";

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  if (!vendor) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
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
  );
}
