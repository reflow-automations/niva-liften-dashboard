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
    .select("id")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: "Failed to update call" },
      { status: 500 }
    );
  }

  await logAudit(supabase, {
    user_id: user.id,
    user_email: user.email || null,
    action: "call_acknowledged",
    details: { call_id, acknowledged },
  });

  return NextResponse.json({ success: true, acknowledged_at });
}
