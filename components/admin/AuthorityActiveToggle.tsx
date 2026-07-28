"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthorityActiveToggle({
  authorityId,
  isActive,
}: {
  authorityId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function toggle() {
    setSubmitting(true);
    try {
      await fetch(`/api/admin/authorities/${authorityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={submitting}
      className="font-medium text-gray-600 hover:underline disabled:opacity-50"
    >
      {isActive ? "Deactivate" : "Activate"}
    </button>
  );
}
