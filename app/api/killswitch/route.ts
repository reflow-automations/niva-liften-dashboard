import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

const TWILIO_CHECK_URL =
  "https://killswitch-niva-liften-7141.twil.io/check-killswitch";
const TWILIO_TOGGLE_URL =
  "https://killswitch-niva-liften-7141.twil.io/toggle-killswitch";

// CSRF check: verify Origin header matches our domain
function isValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  // Allow requests without Origin (same-origin GET, server-side)
  if (!origin) return true;

  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

// GET - Check current killswitch status via Twilio
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(TWILIO_CHECK_URL, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to check killswitch status" },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to reach Twilio" },
      { status: 502 }
    );
  }
}

// POST - Toggle killswitch via Twilio
export async function POST(request: NextRequest) {
  // CSRF protection
  if (!isValidOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // First get current status so we can log what changed
    const checkRes = await fetch(TWILIO_CHECK_URL, { cache: "no-store" });
    const currentStatus = checkRes.ok ? await checkRes.json() : null;

    const res = await fetch(TWILIO_TOGGLE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: process.env.TWILIO_KILLSWITCH_SECRET || "",
      }).toString(),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to toggle killswitch" },
        { status: 502 }
      );
    }

    const data = await res.json();

    // Audit log
    await logAudit(supabase, {
      user_id: user.id,
      user_email: user.email || null,
      action: "killswitch_toggled",
      details: {
        previous_state: currentStatus?.killswitch_active ?? "unknown",
        new_state: data.killswitch_active ?? "unknown",
      },
    });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to reach Twilio" },
      { status: 502 }
    );
  }
}
