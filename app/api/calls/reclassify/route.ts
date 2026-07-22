import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { logAudit } from "@/lib/audit";

// Hertypeer een "onbekend"-melding naar "test" nadat een medewerker de opname
// heeft beluisterd en heeft vastgesteld dat het een (verhaspelde) monteurtest
// was. Uitsluitend onbekend -> test; elke actie komt in de audit trail.

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

  let body: { call_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { call_id } = body;
  if (!call_id) {
    return NextResponse.json({ error: "call_id is required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: current } = await admin
    .from("call_logs")
    .select("id, call_sid, call_type, acknowledged_at, lift_id, start_time")
    .eq("id", call_id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }
  if (current.call_type !== "onbekend") {
    return NextResponse.json(
      { error: "Alleen 'onbekend'-meldingen kunnen naar 'test' worden hertypeerd" },
      { status: 400 }
    );
  }

  // Hertyperen impliceert dat de melding beoordeeld is: zet ook acknowledged_at.
  const acknowledged_at = current.acknowledged_at || new Date().toISOString();
  const { error } = await admin
    .from("call_logs")
    .update({ call_type: "test", status: "test_succes", acknowledged_at })
    .eq("id", call_id);

  if (error) {
    return NextResponse.json({ error: "Failed to update call" }, { status: 500 });
  }

  // De normale weg naar last_test_at loopt via een n8n-webhook die de AI
  // tijdens het live gesprek zelf aanroept zodra een test wordt bevestigd.
  // Bij deze calls kwam de AI daar nooit aan toe (stilte/verhaspeling), dus
  // die registratie is hier nooit gebeurd. Zet 'm alsnog, op de call-starttijd
  // (niet op "nu"), en alleen als dat niet ouder is dan een eventuele
  // inmiddels al geregistreerde, echte test.
  if (current.lift_id && current.start_time) {
    const { data: lift } = await admin
      .from("lifts")
      .select("last_test_at")
      .eq("id", current.lift_id)
      .single();

    if (!lift?.last_test_at || new Date(current.start_time) > new Date(lift.last_test_at)) {
      await admin
        .from("lifts")
        .update({ last_test_at: current.start_time })
        .eq("id", current.lift_id);
    }
  }

  await logAudit(admin, {
    user_id: user.id,
    user_email: user.email || null,
    action: "call_reclassified",
    details: {
      call_id,
      call_sid: current.call_sid,
      from_type: "onbekend",
      to_type: "test",
      acknowledged_at,
    },
  });

  return NextResponse.json({ success: true, call_type: "test", acknowledged_at });
}
