"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { CallLog } from "@/lib/types";
import { Search, Filter, Phone, ChevronRight } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { nl } from "date-fns/locale";

import { useAdmin } from "@/lib/useAdmin";
import { getCallDuration, formatDuration } from "@/lib/utils";

const CALL_TYPE_OPTIONS = [
  { value: "", label: "Alle types" },
  { value: "test", label: "Test" },
  { value: "noodoproep", label: "Noodoproep" },
];

const CALL_TYPE_COLORS: Record<string, string> = {
  test: "#6366f1",
  noodoproep: "#ef4444",
};

const CALL_TYPE_LABELS: Record<string, string> = {
  test: "Test",
  noodoproep: "Noodoproep",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  const d = parseISO(dateStr);
  if (!isValid(d)) return "\u2014";
  return format(d, "d MMM yyyy, HH:mm", { locale: nl });
}

export default function GesprekkenPage() {
  const supabase = createClient();
  const { isAdmin } = useAdmin();
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    async function fetchCalls() {
      const { data } = await supabase
        .from("call_logs")
        .select("*, lifts(*)")
        .order("created_at", { ascending: false });
      setCalls(data || []);
      setLoading(false);
    }
    fetchCalls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = calls.filter((call) => {
    if (typeFilter && call.call_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        call.lifts?.bedrijf?.toLowerCase().includes(q) ||
        call.lifts?.address?.toLowerCase().includes(q) ||
        call.call_sid?.toLowerCase().includes(q) ||
        call.summary?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gesprekken</h1>
        <p className="text-text-secondary mt-1">
          {calls.length} gesprekken geregistreerd
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Zoek op locatie, samenvatting..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${
            showFilters || typeFilter
              ? "bg-accent-muted border-accent text-accent"
              : "bg-surface border-border text-text-secondary hover:text-text-primary"
          }`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {typeFilter && (
            <span className="w-2 h-2 rounded-full bg-accent" />
          )}
        </button>
      </div>

      {showFilters && (
        <div className="glass-card p-4 flex flex-wrap gap-3 animate-fade-in">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-surface-hover border border-border text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
          >
            {CALL_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {typeFilter && (
            <button
              onClick={() => setTypeFilter("")}
              className="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer"
            >
              Wis filters
            </button>
          )}
        </div>
      )}

      {/* Calls Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Datum
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Lift / Locatie
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Duur
                </th>
                {isAdmin && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Kosten
                  </th>
                )}
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((call) => (
                <tr
                  key={call.id}
                  className="hover:bg-surface-hover/50 transition-colors group cursor-pointer"
                  onClick={() => window.location.href = `/gesprekken/${call.id}`}
                >
                  <td className="px-6 py-4 text-sm whitespace-nowrap">
                    {formatDate(call.start_time || call.created_at)}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary max-w-[200px] truncate">
                    {call.lifts?.bedrijf || call.lifts?.address || "\u2014"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${CALL_TYPE_COLORS[call.call_type] || "#6b7280"}20`,
                        color: CALL_TYPE_COLORS[call.call_type] || "#6b7280",
                      }}
                    >
                      {CALL_TYPE_LABELS[call.call_type] || call.call_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {formatDuration(getCallDuration(call))}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {call.call_cost_usd
                        ? `$${Number(call.call_cost_usd).toFixed(3)}`
                        : "\u2014"}
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="px-6 py-12 text-center text-text-muted"
                  >
                    <Phone className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Geen gesprekken gevonden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-border-subtle text-sm text-text-muted">
          {filtered.length} van {calls.length} gesprekken
        </div>
      </div>
    </div>
  );
}
