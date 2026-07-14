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
  const validRows: { phone: string; address: string; bedrijf: string }[] = [];
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
    validRows.push({ phone, address, bedrijf });
  }

  // Fetch all existing lifts (phone + address + bedrijf) from DB.
  // Count lifts per address+bedrijf key: multiple lifts can legitimately share
  // one building — an update match is only safe when the key is unique in the DB
  // AND unique within the CSV batch (see import route).
  const admin = createAdminSupabaseClient();
  const existingByPhone = new Set<string>();
  const addressBedrijfCount = new Map<string, number>(); // "address|bedrijf" -> # lifts

  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await admin
      .from("lifts")
      .select("phone_number, address, bedrijf")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: "Failed to fetch existing lifts" }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    data.forEach((d) => {
      existingByPhone.add(d.phone_number);
      const key = `${(d.address || "").trim().toLowerCase()}|${(d.bedrijf || "").trim().toLowerCase()}`;
      addressBedrijfCount.set(key, (addressBedrijfCount.get(key) || 0) + 1);
    });
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Count batch rows per key (excluding rows already in DB by phone)
  const batchKeyCount = new Map<string, number>();
  for (const row of validRows) {
    if (existingByPhone.has(row.phone)) continue;
    const key = `${row.address.toLowerCase()}|${row.bedrijf.toLowerCase()}`;
    batchKeyCount.set(key, (batchKeyCount.get(key) || 0) + 1);
  }

  const db_duplicate_phones: string[] = [];
  const update_phones: string[] = [];
  const ambiguous_phones: string[] = [];
  const new_phones: string[] = [];

  for (const row of validRows) {
    if (existingByPhone.has(row.phone)) {
      db_duplicate_phones.push(row.phone);
    } else {
      const key = `${row.address.toLowerCase()}|${row.bedrijf.toLowerCase()}`;
      const dbCount = addressBedrijfCount.get(key) || 0;
      if (dbCount === 1 && (batchKeyCount.get(key) || 0) === 1) {
        update_phones.push(row.phone);
      } else if (dbCount >= 1) {
        // Address+bedrijf exists but holds multiple lifts (or CSV has multiple
        // rows for it): can't tell which lift this number belongs to.
        ambiguous_phones.push(row.phone);
      } else {
        new_phones.push(row.phone);
      }
    }
  }

  return NextResponse.json({
    echt_nieuw: new_phones.length,
    te_updaten: update_phones.length,
    niet_eenduidig: ambiguous_phones.length,
    al_in_db: db_duplicate_phones.length,
    csv_dupes: csvDupeCount,
    invalid: invalidCount,
    db_duplicate_phones,
    update_phones,
    ambiguous_phones,
  });
}
