import { VendorForm } from "@/components/admin/VendorForm";

export default function NewVendorPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="font-heading text-3xl text-[#0b1f3a]">New Vendor</h1>
      <VendorForm />
    </div>
  );
}
