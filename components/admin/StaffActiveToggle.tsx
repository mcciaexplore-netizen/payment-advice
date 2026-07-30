"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StaffActiveToggle({
  staffId,
  isActive,
}: {
  staffId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function toggle(force = false) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive, force }),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        setSubmitting(false);
        if (data?.error && window.confirm(`${data.error}\n\nDeactivate anyway?`)) {
          await toggle(true);
        }
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => toggle()}
      disabled={submitting}
      className="font-medium text-gray-600 hover:underline disabled:opacity-50"
    >
      {isActive ? "Deactivate" : "Activate"}
    </button>
  );
}
