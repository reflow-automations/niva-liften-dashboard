import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
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

  let body: { lift_id: string; is_active: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { lift_id, is_active } = body;

  if (!lift_id || typeof is_active !== "boolean") {
    return NextResponse.json(
      { error: "lift_id (string) and is_active (boolean) are required" },
      { status: 400 }
    );
  }

  // Get current lift info for audit log
  const { data: lift } = await supabase
    .from("lifts")
    .select("id, bedrijf, address, is_active")
    .eq("id", lift_id)
    .single();

  if (!lift) {
    return NextResponse.json({ error: "Lift not found" }, { status: 404 });
  }

  // Update the lift
  const { error } = await supabase
    .from("lifts")
    .update({ is_active })
    .eq("id", lift_id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to update lift" },
      { status: 500 }
    );
  }

  // Audit log
  await logAudit(supabase, {
    user_id: user.id,
    user_email: user.email || null,
    action: "lift_toggled",
    details: {
      lift_id,
      lift_name: lift.bedrijf || lift.address,
      previous_state: lift.is_active,
      new_state: is_active,
    },
  });

  return NextResponse.json({ success: true, is_active });
}
