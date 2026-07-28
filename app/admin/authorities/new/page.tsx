import { AuthorityForm } from "@/components/admin/AuthorityForm";

export default function NewAuthorityPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="font-heading text-3xl text-[#0b1f3a]">New Recommending Authority</h1>
      <AuthorityForm />
    </div>
  );
}
