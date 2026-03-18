"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";

export default function KillSwitch() {
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/killswitch");
      if (res.ok) {
        const data = await res.json();
        setIsActive(data.killswitch_active ?? false);
        setError(null);
      } else {
        setError("Kan status niet ophalen");
      }
    } catch {
      setError("Verbinding mislukt");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    if (toggling) return;

    // Confirm before toggling
    const action = isActive ? "deactiveren" : "activeren";
    const confirmed = window.confirm(
      isActive
        ? "Weet je zeker dat je de AI weer wilt INSCHAKELEN?\n\nDe AI-agent zal weer telefoongesprekken afhandelen."
        : "Weet je zeker dat je de NOODSTOP wilt ACTIVEREN?\n\nAlle gesprekken gaan direct naar de noodcentrale. De AI wordt uitgeschakeld."
    );

    if (!confirmed) return;

    setToggling(true);
    setError(null);

    try {
      const res = await fetch("/api/killswitch", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIsActive(data.killswitch_active ?? !isActive);
      } else {
        setError(`Kon killswitch niet ${action}`);
      }
    } catch {
      setError("Verbinding mislukt");
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-4 flex items-center gap-3 animate-pulse">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        <span className="text-sm text-text-muted">Killswitch status laden...</span>
      </div>
    );
  }

  if (error && isActive === null) {
    return (
      <div className="glass-card p-4 border border-warning/30">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-warning" />
          <span className="text-sm text-warning">{error}</span>
          <button
            onClick={fetchStatus}
            className="ml-auto text-sm text-accent hover:text-accent-hover cursor-pointer"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`glass-card p-5 border-2 transition-all duration-300 ${
        isActive
          ? "border-danger/50 bg-danger/5"
          : "border-success/30 bg-success/5"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {isActive ? (
            <div className="p-3 rounded-xl bg-danger/20">
              <ShieldAlert className="w-6 h-6 text-danger" />
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-success/20">
              <ShieldCheck className="w-6 h-6 text-success" />
            </div>
          )}
          <div>
            <h3 className="font-bold text-sm">
              {isActive ? "NOODBEDRIJF ACTIEF" : "Normaal bedrijf"}
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              {isActive
                ? "AI is uitgeschakeld \u2014 alle oproepen gaan direct naar de noodcentrale"
                : "AI-agent handelt gesprekken af"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {error && (
            <span className="text-xs text-danger">{error}</span>
          )}
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-60 ${
              isActive
                ? "bg-success hover:bg-success/80 text-white"
                : "bg-danger hover:bg-danger/80 text-white"
            }`}
          >
            {toggling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Bezig...
              </>
            ) : isActive ? (
              "AI Heractiveren"
            ) : (
              "NOODSTOP"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
