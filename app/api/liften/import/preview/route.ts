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
  // One address+bedrijf can legitimately hold multiple lifts. Rows are paired
  // by phone first; only the leftovers per key decide update/insert/ambiguous
  // (same logic as the import route).
  const admin = createAdminSupabaseClient();
  const existingByPhone = new Set<string>();
  const dbPhonesByKey = new Map<string, string[]>(); // "address|bedrijf" -> phones

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
      const phones = dbPhonesByKey.get(key) || [];
      phones.push(d.phone_number);
      dbPhonesByKey.set(key, phones);
    });
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const db_duplicate_phones: string[] = [];
  const update_phones: string[] = [];
  const ambiguous_phones: string[] = [];
  const new_phones: string[] = [];

  // Group non-duplicate rows per key
  const leftoverByKey = new Map<string, { phone: string }[]>();
  for (const row of validRows) {
    if (existingByPhone.has(row.phone)) {
      db_duplicate_phones.push(row.phone);
      continue;
    }
    const key = `${row.address.toLowerCase()}|${row.bedrijf.toLowerCase()}`;
    const rows = leftoverByKey.get(key) || [];
    rows.push({ phone: row.phone });
    leftoverByKey.set(key, rows);
  }

  const allCsvPhones = new Set(validRows.map((r) => r.phone));
  for (const [key, rows] of leftoverByKey) {
    const dbPhones = dbPhonesByKey.get(key) || [];
    const unmatchedDbLifts = dbPhones.filter((p) => !allCsvPhones.has(p));

    if (unmatchedDbLifts.length === 0) {
      // All DB lifts on this address accounted for -> new sibling lifts
      rows.forEach((r) => new_phones.push(r.phone));
    } else if (unmatchedDbLifts.length === 1 && rows.length === 1) {
      update_phones.push(rows[0].phone);
    } else {
      rows.forEach((r) => ambiguous_phones.push(r.phone));
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
