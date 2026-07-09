"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";

// Watcher voor "onbekend"-calls (stille calls die niet naar de noodcentrale gingen).
// Speelt een ping bij binnenkomst van een nieuwe, niet-gecontroleerde melding en
// maximaal één herinnering na 5 minuten als de checkbox nog niet is gezet.
const POLL_INTERVAL_MS = 30_000;
const REMIND_INTERVAL_MS = 5 * 60_000;
const MAX_PINGS_PER_CALL = 2;
const LOOKBACK_HOURS = 24;

export default function OnbekendAlert() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Per call-id: wanneer voor het laatst gepingd + hoe vaak
  const pingStateRef = useRef<Map<string, { last: number; count: number }>>(
    new Map()
  );

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;

    // Browsers blokkeren audio tot de eerste user-interactie; daarna mag het.
    function ensureAudioCtx(): AudioContext | null {
      if (typeof window === "undefined") return null;
      if (!audioCtxRef.current) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctx) return null;
        audioCtxRef.current = new Ctx();
      }
      return audioCtxRef.current;
    }

    function unlockAudio() {
      const ctx = ensureAudioCtx();
      if (ctx && ctx.state === "suspended") ctx.resume();
    }
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    function playPing() {
      const ctx = ensureAudioCtx();
      if (!ctx || ctx.state !== "running") return;
      // Twee korte tonen (hoog-laag), duidelijk maar niet schel
      const t0 = ctx.currentTime;
      [
        { freq: 1175, start: 0, dur: 0.18 },
        { freq: 880, start: 0.22, dur: 0.28 },
      ].forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t0 + start);
        gain.gain.linearRampToValueAtTime(0.4, t0 + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + start);
        osc.stop(t0 + start + dur + 0.05);
      });
    }

    async function poll() {
      const since = new Date(
        Date.now() - LOOKBACK_HOURS * 3600_000
      ).toISOString();
      const { data, error } = await supabase
        .from("call_logs")
        .select("id, created_at")
        .eq("call_type", "onbekend")
        .is("acknowledged_at", null)
        .gte("created_at", since);
      if (stopped || error || !data) return;

      const now = Date.now();
      const pingState = pingStateRef.current;
      const openIds = new Set(data.map((r) => r.id));

      // Gecontroleerde/verlopen meldingen opruimen
      for (const id of Array.from(pingState.keys())) {
        if (!openIds.has(id)) pingState.delete(id);
      }

      let shouldPing = false;
      for (const row of data) {
        const state = pingState.get(row.id);
        if (state === undefined) {
          shouldPing = true;
          pingState.set(row.id, { last: now, count: 1 });
        } else if (
          state.count < MAX_PINGS_PER_CALL &&
          now - state.last >= REMIND_INTERVAL_MS
        ) {
          shouldPing = true;
          pingState.set(row.id, { last: now, count: state.count + 1 });
        }
      }
      // Eén ping per poll-ronde, ook bij meerdere meldingen tegelijk
      if (shouldPing) playPing();
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
