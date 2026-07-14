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

  // Fetch existing lifts with id + address + bedrijf for update matching.
  // NB: one address+bedrijf can legitimately hold MULTIPLE lifts (building with
  // several elevators, each with its own phone). Updating on this key is only
  // safe when exactly ONE lift in the DB has it — otherwise we'd overwrite a
  // sibling lift's number. Track all ids per key and skip ambiguous ones.
  const existingByPhone = new Set<string>();
  const addressBedrijfToIds = new Map<string, string[]>(); // "addr|bedrijf" -> lift ids

  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await admin
      .from("lifts")
      .select("id, phone_number, address, bedrijf")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch existing lifts" },
        { status: 500 }
      );
    }
    if (!data || data.length === 0) break;
    data.forEach((d) => {
      existingByPhone.add(d.phone_number);
      const key = `${(d.address || "").trim().toLowerCase()}|${(d.bedrijf || "").trim().toLowerCase()}`;
      const ids = addressBedrijfToIds.get(key) || [];
      ids.push(d.id);
      addressBedrijfToIds.set(key, ids);
    });
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Count CSV rows per address+bedrijf key: if the CSV itself has multiple rows
  // for one key (multiple lifts in one building), an update match is ambiguous too.
  const batchKeyCount = new Map<string, number>();
  for (const c of cleaned) {
    if (existingByPhone.has(c.phone)) continue; // will be skipped as duplicate anyway
    const key = `${(c.row.address || "").trim().toLowerCase()}|${(c.row.bedrijf || "").trim().toLowerCase()}`;
    batchKeyCount.set(key, (batchKeyCount.get(key) || 0) + 1);
  }

  // Categorize: insert, update (same address+bedrijf but different phone), or duplicate
  const toInsert: IncomingRow[] = [];
  const toUpdate: { id: string; phone: string }[] = [];
  const duplicates: number[] = [];
  const ambiguous: number[] = [];
  const seenInBatch = new Set<string>();

  for (const c of cleaned) {
    if (existingByPhone.has(c.phone) || seenInBatch.has(c.phone)) {
      duplicates.push(c.index);
      continue;
    }
    seenInBatch.add(c.phone);

    const key = `${(c.row.address || "").trim().toLowerCase()}|${(c.row.bedrijf || "").trim().toLowerCase()}`;
    const existingIds = addressBedrijfToIds.get(key);

    if (existingIds && (existingIds.length > 1 || (batchKeyCount.get(key) || 0) > 1)) {
      // Multiple lifts share this address+bedrijf (in DB and/or in the CSV):
      // updating would overwrite a sibling lift's number. Skip; needs manual fix.
      ambiguous.push(c.index);
    } else if (existingIds && existingIds.length === 1) {
      toUpdate.push({ id: existingIds[0], phone: c.phone });
    } else {
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
  }

  // Insert new lifts
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

  // Update phone numbers for existing lifts matched by address+bedrijf
  let updated = 0;
  for (const upd of toUpdate) {
    const { error: updateError } = await admin
      .from("lifts")
      .update({ phone_number: upd.phone })
      .eq("id", upd.id);
    if (!updateError) updated++;
  }

  await logAudit(userClient, {
    user_id: user.id,
    user_email: user.email || null,
    action: "lift_imported",
    details: {
      total_rows: body.rows.length,
      inserted,
      updated,
      duplicates: duplicates.length,
      ambiguous: ambiguous.length,
      invalid: invalid.length,
    },
  });

  return NextResponse.json({
    success: true,
    inserted,
    updated,
    duplicates: duplicates.length,
    ambiguous: ambiguous.length,
    invalid,
    duplicate_indices: duplicates,
    ambiguous_indices: ambiguous,
  });
}
