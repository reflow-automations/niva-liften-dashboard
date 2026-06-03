import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";

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

  let body: { lift_id: string; phone_number: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { lift_id, phone_number } = body;
  if (!lift_id || !phone_number) {
    return NextResponse.json({ error: "lift_id and phone_number are required" }, { status: 400 });
  }

  const normalized = normalizePhone(phone_number);
  if (!normalized) {
    return NextResponse.json({ error: "Ongeldig telefoonnummer" }, { status: 400 });
  }

  const { data: lift } = await supabase
    .from("lifts")
    .select("id, bedrijf, address, phone_number")
    .eq("id", lift_id)
    .single();

  if (!lift) {
    return NextResponse.json({ error: "Lift not found" }, { status: 404 });
  }

  // Check if new phone already in use by another lift
  const { data: conflict } = await supabase
    .from("lifts")
    .select("id")
    .eq("phone_number", normalized)
    .neq("id", lift_id)
    .maybeSingle();

  if (conflict) {
    return NextResponse.json({ error: "Dit telefoonnummer is al in gebruik bij een andere lift" }, { status: 409 });
  }

  const { error } = await supabase
    .from("lifts")
    .update({ phone_number: normalized })
    .eq("id", lift_id);

  if (error) {
    return NextResponse.json({ error: "Update mislukt" }, { status: 500 });
  }

  await logAudit(supabase, {
    user_id: user.id,
    user_email: user.email || null,
    action: "lift_phone_updated",
    details: {
      lift_id,
      lift_name: lift.bedrijf || lift.address,
      old_phone: lift.phone_number,
      new_phone: normalized,
    },
  });

  return NextResponse.json({ success: true, phone_number: normalized });
}
