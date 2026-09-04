"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/Input";

export default function AuthorityLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/authority/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) return setError(data.error ?? "Could not sign in.");
      router.push("/authority");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-10 w-auto" />
        <h1 className="font-heading text-2xl text-[#0b1f3a]">Authority Recommendations</h1>
        <p className="text-sm text-gray-600">Sign in to review submissions waiting for your decision.</p>
      </div>
      <form onSubmit={submit} className="flex w-full flex-col gap-4">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="authority-email" className="text-sm font-medium text-[#0b1f3a]">Email</label>
          <Input id="authority-email" type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="authority-password" className="text-sm font-medium text-[#0b1f3a]">Password</label>
          <Input id="authority-password" type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs font-normal text-gray-600">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="h-4 w-4 accent-[#0b1f3a]"
            />
            Show password
          </label>
        </div>
        <button disabled={submitting} className="rounded-md bg-[#0b1f3a] px-6 py-2.5 font-medium text-white disabled:opacity-50">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
