import { SupabaseClient } from "@supabase/supabase-js";

export type AuditAction =
  | "killswitch_toggled"
  | "lift_toggled"
  | "user_login"
  | "user_logout";

interface AuditLogEntry {
  user_id: string;
  user_email: string | null;
  action: AuditAction;
  details: Record<string, unknown>;
}

export async function logAudit(
  supabase: SupabaseClient,
  entry: AuditLogEntry
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: entry.user_id,
      user_email: entry.user_email,
      action: entry.action,
      details: entry.details,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Audit logging should never break the main flow
    console.error("Audit log failed:", err);
  }
}
