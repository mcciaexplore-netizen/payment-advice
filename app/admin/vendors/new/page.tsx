import { VendorForm } from "@/components/admin/VendorForm";
import { BackLink } from "@/components/admin/BackLink";

export default function NewVendorPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <BackLink label="Back to Vendors" fallbackHref="/admin/vendors" />
      <h1 className="font-heading text-3xl text-[#0b1f3a]">New Vendor</h1>
      <VendorForm />
    </div>
  );
}
