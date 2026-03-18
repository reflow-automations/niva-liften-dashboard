"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { CallLog, Noodoproep } from "@/lib/types";
import { AlertTriangle, MapPin, Clock, Phone } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { nl } from "date-fns/locale";
import Link from "next/link";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = parseISO(dateStr);
  if (!isValid(d)) return "—";
  return format(d, "d MMM yyyy, HH:mm", { locale: nl });
}

export default function NoodoproepenPage() {
  const supabase = createClient();
  const [noodoproepen, setNoodoproepen] = useState<Noodoproep[]>([]);
  const [noodCalls, setNoodCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const [noodRes, callsRes] = await Promise.all([
        supabase
          .from("noodoproepen")
          .select("*")
          .order("datum", { ascending: false }),
        supabase
          .from("call_logs")
          .select("*, lifts(*)")
          .eq("call_type", "noodoproep")
          .order("created_at", { ascending: false }),
      ]);
      setNoodoproepen(noodRes.data || []);
      setNoodCalls(callsRes.data || []);
      setLoading(false);
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <AlertTriangle className="w-7 h-7 text-danger" />
          Noodoproepen
        </h1>
        <p className="text-text-secondary mt-1">
          {noodoproepen.length} geregistreerde noodoproepen
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 glow-danger">
          <p className="text-sm text-text-secondary">Totaal noodoproepen</p>
          <p className="text-3xl font-bold mt-1 text-danger">{noodoproepen.length}</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-sm text-text-secondary">Noodoproep calls</p>
          <p className="text-3xl font-bold mt-1">{noodCalls.length}</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-sm text-text-secondary">Geëscaleerd</p>
          <p className="text-3xl font-bold mt-1 text-warning">
            {noodCalls.filter((c) => c.status === "mens_geescaleerd").length}
          </p>
        </div>
      </div>

      {/* Registered Noodoproepen */}
      {noodoproepen.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-6">
            <h2 className="text-lg font-semibold">Geregistreerde noodoproepen</h2>
          </div>
          <div className="divide-y divide-border-subtle">
            {noodoproepen.map((nood) => (
              <div
                key={nood.id}
                className="px-6 py-4 flex items-center gap-4 hover:bg-surface-hover/50 transition-colors"
              >
                <div className="p-2.5 rounded-xl bg-danger-muted flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-danger" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-medium text-sm">
                      {nood.locatie || "Onbekende locatie"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-xs text-text-secondary">
                      {formatDate(nood.datum)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Noodoproep Calls */}
      <div className="glass-card overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-semibold">
            Noodoproep gesprekken uit call logs
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-t border-border-subtle">
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Datum
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Locatie
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Sentiment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Duur
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {noodCalls.map((call) => (
                <tr
                  key={call.id}
                  className="hover:bg-surface-hover/50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm">
                    {formatDate(call.start_time || call.created_at)}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {call.lifts?.bedrijf || call.lifts?.address || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-sm font-medium ${
                        call.status === "mens_geescaleerd"
                          ? "text-warning"
                          : call.status === "noodoproep_actief"
                            ? "text-danger"
                            : "text-text-secondary"
                      }`}
                    >
                      {call.status === "mens_geescaleerd"
                        ? "Geëscaleerd"
                        : call.status === "noodoproep_actief"
                          ? "Actief"
                          : call.status || "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {call.sentiment || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {call.duration_seconds ? `${call.duration_seconds}s` : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/gesprekken/${call.id}`}
                      className="text-accent hover:text-accent-hover text-sm transition-colors"
                    >
                      Bekijken
                    </Link>
                  </td>
                </tr>
              ))}
              {noodCalls.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-text-muted"
                  >
                    <Phone className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Geen noodoproep-gesprekken gevonden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
