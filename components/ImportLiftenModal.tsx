"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { X, Upload, FileText, ArrowRight, Check, AlertCircle, Loader2 } from "lucide-react";
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

interface PreviewRow {
  index: number;
  data: Record<string, string>;
  normalizedPhone: string;
  status: "new" | "duplicate" | "invalid";
  reason?: string;
}

export default function ImportLiftenModal({ onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, DbField>>({});
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    duplicates: number;
    invalid: { index: number; reason: string }[];
  } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
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

  const previewRows = useMemo<PreviewRow[]>(() => {
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
        return {
          index,
          data,
          normalizedPhone: "",
          status: "invalid",
          reason: "Geen geldig telefoonnummer",
        };
      if (!data.address)
        return {
          index,
          data,
          normalizedPhone: phone,
          status: "invalid",
          reason: "Geen adres",
        };
      if (!data.bedrijf)
        return {
          index,
          data,
          normalizedPhone: phone,
          status: "invalid",
          reason: "Geen bedrijf",
        };
      if (seen.has(phone))
        return {
          index,
          data,
          normalizedPhone: phone,
          status: "duplicate",
          reason: "Duplicaat in CSV",
        };
      seen.add(phone);
      return { index, data, normalizedPhone: phone, status: "new" };
    });
  }, [csv, mapping]);

  const counts = useMemo(() => {
    const c = { new: 0, duplicate: 0, invalid: 0 };
    previewRows.forEach((r) => c[r.status]++);
    return c;
  }, [previewRows]);

  const handleImport = async () => {
    setSubmitting(true);
    setServerError(null);
    const payload = previewRows
      .filter((r) => r.status === "new")
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
        duplicates: json.duplicates + counts.duplicate,
        invalid: json.invalid || [],
      });
      setStep("done");
      onImported();
    } catch {
      setServerError("Netwerkfout");
    }
    setSubmitting(false);
  };

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
                <p>
                  • Verplichte velden: telefoonnummer, adres, bedrijf
                </p>
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
                      <p className="text-xs text-text-muted mb-1">
                        Database veld
                      </p>
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
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-success-muted">
                  <p className="text-xs text-text-muted">Nieuw</p>
                  <p className="text-2xl font-bold text-success">{counts.new}</p>
                </div>
                <div className="p-4 rounded-xl bg-warning-muted">
                  <p className="text-xs text-text-muted">Duplicaat (skip)</p>
                  <p className="text-2xl font-bold text-warning">
                    {counts.duplicate}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-danger-muted">
                  <p className="text-xs text-text-muted">Fout (skip)</p>
                  <p className="text-2xl font-bold text-danger">
                    {counts.invalid}
                  </p>
                </div>
              </div>
              <p className="text-xs text-text-muted">
                Duplicaten in DB worden ook geskipt. Telefoonnummers worden
                genormaliseerd (bv `+31 6 12345` → `31612345`).
              </p>
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-hover sticky top-0">
                      <tr className="text-left text-xs text-text-muted">
                        <th className="px-3 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Bedrijf</th>
                        <th className="px-3 py-2 font-medium">Adres</th>
                        <th className="px-3 py-2 font-medium">Telefoon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 200).map((r) => (
                        <tr
                          key={r.index}
                          className="border-t border-border-subtle"
                        >
                          <td className="px-3 py-2 text-text-muted">
                            {r.index + 2}
                          </td>
                          <td className="px-3 py-2">
                            {r.status === "new" && (
                              <span className="px-2 py-0.5 rounded text-xs bg-success-muted text-success">
                                Nieuw
                              </span>
                            )}
                            {r.status === "duplicate" && (
                              <span
                                className="px-2 py-0.5 rounded text-xs bg-warning-muted text-warning"
                                title={r.reason}
                              >
                                Duplicaat
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
                          <td className="px-3 py-2 truncate max-w-40">
                            {r.data.bedrijf || "—"}
                          </td>
                          <td className="px-3 py-2 truncate max-w-40">
                            {r.data.address || "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {r.normalizedPhone || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewRows.length > 200 && (
                  <div className="px-3 py-2 text-xs text-text-muted bg-surface-hover border-t border-border">
                    Eerste 200 van {previewRows.length} rijen weergegeven
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
                  {result.inserted} liften toegevoegd,{" "}
                  {result.duplicates} duplicaten geskipt,{" "}
                  {result.invalid.length} fouten.
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
                  onClick={() => setStep("preview")}
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
                  disabled={submitting || counts.new === 0}
                  onClick={handleImport}
                  className="px-4 py-2 rounded-lg text-sm bg-accent text-white font-medium hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Importeer {counts.new} liften
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
