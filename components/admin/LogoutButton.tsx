"use client";

import { useRouter } from "next/navigation";

export function LogoutButton({
  endpoint = "/api/admin/logout",
  loginPath = "/admin/login",
  className = "hover:text-white",
}: {
  endpoint?: string;
  loginPath?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch(endpoint, { method: "POST" });
        router.push(loginPath);
        router.refresh();
      }}
      className={className}
    >
      Log out
    </button>
  );
}
