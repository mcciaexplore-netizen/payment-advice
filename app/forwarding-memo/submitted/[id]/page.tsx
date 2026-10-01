import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { forwardingMemos } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function ForwardingMemoSubmittedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [memo] = await db
    .select({ serialNo: forwardingMemos.serialNo })
    .from(forwardingMemos)
    .where(eq(forwardingMemos.id, id))
    .limit(1);
  if (!memo) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <section className="space-y-4 text-center">
        <p className="text-sm font-medium text-[#2e8b57]">Forwarding Memo submitted</p>
        <h1 className="font-heading text-4xl text-[#0b1f3a]">{memo.serialNo}</h1>
        <p className="text-gray-600">Your forwarding memo was saved successfully.</p>
      </section>
      <div className="flex flex-wrap justify-center gap-3">
        <a
          href={`/api/forwarding-memo/${id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-[#0b1f3a] px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-[#0b1f3a]/90"
        >
          Open printable memo
        </a>
        <a
          href={`/api/forwarding-memo/${id}/pdf?download=1`}
          download
          className="rounded-md border border-[#0b1f3a] px-6 py-3 text-base font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
        >
          Download PDF
        </a>
        <Link
          href="/forwarding-memo"
          className="rounded-md border border-[#0b1f3a] px-6 py-3 text-base font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
        >
          Submit another memo
        </Link>
      </div>
    </main>
  );
}
