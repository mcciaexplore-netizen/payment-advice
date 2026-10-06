"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/Input";

export function CashReceiptLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function signIn() {
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/cash-receipt/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not sign in.");
        return;
      }
      router.replace("/cash-receipt");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await signIn();
  }

  return <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
    <div className="flex flex-col items-center gap-3 text-center">
      <Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-10 w-auto" />
      <h1 className="font-heading text-2xl text-[#0b1f3a]">Cash Receipt Login</h1>
      <p className="text-sm text-gray-600">Sign in with your MCCIA branch account.</p>
    </div>
    <form onSubmit={submit} className="flex w-full flex-col gap-4">
      {error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      <div className="flex flex-col gap-1.5"><label htmlFor="cash-receipt-email" className="text-sm font-medium text-[#0b1f3a]">Email</label><Input id="cash-receipt-email" type="email" required autoFocus autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      <div className="flex flex-col gap-1.5"><label htmlFor="cash-receipt-password" className="text-sm font-medium text-[#0b1f3a]">Password</label><Input id="cash-receipt-password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      <button disabled={submitting} className="rounded-md bg-[#0b1f3a] px-6 py-2.5 font-medium text-white disabled:opacity-50">{submitting ? "Signing in…" : "Sign in"}</button>
      <Link href="/" className="text-center text-sm text-gray-600 underline">Back to Payment Desk</Link>
    </form>
  </main>;
}
