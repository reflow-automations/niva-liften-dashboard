"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { CallLog } from "@/lib/types";
import { Search, Filter, Phone, ChevronRight } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { nl } from "date-fns/locale";
import Link from "next/link";

const CALL_TYPE_OPTIONS = [
  { value: "", label: "Alle types" },
  { value: "test", label: "Test" },
  { value: "test_automatisch", label: "Auto-test" },
  { value: "noodoproep", label: "Noodoproep" },
  { value: "onbekend", label: "Onbekend" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Alle statussen" },
  { value: "test_succes", label: "Test succes" },
  { value: "noodoproep_actief", label: "Noodoproep actief" },
  { value: "mens_geescaleerd", label: "Geëscaleerd" },
  { value: "ai_afgehandeld", label: "AI afgehandeld" },
  { value: "onbekend", label: "Onbekend" },
];

const CALL_TYPE_COLORS: Record<string, string> = {
  test: "#6366f1",
  test_automatisch: "#3b82f6",
  noodoproep: "#ef4444",
  onbekend: "#6b7280",
};

const CALL_TYPE_LABELS: Record<string, string> = {
  test: "Test",
  test_automatisch: "Auto-test",
  noodoproep: "Noodoproep",
  onbekend: "Onbekend",
};

const STATUS_COLORS: Record<string, string> = {
  test_succes: "text-success",
  noodoproep_actief: "text-danger",
  mens_geescaleerd: "text-warning",
  ai_afgehandeld: "text-info",
  onbekend: "text-text-muted",
};

const STATUS_LABELS: Record<string, string> = {
  test_succes: "Test succes",
  noodoproep_actief: "Noodoproep actief",
  mens_geescaleerd: "Geëscaleerd",
  ai_afgehandeld: "AI afgehandeld",
  onbekend: "Onbekend",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = parseISO(dateStr);
  if (!isValid(d)) return "—";
  return format(d, "d MMM yyyy, HH:mm", { locale: nl });
}

export default function GesprekkenPage() {
  const supabase = createClient();
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
    if (statusFilter && call.status !== statusFilter) return false;
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
            showFilters || typeFilter || statusFilter
              ? "bg-accent-muted border-accent text-accent"
              : "bg-surface border-border text-text-secondary hover:text-text-primary"
          }`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {(typeFilter || statusFilter) && (
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-surface-hover border border-border text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {(typeFilter || statusFilter) && (
            <button
              onClick={() => {
                setTypeFilter("");
                setStatusFilter("");
              }}
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
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Duur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Kosten
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((call) => (
                <tr
                  key={call.id}
                  className="hover:bg-surface-hover/50 transition-colors group"
                >
                  <td className="px-6 py-4 text-sm whitespace-nowrap">
                    {formatDate(call.start_time || call.created_at)}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary max-w-[200px] truncate">
                    {call.lifts?.bedrijf || call.lifts?.address || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${CALL_TYPE_COLORS[call.call_type]}20`,
                        color: CALL_TYPE_COLORS[call.call_type],
                      }}
                    >
                      {CALL_TYPE_LABELS[call.call_type] || call.call_type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-sm font-medium ${STATUS_COLORS[call.status] || "text-text-muted"}`}
                    >
                      {STATUS_LABELS[call.status] || call.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {call.duration_seconds ? `${call.duration_seconds}s` : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {call.call_cost_usd
                      ? `$${Number(call.call_cost_usd).toFixed(3)}`
                      : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/gesprekken/${call.id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ChevronRight className="w-4 h-4 text-text-muted hover:text-accent" />
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
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
