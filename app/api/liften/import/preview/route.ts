import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
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

interface IncomingRow {
  phone_number?: string;
  address?: string;
  bedrijf?: string;
}

const MAX_ROWS = 5000;

export async function POST(request: NextRequest) {
  if (!isValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const userClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { rows: IncomingRow[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows must be non-empty array" }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS})` }, { status: 400 });
  }

  // Validate + normalize client-sent rows
  const validPhones: string[] = [];
  let invalidCount = 0;
  const seenInBatch = new Set<string>();
  let csvDupeCount = 0;

  for (const r of body.rows) {
    const phone = normalizePhone(r.phone_number);
    const address = (r.address || "").trim();
    const bedrijf = (r.bedrijf || "").trim();

    if (!phone || !address || !bedrijf) {
      invalidCount++;
      continue;
    }
    if (seenInBatch.has(phone)) {
      csvDupeCount++;
      continue;
    }
    seenInBatch.add(phone);
    validPhones.push(phone);
  }

  // Fetch all existing phones from DB
  const admin = createAdminSupabaseClient();
  const existing = new Set<string>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await admin
      .from("lifts")
      .select("phone_number")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: "Failed to fetch existing lifts" }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    data.forEach((d) => existing.add(d.phone_number));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Split valid phones into echt_nieuw vs al_in_db
  const db_duplicate_phones: string[] = [];
  const new_phones: string[] = [];

  for (const phone of validPhones) {
    if (existing.has(phone)) {
      db_duplicate_phones.push(phone);
    } else {
      new_phones.push(phone);
    }
  }

  return NextResponse.json({
    echt_nieuw: new_phones.length,
    al_in_db: db_duplicate_phones.length,
    csv_dupes: csvDupeCount,
    invalid: invalidCount,
    db_duplicate_phones,
  });
}
