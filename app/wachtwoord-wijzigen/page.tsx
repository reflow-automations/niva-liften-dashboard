"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Building2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function WachtwoordWijzigenPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Wachtwoord moet minimaal 6 tekens zijn.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Wachtwoorden komen niet overeen.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError("Kon wachtwoord niet wijzigen. Probeer het opnieuw.");
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-accent/5 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-info/5 blur-[120px]" />

      <div className="w-full max-w-md px-6 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-muted mb-4">
            <Building2 className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Wachtwoord wijzigen
          </h1>
          <p className="mt-2 text-text-secondary">
            Kies een nieuw wachtwoord
          </p>
        </div>

        {success ? (
          <div className="glass-card p-8 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
            <p className="text-text-primary font-semibold">
              Wachtwoord succesvol gewijzigd!
            </p>
            <p className="text-text-secondary text-sm">
              Je wordt doorgestuurd naar het dashboard...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-card p-8 space-y-6">
            {error && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-danger-muted text-danger text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-text-secondary"
              >
                Nieuw wachtwoord
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-surface-hover border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-text-secondary"
              >
                Bevestig wachtwoord
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-surface-hover border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wijzigen...
                </>
              ) : (
                "Wachtwoord wijzigen"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
