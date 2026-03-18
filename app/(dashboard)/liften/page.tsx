"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Lift } from "@/lib/types";
import { Search, Building2, MapPin, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format, parseISO, isValid, differenceInDays } from "date-fns";
import { nl } from "date-fns/locale";

function getTestStatus(lastTestAt: string | null): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (!lastTestAt) {
    return { label: "Nooit getest", color: "text-text-muted", bgColor: "bg-surface-hover" };
  }
  const d = parseISO(lastTestAt);
  if (!isValid(d)) return { label: "Onbekend", color: "text-text-muted", bgColor: "bg-surface-hover" };

  const daysSince = differenceInDays(new Date(), d);
  if (daysSince <= 3) {
    return { label: "Recent getest", color: "text-success", bgColor: "bg-success-muted" };
  } else if (daysSince <= 30) {
    return { label: `${daysSince}d geleden`, color: "text-warning", bgColor: "bg-warning-muted" };
  } else {
    return { label: `${daysSince}d geleden`, color: "text-danger", bgColor: "bg-danger-muted" };
  }
}

export default function LiftenPage() {
  const supabase = createClient();
  const [liften, setLiften] = useState<Lift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alle" | "actief" | "inactief">("alle");
  const [testFilter, setTestFilter] = useState<"alle" | "recent" | "verouderd" | "nooit">("alle");
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLiften() {
      const { data } = await supabase
        .from("lifts")
        .select("*")
        .order("bedrijf", { ascending: true });
      setLiften(data || []);
      setLoading(false);
    }
    fetchLiften();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleActive = async (lift: Lift) => {
    setToggling(lift.id);
    const newStatus = !lift.is_active;
    const { error } = await supabase
      .from("lifts")
      .update({ is_active: newStatus })
      .eq("id", lift.id);

    if (!error) {
      setLiften((prev) =>
        prev.map((l) => (l.id === lift.id ? { ...l, is_active: newStatus } : l))
      );
    }
    setToggling(null);
  };

  const filtered = liften.filter((lift) => {
    // Search filter
    const q = search.toLowerCase();
    const matchesSearch =
      lift.bedrijf?.toLowerCase().includes(q) ||
      lift.address?.toLowerCase().includes(q) ||
      lift.stad?.toLowerCase().includes(q) ||
      lift.postcode?.toLowerCase().includes(q) ||
      lift.phone_number?.includes(q);

    // Status filter
    const matchesStatus =
      statusFilter === "alle" ||
      (statusFilter === "actief" && lift.is_active) ||
      (statusFilter === "inactief" && !lift.is_active);

    // Test filter
    let matchesTest = true;
    if (testFilter !== "alle") {
      if (!lift.last_test_at) {
        matchesTest = testFilter === "nooit";
      } else {
        const d = parseISO(lift.last_test_at);
        if (!isValid(d)) {
          matchesTest = testFilter === "nooit";
        } else {
          const daysSince = differenceInDays(new Date(), d);
          if (testFilter === "recent") matchesTest = daysSince <= 3;
          else if (testFilter === "verouderd") matchesTest = daysSince > 30;
          else matchesTest = false;
        }
      }
    }

    return matchesSearch && matchesStatus && matchesTest;
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Liften</h1>
          <p className="text-text-secondary mt-1">
            {liften.length} liften geregistreerd
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Zoek op adres, stad, bedrijf..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Status filter */}
        <div className="flex rounded-xl overflow-hidden border border-border">
          {(["alle", "actief", "inactief"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setStatusFilter(option)}
              className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                statusFilter === option
                  ? "bg-accent text-white"
                  : "bg-surface text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>

        {/* Test filter */}
        <div className="flex rounded-xl overflow-hidden border border-border">
          {([
            { value: "alle", label: "Alle tests" },
            { value: "recent", label: "Recent getest" },
            { value: "verouderd", label: ">30 dagen" },
            { value: "nooit", label: "Nooit getest" },
          ] as const).map((option) => (
            <button
              key={option.value}
              onClick={() => setTestFilter(option.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                testFilter === option.value
                  ? "bg-accent text-white"
                  : "bg-surface text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Results count */}
        <div className="flex items-center text-sm text-text-muted ml-auto">
          {filtered.length} van {liften.length} liften
        </div>
      </div>

      {/* Lift Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((lift) => {
          const testStatus = getTestStatus(lift.last_test_at);
          return (
            <div
              key={lift.id}
              className="glass-card glass-card-hover p-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-accent-muted">
                    <Building2 className="w-5 h-5 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm truncate">
                      {lift.bedrijf || "Onbekend bedrijf"}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-text-secondary mt-0.5">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{lift.address}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleActive(lift)}
                  disabled={toggling === lift.id}
                  className="cursor-pointer flex-shrink-0 transition-transform hover:scale-110 disabled:opacity-50"
                  title={lift.is_active ? "Klik om te deactiveren" : "Klik om te activeren"}
                >
                  {lift.is_active ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <XCircle className="w-5 h-5 text-danger" />
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-text-muted text-xs">Postcode</p>
                  <p className="font-medium">
                    {lift.postcode} {lift.stad}
                  </p>
                </div>
                <div>
                  <p className="text-text-muted text-xs">Telefoon</p>
                  <p className="font-mono text-xs">+{lift.phone_number}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-xs text-text-muted">Laatste test</span>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-lg ${testStatus.bgColor} ${testStatus.color}`}
                >
                  {lift.last_test_at
                    ? format(parseISO(lift.last_test_at), "d MMM yyyy, HH:mm", {
                        locale: nl,
                      })
                    : testStatus.label}
                </span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-text-muted">
            Geen liften gevonden
          </div>
        )}
      </div>
    </div>
  );
}
