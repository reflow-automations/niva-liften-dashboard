"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { CallLog } from "@/lib/types";
import {
  ArrowLeft,
  Play,
  Pause,
  Clock,
  DollarSign,
  Brain,
  Heart,
  Globe,
  Users,
  Phone,
  AlertTriangle,
  Volume2,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { nl } from "date-fns/locale";
import { useAdmin } from "@/lib/useAdmin";
import { getCallDuration, formatDuration } from "@/lib/utils";

const CALL_TYPE_LABELS: Record<string, string> = {
  test: "Test",
  noodoproep: "Noodoproep",
};

const CALL_TYPE_COLORS: Record<string, string> = {
  test: "#6366f1",
  noodoproep: "#ef4444",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = parseISO(dateStr);
  if (!isValid(d)) return "—";
  return format(d, "d MMMM yyyy, HH:mm:ss", { locale: nl });
}

export default function GesprekDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { isAdmin } = useAdmin();
  const [call, setCall] = useState<CallLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    async function fetchCall() {
      const { data } = await supabase
        .from("call_logs")
        .select("*, lifts(*)")
        .eq("id", params.id)
        .single();

      setCall(data);

      // Get signed URL for audio if available
      if (data?.audio_url) {
        // Extract filename from the audio_url
        const urlParts = data.audio_url.split("/");
        const fileName = urlParts[urlParts.length - 1];

        const { data: signedData } = await supabase.storage
          .from("recordings")
          .createSignedUrl(fileName, 3600); // 1 hour expiry

        if (signedData?.signedUrl) {
          setAudioUrl(signedData.signedUrl);
        }
      }

      setLoading(false);
    }
    fetchCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio.duration) {
        setAudioProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("ended", () => setIsPlaying(false));
    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("ended", () => setIsPlaying(false));
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!call) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Gesprek niet gevonden</p>
        <button
          onClick={() => router.push("/gesprekken")}
          className="mt-4 text-accent hover:text-accent-hover transition-colors cursor-pointer"
        >
          Terug naar gesprekken
        </button>
      </div>
    );
  }

  const infoItems = [
    {
      icon: Clock,
      label: "Duur",
      value: formatDuration(getCallDuration(call)),
    },
    ...(isAdmin
      ? [
          {
            icon: DollarSign,
            label: "Kosten",
            value: call.call_cost_usd
              ? `$${Number(call.call_cost_usd).toFixed(3)}`
              : "—",
          },
        ]
      : []),
    {
      icon: Heart,
      label: "Sentiment",
      value: call.sentiment || "—",
    },
    {
      icon: Globe,
      label: "Taal",
      value: call.language || "—",
    },
    {
      icon: Users,
      label: "Personen in lift",
      value: call.occupancy || "—",
    },
    {
      icon: Brain,
      label: "LLM Model",
      value: call.model_llm_version || "—",
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back Button & Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/gesprekken")}
          className="p-2 rounded-xl bg-surface border border-border hover:bg-surface-hover transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gesprek detail</h1>
          <p className="text-text-secondary mt-0.5">
            {call.lifts?.bedrijf || call.lifts?.address || "Onbekend"} —{" "}
            {formatDate(call.start_time || call.created_at)}
          </p>
        </div>
      </div>

      {/* Type & Status badges */}
      <div className="flex flex-wrap gap-3">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium"
          style={{
            backgroundColor: `${CALL_TYPE_COLORS[call.call_type]}20`,
            color: CALL_TYPE_COLORS[call.call_type],
          }}
        >
          {call.call_type === "noodoproep" ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <Phone className="w-4 h-4" />
          )}
          {CALL_TYPE_LABELS[call.call_type] || call.call_type}
        </span>
        <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-medium bg-surface-hover text-text-secondary">
          {call.call_type === "noodoproep" ? "Noodoproep" : "Test"}
        </span>
        {call.fallback_reason && (
          <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-medium bg-warning-muted text-warning">
            Fallback: {call.fallback_reason}
          </span>
        )}
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {infoItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="glass-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 text-text-muted" />
                <span className="text-xs text-text-muted">{item.label}</span>
              </div>
              <p className="font-semibold text-sm">{item.value}</p>
            </div>
          );
        })}
      </div>

      {/* Audio Player */}
      {audioUrl && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Volume2 className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold">Audio opname</h2>
          </div>
          <audio ref={audioRef} src={audioUrl} preload="metadata" />
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-accent hover:bg-accent-hover flex items-center justify-center transition-all cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-white" />
              ) : (
                <Play className="w-5 h-5 text-white ml-0.5" />
              )}
            </button>
            <div className="flex-1">
              <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-200"
                  style={{ width: `${audioProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      {call.summary && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold mb-3">Samenvatting</h2>
          <p className="text-text-secondary leading-relaxed">{call.summary}</p>
        </div>
      )}

      {/* Transcript */}
      {call.transcript && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold mb-3">Transcript</h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {call.transcript.split("\n").map((line, i) => {
              const isAgent = line.toLowerCase().startsWith("agent:");
              const isUser =
                line.toLowerCase().startsWith("user:") ||
                line.toLowerCase().startsWith("beller:");
              const content = line.replace(/^(Agent|User|Beller):\s*/i, "");

              if (!content.trim()) return null;

              return (
                <div
                  key={i}
                  className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                      isAgent
                        ? "bg-accent-muted text-text-primary rounded-br-md"
                        : isUser
                          ? "bg-surface-hover text-text-primary rounded-bl-md"
                          : "bg-surface-hover text-text-secondary"
                    }`}
                  >
                    <p className="text-xs text-text-muted mb-1">
                      {isAgent ? "AI Agent" : isUser ? "Beller" : ""}
                    </p>
                    {content}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Technical Details */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold mb-3">Technische details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between py-2 border-b border-border-subtle">
            <span className="text-text-muted">Call SID</span>
            <span className="font-mono text-xs">{call.call_sid || "—"}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border-subtle">
            <span className="text-text-muted">Retell Call ID</span>
            <span className="font-mono text-xs">
              {call.retell_call_id || "—"}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-border-subtle">
            <span className="text-text-muted">Van nummer</span>
            <span className="font-mono text-xs">
              {call.from_number || "—"}
            </span>
          </div>
          {call.lifts?.contactpersoon && (
            <div className="flex justify-between py-2 border-b border-border-subtle">
              <span className="text-text-muted">Contactpersoon</span>
              <span>{call.lifts.contactpersoon}</span>
            </div>
          )}
          {call.lifts?.["extra-telefoon-nummer"] && (
            <div className="flex justify-between py-2 border-b border-border-subtle">
              <span className="text-text-muted">Extra telefoon</span>
              <span className="font-mono text-xs">
                {call.lifts["extra-telefoon-nummer"]}
              </span>
            </div>
          )}
          <div className="flex justify-between py-2 border-b border-border-subtle">
            <span className="text-text-muted">Start</span>
            <span>{formatDate(call.start_time)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border-subtle">
            <span className="text-text-muted">Einde</span>
            <span>{formatDate(call.end_time)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border-subtle">
            <span className="text-text-muted">Queue tijd</span>
            <span>
              {call.queue_time_ms ? `${call.queue_time_ms}ms` : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
