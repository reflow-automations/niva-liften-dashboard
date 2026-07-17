import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { logAudit } from "@/lib/audit";

// CSRF check
function isValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { call_id: string; acknowledged: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { call_id, acknowledged } = body;

  if (!call_id || typeof acknowledged !== "boolean") {
    return NextResponse.json(
      { error: "call_id (string) and acknowledged (boolean) are required" },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();
  const acknowledged_at = acknowledged ? new Date().toISOString() : null;

  const { data: updated, error } = await admin
    .from("call_logs")
    .update({ acknowledged_at })
    .eq("id", call_id)
    .select("id, call_sid, call_type")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: "Failed to update call" },
      { status: 500 }
    );
  }

  // Audit via de admin-client: dit spoor is bewijsmateriaal (wie vinkte
  // wanneer aan/uit) en mag niet stilletjes sneuvelen op een RLS-policy.
  await logAudit(admin, {
    user_id: user.id,
    user_email: user.email || null,
    action: "call_acknowledged",
    details: {
      call_id,
      call_sid: updated.call_sid,
      call_type: updated.call_type,
      acknowledged,
      acknowledged_at,
    },
  });

  return NextResponse.json({ success: true, acknowledged_at });
}

// Controle-historie van één call: alle aan/uit-vinkacties met tijdstip en
// gebruiker, uit de append-only audit_logs. Alleen voor ingelogde gebruikers.
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const call_id = request.nextUrl.searchParams.get("call_id");
  if (!call_id) {
    return NextResponse.json({ error: "call_id is required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("audit_logs")
    .select("created_at, user_email, details")
    .eq("action", "call_acknowledged")
    .eq("details->>call_id", call_id)
    .order("created_at", { ascending: false });

  if (error) {
    // Tabel kan nog ontbreken tot de migratie is uitgevoerd; geef dan een
    // lege historie terug in plaats van een harde fout.
    return NextResponse.json({ history: [] });
  }

  return NextResponse.json({
    history: (data || []).map((row) => ({
      at: row.created_at,
      by: row.user_email,
      acknowledged: (row.details as { acknowledged?: boolean })?.acknowledged === true,
    })),
  });
}
