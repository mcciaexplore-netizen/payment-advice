"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthorityActiveToggle } from "@/components/admin/AuthorityActiveToggle";

type Authority = { id: string; authorityName: string; email: string | null; isActive: boolean };

type FormMode = { type: "create" } | { type: "edit"; authority: Authority };

function AuthorityInlineForm({
  mode,
  onDone,
  onCancel,
}: {
  mode: FormMode;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const isEdit = mode.type === "edit";
  const [authorityName, setAuthorityName] = useState(isEdit ? mode.authority.authorityName : "");
  const [email, setEmail] = useState((isEdit ? mode.authority.email : "") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(force = false) {
    setError(null);
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/admin/authorities/${mode.authority.id}` : "/api/admin/authorities";
      const body: Record<string, unknown> = { authorityName, email: email || undefined };
      if (isEdit) body.isActive = mode.authority.isActive;
      if (force) body.force = true;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.inProgressCount !== undefined) {
          setSubmitting(false);
          if (window.confirm(`${data.error}\n\nSave anyway?`)) {
            await submit(true);
          }
          return;
        }
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-gray-50 p-4"
    >
      {isEdit ? (
        <p className="w-full text-xs leading-relaxed text-amber-700">
          Only edit this for spelling/formatting fixes. Renaming will retroactively change the
          name shown on all past PDFs and approval pages for this authority. If someone new has
          taken over this role, deactivate this record and create a new one instead.
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">Name</label>
        <input
          type="text"
          required
          value={authorityName}
          onChange={(e) => setAuthorityName(e.target.value)}
          className="admin-filter-input w-56"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">E-mail (optional)</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="admin-filter-input w-56"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
      >
        Cancel
      </button>
      {error ? <p className="w-full text-sm font-medium text-[#b3261e]">{error}</p> : null}
    </form>
  );
}

export function AuthoritiesSection({ authorities }: { authorities: Authority[] }) {
  const [formMode, setFormMode] = useState<FormMode | null>(null);

  return (
    <>
      {formMode ? (
        <AuthorityInlineForm
          mode={formMode}
          onDone={() => setFormMode(null)}
          onCancel={() => setFormMode(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setFormMode({ type: "create" })}
          className="w-fit rounded-md border border-[#0b1f3a] px-4 py-2 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
        >
          New Authority
        </button>
      )}
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[500px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {authorities.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No recommending authorities yet.
                </td>
              </tr>
            ) : (
              authorities.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-[#0b1f3a]">{a.authorityName}</td>
                  <td className="px-4 py-3">{a.email ?? "—"}</td>
                  <td className="px-4 py-3">{a.isActive ? "Active" : "Inactive"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setFormMode({ type: "edit", authority: a })}
                      className="mr-4 font-medium text-[#0b1f3a] hover:underline"
                    >
                      Edit
                    </button>
                    <AuthorityActiveToggle authorityId={a.id} isActive={a.isActive} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
