"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong.");
      }
      router.push(params.get("next") || "/");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <h1 className="text-xl font-semibold text-ink">ShopDeck Ops Assistant</h1>
        <p className="mt-1 text-sm text-ink-muted">Enter your password to continue.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-[15px] text-ink outline-none focus:border-cocoa"
          />
          {error && <p className="text-sm text-urgent">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cocoa px-4 py-3 text-[15px] font-medium text-paper active:bg-cocoa-dark disabled:opacity-60"
          >
            {loading ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
