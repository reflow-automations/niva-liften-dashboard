"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { CallLog } from "@/lib/types";
import { DollarSign, TrendingUp, TrendingDown, BarChart3, Calendar } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import { format, parseISO, isValid, startOfWeek, startOfMonth, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { nl } from "date-fns/locale";
import { useAdmin } from "@/lib/useAdmin";
import { useRouter } from "next/navigation";
import { getCallDuration } from "@/lib/utils";

type Period = "week" | "maand";

export default function KostenPage() {
  const supabase = createClient();
  const router = useRouter();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [allCalls, setAllCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("week");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    async function fetchCalls() {
      const { data } = await supabase
        .from("call_logs")
        .select("*")
        .order("created_at", { ascending: true });
      setAllCalls(data || []);
      setLoading(false);
    }
    fetchCalls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || adminLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    router.push("/");
    return null;
  }

  // Filter calls by date range
  const calls = allCalls.filter((call) => {
    if (!startDate && !endDate) return true;
    const dateStr = call.start_time || call.created_at;
    if (!dateStr) return false;
    const d = parseISO(dateStr);
    if (!isValid(d)) return false;

    const start = startDate ? startOfDay(parseISO(startDate)) : new Date(0);
    const end = endDate ? endOfDay(parseISO(endDate)) : new Date(2099, 0, 1);

    return isWithinInterval(d, { start, end });
  });

  // Cost calculations
  const totalCost = calls.reduce(
    (sum, c) => sum + (Number(c.call_cost_usd) || 0),
    0
  );
  const callsWithCost = calls.filter(
    (c) => c.call_cost_usd && Number(c.call_cost_usd) > 0
  );
  const avgCost =
    callsWithCost.length > 0 ? totalCost / callsWithCost.length : 0;
  const maxCost = Math.max(
    ...callsWithCost.map((c) => Number(c.call_cost_usd) || 0),
    0
  );

  // Total minutes
  const totalMinutes = calls.reduce((sum, c) => {
    const dur = getCallDuration(c);
    return sum + (dur ? dur / 60 : 0);
  }, 0);

  // Group costs by period
  const groupedCosts = calls.reduce(
    (acc, call) => {
      if (!call.call_cost_usd || Number(call.call_cost_usd) === 0) return acc;
      const date = call.start_time || call.created_at;
      if (!date) return acc;
      const d = parseISO(date);
      if (!isValid(d)) return acc;

      let key: string;
      if (period === "week") {
        const weekStart = startOfWeek(d, { weekStartsOn: 1 });
        key = format(weekStart, "d MMM", { locale: nl });
      } else {
        const monthStart = startOfMonth(d);
        key = format(monthStart, "MMM yyyy", { locale: nl });
      }

      if (!acc[key]) acc[key] = { period: key, kosten: 0, calls: 0 };
      acc[key].kosten += Number(call.call_cost_usd) || 0;
      acc[key].calls += 1;
      return acc;
    },
    {} as Record<string, { period: string; kosten: number; calls: number }>
  );

  const chartData = Object.values(groupedCosts).map((item) => ({
    ...item,
    kosten: Math.round(item.kosten * 1000) / 1000,
  }));

  // Cost by call type
  const costByType = calls.reduce(
    (acc, c) => {
      if (!c.call_cost_usd || Number(c.call_cost_usd) === 0) return acc;
      const type = c.call_type || "onbekend";
      acc[type] = (acc[type] || 0) + Number(c.call_cost_usd);
      return acc;
    },
    {} as Record<string, number>
  );

  const typeLabels: Record<string, string> = {
    test: "Test",
    noodoproep: "Noodoproep",
  };

  const typeColors: Record<string, string> = {
    test: "#6366f1",
    noodoproep: "#ef4444",
  };

  const costByTypeData = Object.entries(costByType).map(([type, cost]) => ({
    name: typeLabels[type] || type,
    kosten: Math.round(cost * 1000) / 1000,
    fill: typeColors[type] || "#6b7280",
  }));

  const hasDateFilter = startDate || endDate;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kosten</h1>
        <p className="text-text-secondary mt-1">
          Overzicht van gesprekskosten
        </p>
      </div>

      {/* Date Range Filter */}
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-text-muted" />
            <span className="text-sm font-medium text-text-secondary">Periode:</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Van</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 rounded-xl bg-surface-hover border border-border text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Tot</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 rounded-xl bg-surface-hover border border-border text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
              />
            </div>
            {hasDateFilter && (
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer mt-5"
              >
                Wis filter
              </button>
            )}
          </div>
          {hasDateFilter && (
            <span className="text-xs text-text-muted mt-5">
              {calls.length} van {allCalls.length} calls
            </span>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-5 glow-warning">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-warning" />
            <span className="text-sm text-text-secondary">Totale kosten</span>
          </div>
          <p className="text-3xl font-bold text-warning">
            ${totalCost.toFixed(2)}
          </p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-text-secondary" />
            <span className="text-sm text-text-secondary">
              Gem. per call
            </span>
          </div>
          <p className="text-3xl font-bold">${avgCost.toFixed(3)}</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-text-secondary" />
            <span className="text-sm text-text-secondary">Duurste call</span>
          </div>
          <p className="text-3xl font-bold">${maxCost.toFixed(3)}</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-text-secondary" />
            <span className="text-sm text-text-secondary">Betaalde calls</span>
          </div>
          <p className="text-3xl font-bold">{callsWithCost.length}</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-text-secondary" />
            <span className="text-sm text-text-secondary">Totaal minuten</span>
          </div>
          <p className="text-3xl font-bold">{totalMinutes.toFixed(1)}</p>
        </div>
      </div>

      {/* Cost over time chart */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Kosten per {period}</h2>
          <div className="flex gap-1 p-1 bg-surface-hover rounded-xl">
            <button
              onClick={() => setPeriod("week")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                period === "week"
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setPeriod("maand")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                period === "maand"
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Maand
            </button>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
              <XAxis
                dataKey="period"
                tick={{ fill: "#8888a0", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#2a2a3a" }}
              />
              <YAxis
                tick={{ fill: "#8888a0", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#2a2a3a" }}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: "#1e1e2a",
                  border: "1px solid #2a2a3a",
                  borderRadius: "12px",
                  color: "#f0f0f5",
                }}
                formatter={(value: unknown) => [`$${Number(value).toFixed(3)}`, "Kosten"]}
              />
              <Area
                type="monotone"
                dataKey="kosten"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#costGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost by type + Calls per period */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold mb-4">Kosten per call type</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costByTypeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                <XAxis
                  type="number"
                  tick={{ fill: "#8888a0", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#2a2a3a" }}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#8888a0", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#2a2a3a" }}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2a",
                    border: "1px solid #2a2a3a",
                    borderRadius: "12px",
                    color: "#f0f0f5",
                  }}
                  formatter={(value: number) => [
                    `$${Number(value).toFixed(3)}`,
                    "Kosten",
                  ]}
                />
                <Bar dataKey="kosten" radius={[0, 8, 8, 0]}>
                  {costByTypeData.map((entry, index) => (
                    <Bar
                      key={`bar-${index}`}
                      dataKey="kosten"
                      fill={entry.fill}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold mb-4">Aantal calls per {period}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                <XAxis
                  dataKey="period"
                  tick={{ fill: "#8888a0", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#2a2a3a" }}
                />
                <YAxis
                  tick={{ fill: "#8888a0", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#2a2a3a" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2a",
                    border: "1px solid #2a2a3a",
                    borderRadius: "12px",
                    color: "#f0f0f5",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="calls"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ fill: "#6366f1", r: 4 }}
                  name="Calls"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
