"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { CallLog, Lift } from "@/lib/types";
import {
  Building2,
  Phone,
  AlertTriangle,
  DollarSign,
  Clock,
  TrendingUp,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import Link from "next/link";
import { format, parseISO, isValid, subDays } from "date-fns";
import { nl } from "date-fns/locale";
import KillSwitch from "@/components/KillSwitch";
import { useAdmin } from "@/lib/useAdmin";
import { getCallDuration, formatDuration } from "@/lib/utils";

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

function KPICard({
  icon: Icon,
  label,
  value,
  subtext,
  glow,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  glow: string;
  delay: string;
}) {
  return (
    <div
      className={`glass-card glass-card-hover p-6 ${glow} animate-fade-in ${delay}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary mb-1">{label}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {subtext && (
            <p className="text-xs text-text-muted mt-1">{subtext}</p>
          )}
        </div>
        <div className="p-3 rounded-xl bg-surface-hover">
          <Icon className="w-5 h-5 text-text-secondary" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const supabase = createClient();
  const { isAdmin } = useAdmin();
  const [liften, setLiften] = useState<Lift[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const [liftenRes, callsRes] = await Promise.all([
        supabase.from("lifts").select("*"),
        supabase
          .from("call_logs")
          .select("*, lifts(*)")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      setLiften(liftenRes.data || []);
      setCalls(callsRes.data || []);
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

  // KPI calculations
  const totalLiften = liften.length;
  const actieveLiften = liften.filter((l) => l.is_active).length;
  const todayCalls = calls.filter((c) => {
    const d = c.start_time ? parseISO(c.start_time) : null;
    if (!d || !isValid(d)) return false;
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  const totalNoodoproepen = calls.filter((c) => c.call_type === "noodoproep").length;
  const totalKosten = calls.reduce(
    (sum, c) => sum + (Number(c.call_cost_usd) || 0),
    0
  );
  const callDurations = calls.map((c) => getCallDuration(c)).filter((d): d is number => d !== null);
  const avgDuration =
    callDurations.length > 0
      ? Math.round(callDurations.reduce((sum, d) => sum + d, 0) / callDurations.length)
      : 0;

  // Call type distribution for pie chart
  const callTypeCounts = calls.reduce(
    (acc, c) => {
      acc[c.call_type] = (acc[c.call_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const pieData = Object.entries(callTypeCounts).map(([name, value]) => ({
    name: CALL_TYPE_LABELS[name] || name,
    value,
    color: CALL_TYPE_COLORS[name] || "#6b7280",
  }));

  // Calls per day for bar chart (last 14 days)
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const date = subDays(new Date(), 13 - i);
    const dateStr = format(date, "yyyy-MM-dd");
    const dayLabel = format(date, "d MMM", { locale: nl });
    const count = calls.filter((c) => {
      const d = c.start_time ? parseISO(c.start_time) : null;
      if (!d || !isValid(d)) return false;
      return format(d, "yyyy-MM-dd") === dateStr;
    }).length;
    return { day: dayLabel, calls: count };
  });

  // Recent calls (last 10)
  const recentCalls = calls.slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-text-secondary mt-1">
          Overzicht van alle liftactiviteiten
        </p>
      </div>

      {/* Killswitch */}
      <KillSwitch />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          icon={Building2}
          label="Totaal liften"
          value={totalLiften}
          subtext={`${actieveLiften} actief`}
          glow="glow-accent"
          delay="stagger-1"
        />
        <KPICard
          icon={Phone}
          label="Calls vandaag"
          value={todayCalls}
          glow="glow-accent"
          delay="stagger-2"
        />
        <KPICard
          icon={AlertTriangle}
          label="Noodoproepen"
          value={totalNoodoproepen}
          glow="glow-danger"
          delay="stagger-3"
        />
        {isAdmin && (
          <KPICard
            icon={DollarSign}
            label="Totale kosten"
            value={`$${totalKosten.toFixed(2)}`}
            glow="glow-warning"
            delay="stagger-4"
          />
        )}
        <KPICard
          icon={Clock}
          label="Gem. duur"
          value={`${avgDuration}s`}
          glow="glow-accent"
          delay="stagger-5"
        />
        <KPICard
          icon={TrendingUp}
          label="Totaal calls"
          value={calls.length}
          glow="glow-accent"
          delay="stagger-5"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calls per day bar chart */}
        <div className="lg:col-span-2 glass-card p-6">
          <h2 className="text-lg font-semibold mb-4">
            Calls afgelopen 14 dagen
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last14Days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                <XAxis
                  dataKey="day"
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
                <Bar
                  dataKey="calls"
                  fill="#6366f1"
                  radius={[6, 6, 0, 0]}
                  name="Calls"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Call type pie chart */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold mb-4">Call types</h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2a",
                    border: "1px solid #2a2a3a",
                    borderRadius: "12px",
                    color: "#f0f0f5",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-2">
            {pieData.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-text-secondary">{item.name}</span>
                </div>
                <span className="font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Calls Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recente gesprekken</h2>
          <Link
            href="/gesprekken"
            className="text-sm text-accent hover:text-accent-hover transition-colors"
          >
            Alle gesprekken &rarr;
          </Link>
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
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Duur
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {recentCalls.map((call) => (
                <tr
                  key={call.id}
                  className="hover:bg-surface-hover/50 transition-colors cursor-pointer"
                  onClick={() => window.location.href = `/gesprekken/${call.id}`}
                >
                  <td className="px-6 py-4 text-sm">
                    {formatDate(call.start_time || call.created_at)}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
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
                </tr>
              ))}
              {recentCalls.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-text-muted"
                  >
                    Nog geen gesprekken geregistreerd
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
