"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { X, Upload, FileText, ArrowRight, Check, AlertCircle, Loader2, Database, RefreshCw } from "lucide-react";
import { normalizePhone } from "@/lib/phone";

type DbField =
  | "phone_number"
  | "address"
  | "bedrijf"
  | "postcode"
  | "stad"
  | "contactpersoon"
  | "extra-telefoon-nummer"
  | "__ignore__";

const STATUS_LABELS: Record<RowStatus, string> = {
  new: "Nieuw",
  update: "Bijwerken",
  ambiguous: "Niet eenduidig",
  db_duplicate: "Al in DB",
  csv_duplicate: "CSV-dupe",
  invalid: "Fout",
};

const DB_FIELDS: { value: DbField; label: string; required: boolean }[] = [
  { value: "phone_number", label: "Telefoonnummer", required: true },
  { value: "address", label: "Adres", required: true },
  { value: "bedrijf", label: "Bedrijf", required: true },
  { value: "postcode", label: "Postcode", required: false },
  { value: "stad", label: "Stad", required: false },
  { value: "contactpersoon", label: "Contactpersoon", required: false },
  { value: "extra-telefoon-nummer", label: "Extra telefoon", required: false },
  { value: "__ignore__", label: "— negeer —", required: false },
];

function autoSuggest(header: string): DbField {
  const h = header.toLowerCase().trim();
  if (/(phone|telefoon|tel\b|nummer$|^nr$)/.test(h) && !/extra/.test(h))
    return "phone_number";
  if (/(extra.*tel|tel.*extra|2e.*tel|second)/.test(h))
    return "extra-telefoon-nummer";
  if (/(address|adres|straat)/.test(h)) return "address";
  if (/(bedrijf|company|naam|klant)/.test(h)) return "bedrijf";
  if (/(postcode|zip|postal)/.test(h)) return "postcode";
  if (/(stad|city|plaats|woonplaats)/.test(h)) return "stad";
  if (/(contact|persoon|name)/.test(h)) return "contactpersoon";
  return "__ignore__";
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

type Step = "upload" | "map" | "preview" | "done";

interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

type RowStatus = "new" | "update" | "ambiguous" | "csv_duplicate" | "db_duplicate" | "invalid";

interface PreviewRow {
  index: number;
  data: Record<string, string>;
  normalizedPhone: string;
  status: RowStatus;
  reason?: string;
}

interface ServerCheck {
  echt_nieuw: number;
  te_updaten: number;
  niet_eenduidig: number;
  al_in_db: number;
  csv_dupes: number;
  invalid: number;
  db_duplicate_phones: Set<string>;
  update_phones: Set<string>;
  ambiguous_phones: Set<string>;
}

export default function ImportLiftenModal({ onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, DbField>>({});
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [serverCheck, setServerCheck] = useState<ServerCheck | null>(null);
  const [result, setResult] = useState<{
    inserted: number;
    updated: number;
    duplicates: number;
    invalid: { index: number; reason: string }[];
  } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<RowStatus | "all">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setParsing(true);
    setParseError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        setParsing(false);
        if (res.errors.length > 0 && res.data.length === 0) {
          setParseError(res.errors[0].message);
          return;
        }
        const headers = res.meta.fields || [];
        if (headers.length === 0) {
          setParseError("Geen kolommen gevonden");
          return;
        }
        const initialMap: Record<string, DbField> = {};
        const used = new Set<DbField>();
        headers.forEach((h) => {
          const s = autoSuggest(h);
          if (s !== "__ignore__" && used.has(s)) {
            initialMap[h] = "__ignore__";
          } else {
            initialMap[h] = s;
            if (s !== "__ignore__") used.add(s);
          }
        });
        setCsv({ headers, rows: res.data });
        setMapping(initialMap);
        setStep("map");
      },
      error: (err) => {
        setParsing(false);
        setParseError(err.message);
      },
    });
  };

  const mappingValid = useMemo(() => {
    if (!csv) return false;
    const required: DbField[] = ["phone_number", "address", "bedrijf"];
    const mapped = new Set(Object.values(mapping));
    return required.every((f) => mapped.has(f));
  }, [csv, mapping]);

  // Client-side preview rows (CSV-level only - no DB knowledge yet)
  const clientRows = useMemo<PreviewRow[]>(() => {
    if (!csv) return [];
    const seen = new Set<string>();
    return csv.rows.map((row, index) => {
      const data: Record<string, string> = {};
      Object.entries(mapping).forEach(([csvCol, dbField]) => {
        if (dbField !== "__ignore__") {
          data[dbField] = (row[csvCol] || "").trim();
        }
      });
      const phone = normalizePhone(data.phone_number);
      if (!phone)
        return { index, data, normalizedPhone: "", status: "invalid", reason: "Geen geldig telefoonnummer" };
      if (!data.address)
        return { index, data, normalizedPhone: phone, status: "invalid", reason: "Geen adres" };
      if (!data.bedrijf)
        return { index, data, normalizedPhone: phone, status: "invalid", reason: "Geen bedrijf" };
      if (seen.has(phone))
        return { index, data, normalizedPhone: phone, status: "csv_duplicate", reason: "Duplicaat in CSV" };
      seen.add(phone);
      return { index, data, normalizedPhone: phone, status: "new" };
    });
  }, [csv, mapping]);

  // Merge server check result into rows
  const previewRows = useMemo<PreviewRow[]>(() => {
    if (!serverCheck) return clientRows;
    return clientRows.map((r) => {
      if (r.status === "new" && serverCheck.db_duplicate_phones.has(r.normalizedPhone)) {
        return { ...r, status: "db_duplicate", reason: "Al in database" };
      }
      if (r.status === "new" && serverCheck.update_phones.has(r.normalizedPhone)) {
        return { ...r, status: "update", reason: "Telefoonnummer wordt bijgewerkt" };
      }
      if (r.status === "new" && serverCheck.ambiguous_phones.has(r.normalizedPhone)) {
        return { ...r, status: "ambiguous", reason: "Meerdere liften op dit adres+bedrijf: niet te bepalen welke lift dit nummer moet krijgen. Pas handmatig aan via het liftenoverzicht." };
      }
      return r;
    });
  }, [clientRows, serverCheck]);

  const counts = useMemo(() => {
    const c = { new: 0, update: 0, ambiguous: 0, csv_duplicate: 0, db_duplicate: 0, invalid: 0 };
    previewRows.forEach((r) => c[r.status]++);
    return c;
  }, [previewRows]);

  const runServerCheck = useCallback(async () => {
    if (!csv) return;
    setChecking(true);
    setCheckError(null);
    setServerCheck(null);

    const payload = clientRows
      .filter((r) => r.status === "new" || r.status === "csv_duplicate")
      .map((r) => ({
        phone_number: r.normalizedPhone,
        address: r.data.address,
        bedrijf: r.data.bedrijf,
      }));

    try {
      const res = await fetch("/api/liften/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCheckError(json.error || "Controle mislukt");
        setChecking(false);
        return;
      }
      setServerCheck({
        echt_nieuw: json.echt_nieuw,
        te_updaten: json.te_updaten,
        niet_eenduidig: json.niet_eenduidig ?? 0,
        al_in_db: json.al_in_db,
        csv_dupes: json.csv_dupes,
        invalid: json.invalid,
        db_duplicate_phones: new Set<string>(json.db_duplicate_phones),
        update_phones: new Set<string>(json.update_phones),
        ambiguous_phones: new Set<string>(json.ambiguous_phones || []),
      });
    } catch {
      setCheckError("Netwerkfout bij DB-controle");
    }
    setChecking(false);
  }, [csv, clientRows]);

  useEffect(() => {
    if (step === "preview") {
      runServerCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleImport = async () => {
    setSubmitting(true);
    setServerError(null);
    // Send ALL valid rows, not just new/update: the server pairs rows to
    // existing lifts by phone per address+bedrijf, and needs the full batch
    // to know which DB lifts are already accounted for. Sending only the
    // "new" rows made an existing sibling lift look like an update target.
    const payload = previewRows
      .filter((r) => r.status !== "invalid")
      .map((r) => ({
        phone_number: r.normalizedPhone,
        address: r.data.address,
        bedrijf: r.data.bedrijf,
        postcode: r.data.postcode || "",
        stad: r.data.stad || "",
        contactpersoon: r.data.contactpersoon || "",
        "extra-telefoon-nummer": r.data["extra-telefoon-nummer"] || "",
      }));

    try {
      const res = await fetch("/api/liften/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error || "Import mislukt");
        setSubmitting(false);
        return;
      }
      setResult({
        inserted: json.inserted,
        updated: json.updated ?? 0,
        duplicates: json.duplicates,
        invalid: json.invalid || [],
      });
      setStep("done");
      onImported();
    } catch {
      setServerError("Netwerkfout");
    }
    setSubmitting(false);
  };

  const goToPreview = () => {
    setServerCheck(null);
    setCheckError(null);
    setTableFilter("all");
    setStep("preview");
  };

  const filteredRows = useMemo(
    () => (tableFilter === "all" ? previewRows : previewRows.filter((r) => r.status === tableFilter)),
    [previewRows, tableFilter]
  );

  const toggleFilter = (status: RowStatus) =>
    setTableFilter((f) => (f === status ? "all" : status));

  const actionCount = counts.new + counts.update;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-surface border border-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">Importeer liften via CSV</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {step === "upload" && "Stap 1 van 3 — upload"}
              {step === "map" && "Stap 2 van 3 — koppel kolommen"}
              {step === "preview" && "Stap 3 van 3 — controleer en importeer"}
              {step === "done" && "Klaar"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === "upload" && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-accent hover:bg-surface-hover transition-colors"
              >
                <Upload className="w-10 h-10 mx-auto text-text-muted mb-3" />
                <p className="font-medium">Klik om CSV te uploaden</p>
                <p className="text-sm text-text-muted mt-1">
                  Of sleep bestand hierheen
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
              {parsing && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Loader2 className="w-4 h-4 animate-spin" /> CSV parsen...
                </div>
              )}
              {parseError && (
                <div className="flex items-start gap-2 text-sm text-danger bg-danger-muted p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}
              <div className="text-xs text-text-muted space-y-1">
                <p>• Eerste rij = kolomnamen</p>
                <p>• Scheidingsteken `,` of `;` (autodetect)</p>
                <p>• Verplichte velden: telefoonnummer, adres, bedrijf</p>
              </div>
            </div>
          )}

          {step === "map" && csv && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <FileText className="w-4 h-4" />
                {csv.rows.length} rijen, {csv.headers.length} kolommen
              </div>
              <div className="space-y-2">
                {csv.headers.map((header) => (
                  <div
                    key={header}
                    className="grid grid-cols-[1fr,auto,1fr] items-center gap-3 p-3 rounded-xl bg-surface-hover border border-border-subtle"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-text-muted">CSV kolom</p>
                      <p className="font-medium truncate">{header}</p>
                      <p className="text-xs text-text-muted truncate mt-0.5">
                        bv: {csv.rows[0]?.[header] || "—"}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-text-muted" />
                    <div>
                      <p className="text-xs text-text-muted mb-1">Database veld</p>
                      <select
                        value={mapping[header] || "__ignore__"}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            [header]: e.target.value as DbField,
                          }))
                        }
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent cursor-pointer"
                      >
                        {DB_FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                            {f.required ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              {!mappingValid && (
                <div className="flex items-start gap-2 text-sm text-warning bg-warning-muted p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Verplichte velden ontbreken: telefoonnummer, adres en
                    bedrijf moeten gekoppeld zijn.
                  </span>
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              {/* DB check status banner */}
              {checking && (
                <div className="flex items-center gap-2 text-sm text-text-secondary bg-surface-hover p-3 rounded-xl border border-border">
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  <span>Controleren tegen database...</span>
                </div>
              )}
              {checkError && (
                <div className="flex items-start gap-2 text-sm text-danger bg-danger-muted p-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span>{checkError}</span>
                    <button
                      onClick={runServerCheck}
                      className="ml-2 underline cursor-pointer"
                    >
                      Opnieuw proberen
                    </button>
                  </div>
                </div>
              )}

              {/* Counts - 6 clickable filter tiles */}
              <div className="grid grid-cols-6 gap-2">
                <button
                  onClick={() => toggleFilter("new")}
                  className={`text-left p-3 rounded-xl bg-success-muted cursor-pointer transition-all ${tableFilter === "new" ? "ring-2 ring-success" : "hover:opacity-80"}`}
                >
                  <p className="text-xs text-text-muted">Echt nieuw</p>
                  <p className="text-2xl font-bold text-success">
                    {checking ? <Loader2 className="w-5 h-5 animate-spin mt-1" /> : counts.new}
                  </p>
                  {serverCheck && (
                    <p className="text-xs text-success mt-0.5">DB gecheckt ✓</p>
                  )}
                </button>
                <button
                  onClick={() => toggleFilter("update")}
                  className={`text-left p-3 rounded-xl bg-accent-muted border border-accent/20 cursor-pointer transition-all ${tableFilter === "update" ? "ring-2 ring-accent" : "hover:opacity-80"}`}
                >
                  <p className="text-xs text-text-muted">Bijwerken</p>
                  <p className="text-2xl font-bold text-accent">
                    {checking ? "…" : counts.update}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">nummer update</p>
                </button>
                <button
                  onClick={() => toggleFilter("ambiguous")}
                  title="Meerdere liften delen dit adres+bedrijf; niet te bepalen welke lift het nummer moet krijgen. Pas handmatig aan via het liftenoverzicht."
                  className={`text-left p-3 rounded-xl bg-warning-muted border border-warning/20 cursor-pointer transition-all ${tableFilter === "ambiguous" ? "ring-2 ring-warning" : "hover:opacity-80"}`}
                >
                  <p className="text-xs text-text-muted">Niet eenduidig</p>
                  <p className="text-2xl font-bold text-warning">
                    {checking ? "…" : counts.ambiguous}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">handmatig</p>
                </button>
                <button
                  onClick={() => toggleFilter("db_duplicate")}
                  className={`text-left p-3 rounded-xl bg-surface-hover border border-border cursor-pointer transition-all ${tableFilter === "db_duplicate" ? "ring-2 ring-text-secondary" : "hover:opacity-80"}`}
                >
                  <p className="text-xs text-text-muted">Al in DB</p>
                  <p className="text-2xl font-bold text-text-secondary">
                    {checking ? "…" : counts.db_duplicate}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">skip</p>
                </button>
                <button
                  onClick={() => toggleFilter("csv_duplicate")}
                  className={`text-left p-3 rounded-xl bg-warning-muted cursor-pointer transition-all ${tableFilter === "csv_duplicate" ? "ring-2 ring-warning" : "hover:opacity-80"}`}
                >
                  <p className="text-xs text-text-muted">CSV-dupe</p>
                  <p className="text-2xl font-bold text-warning">
                    {counts.csv_duplicate}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">skip</p>
                </button>
                <button
                  onClick={() => toggleFilter("invalid")}
                  className={`text-left p-3 rounded-xl bg-danger-muted cursor-pointer transition-all ${tableFilter === "invalid" ? "ring-2 ring-danger" : "hover:opacity-80"}`}
                >
                  <p className="text-xs text-text-muted">Fout</p>
                  <p className="text-2xl font-bold text-danger">{counts.invalid}</p>
                  <p className="text-xs text-text-muted mt-0.5">skip</p>
                </button>
              </div>
              {tableFilter !== "all" && (
                <button
                  onClick={() => setTableFilter("all")}
                  className="text-xs text-accent hover:underline cursor-pointer"
                >
                  ✕ Filter wissen (alle rijen tonen)
                </button>
              )}

              {/* Table */}
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="max-h-80 overflow-auto">
                  <table className="text-sm">
                    <thead className="bg-surface-hover sticky top-0">
                      <tr className="text-left text-xs text-text-muted">
                        <th className="px-3 py-2 font-medium whitespace-nowrap">#</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap">Status</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap">Bedrijf</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap">Adres</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap">Postcode</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap">Stad</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap">Telefoon</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap">Contactpersoon</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap">Extra telefoon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.slice(0, 500).map((r) => (
                        <tr
                          key={r.index}
                          className="border-t border-border-subtle"
                        >
                          <td className="px-3 py-2 text-text-muted whitespace-nowrap">
                            {r.index + 2}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.status === "new" && (
                              <span className="px-2 py-0.5 rounded text-xs bg-success-muted text-success">
                                Nieuw
                              </span>
                            )}
                            {r.status === "update" && (
                              <span
                                className="px-2 py-0.5 rounded text-xs bg-accent-muted text-accent"
                                title={r.reason}
                              >
                                Bijwerken
                              </span>
                            )}
                            {r.status === "ambiguous" && (
                              <span
                                className="px-2 py-0.5 rounded text-xs bg-warning-muted text-warning"
                                title={r.reason}
                              >
                                Niet eenduidig
                              </span>
                            )}
                            {r.status === "db_duplicate" && (
                              <span
                                className="px-2 py-0.5 rounded text-xs bg-surface-hover text-text-secondary border border-border"
                                title="Al aanwezig in database"
                              >
                                Al in DB
                              </span>
                            )}
                            {r.status === "csv_duplicate" && (
                              <span
                                className="px-2 py-0.5 rounded text-xs bg-warning-muted text-warning"
                                title={r.reason}
                              >
                                CSV-dupe
                              </span>
                            )}
                            {r.status === "invalid" && (
                              <span
                                className="px-2 py-0.5 rounded text-xs bg-danger-muted text-danger"
                                title={r.reason}
                              >
                                Fout
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap max-w-48 truncate">
                            {r.data.bedrijf || "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap max-w-48 truncate">
                            {r.data.address || "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.data.postcode || "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.data.stad || "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                            {r.normalizedPhone || "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.data.contactpersoon || "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.data["extra-telefoon-nummer"] || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredRows.length > 500 && (
                  <div className="px-3 py-2 text-xs text-text-muted bg-surface-hover border-t border-border">
                    Eerste 500 van {filteredRows.length} rijen weergegeven — gebruik de filters hierboven om in te zoomen
                  </div>
                )}
                {tableFilter !== "all" && (
                  <div className="px-3 py-2 text-xs text-text-muted bg-surface-hover border-t border-border">
                    {filteredRows.length} rijen met status &ldquo;{STATUS_LABELS[tableFilter]}&rdquo;
                  </div>
                )}
              </div>

              {serverError && (
                <div className="flex items-start gap-2 text-sm text-danger bg-danger-muted p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{serverError}</span>
                </div>
              )}
            </div>
          )}

          {step === "done" && result && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-success-muted flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-success" />
              </div>
              <div>
                <p className="text-xl font-semibold">Import voltooid</p>
                <p className="text-sm text-text-secondary mt-1">
                  {result.inserted} liften toegevoegd
                  {result.updated > 0 && `, ${result.updated} nummers bijgewerkt`}
                  {result.duplicates > 0 && `, ${result.duplicates} duplicaten geskipt`}
                  {result.invalid.length > 0 && `, ${result.invalid.length} fouten`}.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface-hover">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary cursor-pointer"
          >
            Annuleren
          </button>
          <div className="flex gap-2">
            {step === "map" && (
              <>
                <button
                  onClick={() => {
                    setCsv(null);
                    setStep("upload");
                  }}
                  className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-surface cursor-pointer"
                >
                  Terug
                </button>
                <button
                  disabled={!mappingValid}
                  onClick={goToPreview}
                  className="px-4 py-2 rounded-lg text-sm bg-accent text-white font-medium hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Volgende
                </button>
              </>
            )}
            {step === "preview" && (
              <>
                <button
                  onClick={() => setStep("map")}
                  className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-surface cursor-pointer"
                  disabled={submitting}
                >
                  Terug
                </button>
                <button
                  disabled={submitting || checking || actionCount === 0 || !!checkError}
                  onClick={handleImport}
                  className="px-4 py-2 rounded-lg text-sm bg-accent text-white font-medium hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {checking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Controleren...
                    </>
                  ) : submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Bezig...
                    </>
                  ) : counts.update > 0 && counts.new === 0 ? (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Update {counts.update} nummers
                    </>
                  ) : counts.update > 0 ? (
                    <>
                      <Database className="w-4 h-4" />
                      Importeer {counts.new} + update {counts.update}
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      Importeer {counts.new} liften
                    </>
                  )}
                </button>
              </>
            )}
            {step === "done" && (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm bg-accent text-white font-medium hover:opacity-90 cursor-pointer"
              >
                Sluiten
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
