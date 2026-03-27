"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your email for a confirmation link.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
          Doc Digest
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
          Create an account
        </p>

        {message ? (
          <div className="p-4 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
            {message}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none"
                style={{ borderColor: "var(--border)", background: "white" }}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none"
                style={{ borderColor: "var(--border)", background: "white" }}
                placeholder="At least 8 characters"
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
              className="w-full py-2 rounded-lg text-white font-medium text-sm disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-center" style={{ color: "var(--text-secondary)" }}>
          Already have an account?{" "}
          <Link href="/login" className="underline" style={{ color: "var(--accent)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
