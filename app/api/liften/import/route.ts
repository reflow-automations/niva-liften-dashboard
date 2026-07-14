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

  // Fetch existing lifts with id + phone + address + bedrijf.
  // NB: one address+bedrijf can legitimately hold MULTIPLE lifts (building with
  // several elevators, each with its own phone). Rows are therefore paired by
  // phone FIRST; only the leftovers per key decide update/insert/ambiguous.
  const existingByPhone = new Set<string>();
  const dbLiftsByKey = new Map<string, { id: string; phone: string }[]>();

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
      const lifts = dbLiftsByKey.get(key) || [];
      lifts.push({ id: d.id, phone: d.phone_number });
      dbLiftsByKey.set(key, lifts);
    });
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Categorize per address+bedrijf key, pairing by phone first:
  // - CSV row whose phone already exists in DB        -> duplicate (skip)
  // - leftover rows, 0 unmatched DB lifts on the key  -> NEW sibling lift (insert)
  // - exactly 1 leftover row + 1 unmatched DB lift    -> unambiguous number update
  // - more on both sides                              -> ambiguous (skip, manual)
  const toInsert: IncomingRow[] = [];
  const toUpdate: { id: string; phone: string }[] = [];
  const duplicates: number[] = [];
  const ambiguous: number[] = [];
  const seenInBatch = new Set<string>();

  // Group leftover (non-duplicate) rows per key
  const leftoverByKey = new Map<string, { row: IncomingRow; phone: string; index: number }[]>();
  for (const c of cleaned) {
    if (existingByPhone.has(c.phone) || seenInBatch.has(c.phone)) {
      duplicates.push(c.index);
      continue;
    }
    seenInBatch.add(c.phone);
    const key = `${(c.row.address || "").trim().toLowerCase()}|${(c.row.bedrijf || "").trim().toLowerCase()}`;
    const rows = leftoverByKey.get(key) || [];
    rows.push(c);
    leftoverByKey.set(key, rows);
  }

  const pushInsert = (c: { row: IncomingRow; phone: string }) => {
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
  };

  // A DB lift is "matched" when any CSV row (including duplicate-marked ones)
  // carries its phone; only unmatched lifts are update candidates.
  const allCsvPhones = new Set(cleaned.map((c) => c.phone));
  for (const [key, rows] of leftoverByKey) {
    const dbLifts = dbLiftsByKey.get(key) || [];
    const unmatchedDbLifts = dbLifts.filter((l) => !allCsvPhones.has(l.phone));

    if (unmatchedDbLifts.length === 0) {
      // Every DB lift on this address is accounted for -> leftover rows are new sibling lifts
      rows.forEach(pushInsert);
    } else if (unmatchedDbLifts.length === 1 && rows.length === 1) {
      // One lift with a stale number + one new number -> unambiguous update
      toUpdate.push({ id: unmatchedDbLifts[0].id, phone: rows[0].phone });
    } else {
      // Multiple candidates on both sides: cannot tell which lift got which number
      rows.forEach((c) => ambiguous.push(c.index));
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
