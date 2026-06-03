import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { logAudit } from "@/lib/audit";

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

  let body: { lift_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { lift_id } = body;
  if (!lift_id) {
    return NextResponse.json({ error: "lift_id is required" }, { status: 400 });
  }

  const { data: lift } = await supabase
    .from("lifts")
    .select("id, bedrijf, address, phone_number")
    .eq("id", lift_id)
    .single();

  if (!lift) {
    return NextResponse.json({ error: "Lift not found" }, { status: 404 });
  }

  // Use admin client to bypass RLS for delete
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("lifts")
    .delete()
    .eq("id", lift_id);

  if (error) {
    // Foreign key violation: lift has linked call logs
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "Lift heeft gesprekshistorie en kan niet worden verwijderd. Deactiveer de lift in plaats daarvan." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Verwijderen mislukt" }, { status: 500 });
  }

  await logAudit(supabase, {
    user_id: user.id,
    user_email: user.email || null,
    action: "lift_deleted",
    details: {
      lift_id,
      lift_name: lift.bedrijf || lift.address,
      phone_number: lift.phone_number,
    },
  });

  return NextResponse.json({ success: true });
}
