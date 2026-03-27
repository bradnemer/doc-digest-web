"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      router.replace("/");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
          Set new password
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">New password</label>
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
            {loading ? "Saving…" : "Save password"}
          </button>
        </form>
      </div>
    </div>
  );
}
