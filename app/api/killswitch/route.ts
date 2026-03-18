import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const TWILIO_WEBHOOK_URL =
  "https://killswitch-niva-liften-7141.twil.io/toggle-killswitch";

async function getSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

// GET - Read killswitch status from Supabase
export async function GET() {
  const supabase = await getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "killswitch_active")
      .single();

    if (error || !data) {
      // Setting doesn't exist yet, default to false (AI active)
      return NextResponse.json({ killswitch_active: false });
    }

    return NextResponse.json({
      killswitch_active: data.value === "true",
    });
  } catch {
    return NextResponse.json({ killswitch_active: false });
  }
}

// POST - Toggle killswitch via Twilio, then save state in Supabase
export async function POST() {
  const supabase = await getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Call Twilio to toggle
    const res = await fetch(TWILIO_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.TWILIO_KILLSWITCH_SECRET,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "Twilio responded with error", details: text },
        { status: 502 }
      );
    }

    const data = await res.json();
    const isActive = data.killswitch_active ?? false;

    // Save state in Supabase for future GET requests
    await supabase.from("app_settings").upsert(
      {
        key: "killswitch_active",
        value: String(isActive),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to reach Twilio",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
