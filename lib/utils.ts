import type { CallLog } from "@/lib/types";
import { parseISO, isValid, differenceInSeconds } from "date-fns";

/**
 * Get call duration in seconds.
 * Uses duration_seconds if available, otherwise calculates from start/end time.
 */
export function getCallDuration(call: CallLog): number | null {
  if (call.duration_seconds && call.duration_seconds > 0) {
    return call.duration_seconds;
  }

  if (call.start_time && call.end_time) {
    const start = parseISO(call.start_time);
    const end = parseISO(call.end_time);
    if (isValid(start) && isValid(end)) {
      const diff = differenceInSeconds(end, start);
      return diff > 0 ? diff : null;
    }
  }

  return null;
}

/**
 * Format duration in seconds to a readable string.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "\u2014";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
