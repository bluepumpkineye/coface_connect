"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { useStore } from "@/components/AppStore";
import { Button, Card, CardHeader, Pill, Spinner } from "@/components/ui";
import {
  buildTemplateCsv,
  FIELD_LABELS,
  guessMapping,
  REQUIRED_FIELDS,
  SAMPLE_ROWS,
  TEMPLATE_HEADERS,
  type TemplateField,
} from "@/lib/upload";
import { formatMoney, formatPct } from "@/lib/format";
import type { IngestionSummary } from "@/lib/types";

type ParsedFile = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
};

export function UploadData() {
  const { ingestRows, working, pushToast, data } = useStore();
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<TemplateField, string>>(() =>
    Object.fromEntries(TEMPLATE_HEADERS.map((field) => [field, ""])) as Record<TemplateField, string>,
  );
  const [replace, setReplace] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [summary, setSummary] = useState<IngestionSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const applyParsed = useCallback((next: ParsedFile) => {
    setParsed(next);
    setMapping(guessMapping(next.headers));
    setSummary(null);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true);
      try {
        const extension = file.name.split(".").pop()?.toLowerCase();
        if (extension === "xlsx" || extension === "xls") {
          const XLSX = await import("xlsx");
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
          const rows = json.map((row) => {
            const clean: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) clean[key] = String(value ?? "");
            return clean;
          });
          const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
          if (rows.length === 0) {
            pushToast("That workbook sheet appears to be empty.", "error");
            return;
          }
          applyParsed({ fileName: file.name, headers, rows });
        } else {
          const text = await file.text();
          const result = Papa.parse<Record<string, string>>(text, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim(),
          });
          if (!result.data.length) {
            pushToast("No data rows found in that CSV.", "error");
            return;
          }
          const headers = result.meta.fields ?? Object.keys(result.data[0] ?? {});
          applyParsed({ fileName: file.name, headers, rows: result.data });
        }
      } catch (caught) {
        pushToast(
          caught instanceof Error ? `Could not parse file: ${caught.message}` : "Could not parse file.",
          "error",
        );
      } finally {
        setParsing(false);
      }
    },
    [applyParsed, pushToast],
  );

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "coface-connect-buyer-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const mappedRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((row) => {
      const mapped: Record<string, unknown> = {};
      for (const field of TEMPLATE_HEADERS) {
        const header = mapping[field];
        mapped[field] = header ? row[header] : "";
      }
      return mapped;
    });
  }, [parsed, mapping]);

  const missingRequired = REQUIRED_FIELDS.filter((field) => !mapping[field]);
  const canImport = parsed !== null && mappedRows.length > 0 && missingRequired.length === 0;

  const runImport = async () => {
    if (!canImport) return;
    const result = await ingestRows(mappedRows, replace);
    if (result) setSummary(result);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-navy-900">Upload receivables ledger</h1>
          <p className="max-w-2xl text-[12.5px] leading-relaxed text-slate-500">
            Import the client&apos;s <strong className="font-semibold text-navy-800">full</strong>{" "}
            accounts receivable file — every buyer, not just the insured ones. Supported formats:{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">.csv</code> and{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">.xlsx</code>. Parsing
            and scoring happen entirely in your browser — your file never leaves this device.
          </p>
        </div>
        <Button variant="secondary" onClick={downloadTemplate}>
          <span aria-hidden>⤓</span> Download sample CSV template
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="1 · Choose a file"
            subtitle="Drag and drop, or browse. Nothing is stored until you import."
          />
          <div className="px-5 py-5">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
                dragging ? "border-brandteal bg-teal-50/50" : "border-slate-300 bg-slate-50/60"
              }`}
            >
              {parsing ? (
                <div className="flex items-center gap-2 text-[13px] font-semibold text-navy-800">
                  <Spinner className="h-4 w-4" /> Parsing file…
                </div>
              ) : (
                <>
                  <span className="text-2xl" aria-hidden>
                    📄
                  </span>
                  <p className="mt-2 text-[13px] font-semibold text-navy-900">
                    Drop your AR ledger here
                  </p>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    .csv or .xlsx · up to 2,000 buyer rows
                  </p>
                  <div className="mt-4">
                    <Button variant="primary" onClick={() => inputRef.current?.click()}>
                      Browse files
                    </Button>
                  </div>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                  event.target.value = "";
                }}
              />
            </div>

            {parsed ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
                <Pill tone="teal">{parsed.fileName}</Pill>
                <span className="text-slate-500">
                  {parsed.rows.length} rows · {parsed.headers.length} columns detected
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => {
                    setParsed(null);
                    setSummary(null);
                  }}
                >
                  Clear
                </Button>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Template reference"
            subtitle="Column names are matched automatically — aliases are supported"
          />
          <div className="thin-scroll max-h-[320px] overflow-auto px-5 py-4">
            <table className="w-full text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="py-1.5 pr-3 font-bold">Column</th>
                  <th className="py-1.5 pr-3 font-bold">Example</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TEMPLATE_HEADERS.map((field) => (
                  <tr key={field}>
                    <td className="py-1.5 pr-3">
                      <code className="rounded bg-slate-100 px-1 py-0.5 text-[10.5px] text-navy-800">
                        {field}
                      </code>
                      {REQUIRED_FIELDS.includes(field) ? (
                        <span className="ml-1.5 text-[9.5px] font-bold text-rose-600">required</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">{SAMPLE_ROWS[0][field]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {parsed ? (
        <Card>
          <CardHeader
            title="2 · Map columns"
            subtitle="Match each field to a column in your file. Unmapped optional fields use sensible defaults."
          />
          <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATE_HEADERS.map((field) => (
              <label key={field} className="flex flex-col gap-1">
                <span className="text-[11.5px] font-semibold text-slate-700">
                  {FIELD_LABELS[field]}
                  {REQUIRED_FIELDS.includes(field) ? (
                    <span className="ml-1 text-rose-600">*</span>
                  ) : null}
                </span>
                <select
                  value={mapping[field]}
                  onChange={(event) =>
                    setMapping((current) => ({ ...current, [field]: event.target.value }))
                  }
                  className={`h-9 rounded-lg border bg-white px-2.5 text-[12px] text-navy-900 outline-none focus:border-navy-500 ${
                    mapping[field] ? "border-slate-300" : "border-rose-300 bg-rose-50/40"
                  }`}
                >
                  <option value="">— not mapped —</option>
                  {parsed.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="border-t border-slate-200 px-5 py-3">
            <p className="label-xs mb-2">Preview — first 5 mapped rows</p>
            <div className="thin-scroll overflow-auto">
              <table className="w-full min-w-[820px] text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                    {TEMPLATE_HEADERS.map((field) => (
                      <th key={field} className="py-1.5 pr-3 font-bold">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mappedRows.slice(0, 5).map((row, index) => (
                    <tr key={index}>
                      {TEMPLATE_HEADERS.map((field) => (
                        <td key={field} className="py-1.5 pr-3 text-slate-600">
                          {String(row[field] ?? "") || <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <label className="flex items-center gap-2 text-[12px] font-medium text-slate-700">
              <input
                type="checkbox"
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-navy-800"
              />
              Replace the current portfolio (untick to append)
            </label>
            <div className="ml-auto flex items-center gap-3">
              {missingRequired.length > 0 ? (
                <span className="text-[11.5px] font-medium text-rose-600">
                  Map {missingRequired.map((field) => FIELD_LABELS[field]).join(" and ")} to continue
                </span>
              ) : null}
              <Button variant="teal" onClick={() => void runImport()} disabled={!canImport || !!working}>
                {working === "ingest" ? <Spinner className="h-3.5 w-3.5" /> : <span aria-hidden>⇪</span>}
                Import {mappedRows.length} buyers
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {summary ? (
        <Card>
          <CardHeader
            title="3 · Ingestion summary"
            subtitle="Scores and alerts have already been recalculated for the imported book"
            action={
              <Link href="/">
                <Button variant="primary" size="sm">
                  Go to dashboard →
                </Button>
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-4 px-5 py-5 lg:grid-cols-4">
            {[
              { label: "Buyers loaded", value: String(summary.loaded), tone: "text-navy-900" },
              {
                label: "Rows skipped",
                value: String(summary.skipped),
                tone: summary.skipped > 0 ? "text-amber-700" : "text-navy-900",
              },
              {
                label: "Already insured",
                value: `${summary.insuredCount} (${formatPct(summary.insuredPct, 0)})`,
                tone: "text-rose-700",
              },
              {
                label: "Total exposure",
                value: formatMoney(summary.totalExposure, { compact: true }),
                tone: "text-navy-900",
              },
            ].map((item) => (
              <div key={item.label} className="surface-muted px-4 py-3">
                <p className="label-xs">{item.label}</p>
                <p className={`numeric mt-1 text-xl font-semibold ${item.tone}`}>{item.value}</p>
              </div>
            ))}
          </div>
          <p className="border-t border-slate-200 px-5 py-3 text-[11.5px] text-slate-500">
            Imported buyers are scored with the same transparent four-factor model used across the
            app, and re-run through the alert engine.
          </p>
        </Card>
      ) : null}

      {data && data.summary.totalBuyers > 0 ? (
        <p className="text-[11.5px] text-slate-500">
          Current workspace: {data.summary.totalBuyers} buyers ·{" "}
          {formatMoney(data.summary.totalExposure, { compact: true })} outstanding.
        </p>
      ) : null}
    </div>
  );
}
