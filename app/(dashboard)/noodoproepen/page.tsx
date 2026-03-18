"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { CallLog } from "@/lib/types";
import { AlertTriangle, Phone } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { nl } from "date-fns/locale";
import Link from "next/link";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  const d = parseISO(dateStr);
  if (!isValid(d)) return "\u2014";
  return format(d, "d MMM yyyy, HH:mm", { locale: nl });
}

export default function NoodoproepenPage() {
  const supabase = createClient();
  const [noodCalls, setNoodCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from("call_logs")
        .select("*, lifts(*)")
        .eq("call_type", "noodoproep")
        .order("created_at", { ascending: false });
      setNoodCalls(data || []);
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
          {noodCalls.length} noodoproepen geregistreerd
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card p-5 glow-danger">
          <p className="text-sm text-text-secondary">Totaal noodoproepen</p>
          <p className="text-3xl font-bold mt-1 text-danger">{noodCalls.length}</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-sm text-text-secondary">Via AI agent</p>
          <p className="text-3xl font-bold mt-1">
            {noodCalls.filter((c) => c.transcript).length}
          </p>
          <p className="text-xs text-text-muted mt-1">Gesprekken met transcript</p>
        </div>
      </div>

      {/* Noodoproep Calls Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-semibold">Alle noodoproepen</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-t border-border-subtle">
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Datum
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Lift / Locatie
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
                    {call.lifts?.bedrijf || call.lifts?.address || "\u2014"}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {call.sentiment || "\u2014"}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {call.duration_seconds ? `${call.duration_seconds}s` : "\u2014"}
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
                    colSpan={5}
                    className="px-6 py-12 text-center text-text-muted"
                  >
                    <Phone className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Geen noodoproepen gevonden
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
