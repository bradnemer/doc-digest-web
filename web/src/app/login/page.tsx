"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push(next);
      router.refresh();
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setError("Check your email for a password reset link.");
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
        Doc Digest
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        Sign in to your account
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: "var(--border)", background: "white" }}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: "var(--border)", background: "white" }}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm px-3 py-2 rounded-lg" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded-lg text-white font-medium text-sm transition-opacity disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <button
        onClick={handleForgotPassword}
        className="mt-3 text-sm underline block w-full text-center"
        style={{ color: "var(--text-secondary)" }}
      >
        Forgot password?
      </button>

      <p className="mt-6 text-sm text-center" style={{ color: "var(--text-secondary)" }}>
        No account?{" "}
        <Link href="/signup" className="underline" style={{ color: "var(--accent)" }}>
          Sign up
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
