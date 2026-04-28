import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
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

interface IncomingRow {
  phone_number?: string;
  address?: string;
  bedrijf?: string;
  postcode?: string;
  stad?: string;
  contactpersoon?: string;
  "extra-telefoon-nummer"?: string;
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

  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
  }
  if (body.rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (max ${MAX_ROWS})` },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();

  // Server-side normalize + validate
  const cleaned: { row: IncomingRow; phone: string; index: number }[] = [];
  const invalid: { index: number; reason: string }[] = [];

  body.rows.forEach((r, i) => {
    const phone = normalizePhone(r.phone_number);
    const address = (r.address || "").trim();
    const bedrijf = (r.bedrijf || "").trim();
    if (!phone) {
      invalid.push({ index: i, reason: "Missing/invalid phone_number" });
      return;
    }
    if (!address) {
      invalid.push({ index: i, reason: "Missing address" });
      return;
    }
    if (!bedrijf) {
      invalid.push({ index: i, reason: "Missing bedrijf" });
      return;
    }
    cleaned.push({ row: r, phone, index: i });
  });

  // Fetch existing phones (paged in case >1000 rows)
  const existing = new Set<string>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await admin
      .from("lifts")
      .select("phone_number")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch existing lifts" },
        { status: 500 }
      );
    }
    if (!data || data.length === 0) break;
    data.forEach((d) => existing.add(d.phone_number));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Dedup within payload + against DB
  const toInsert: IncomingRow[] = [];
  const duplicates: number[] = [];
  const seenInBatch = new Set<string>();

  for (const c of cleaned) {
    if (existing.has(c.phone) || seenInBatch.has(c.phone)) {
      duplicates.push(c.index);
      continue;
    }
    seenInBatch.add(c.phone);
    toInsert.push({
      phone_number: c.phone,
      address: (c.row.address || "").trim(),
      bedrijf: (c.row.bedrijf || "").trim(),
      postcode: (c.row.postcode || "").trim(),
      stad: (c.row.stad || "").trim(),
      contactpersoon: c.row.contactpersoon?.trim() || undefined,
      "extra-telefoon-nummer":
        c.row["extra-telefoon-nummer"]?.trim() || undefined,
    });
  }

  let inserted = 0;
  if (toInsert.length > 0) {
    const records = toInsert.map((r) => ({
      phone_number: r.phone_number,
      address: r.address,
      bedrijf: r.bedrijf,
      postcode: r.postcode || null,
      stad: r.stad || null,
      contactpersoon: r.contactpersoon || null,
      "extra-telefoon-nummer": r["extra-telefoon-nummer"] || null,
      is_active: true,
    }));

    const { error: insertError, count } = await admin
      .from("lifts")
      .insert(records, { count: "exact" });

    if (insertError) {
      return NextResponse.json(
        { error: "Insert failed", details: insertError.message },
        { status: 500 }
      );
    }
    inserted = count ?? records.length;
  }

  await logAudit(userClient, {
    user_id: user.id,
    user_email: user.email || null,
    action: "lift_imported",
    details: {
      total_rows: body.rows.length,
      inserted,
      duplicates: duplicates.length,
      invalid: invalid.length,
    },
  });

  return NextResponse.json({
    success: true,
    inserted,
    duplicates: duplicates.length,
    invalid,
    duplicate_indices: duplicates,
  });
}
