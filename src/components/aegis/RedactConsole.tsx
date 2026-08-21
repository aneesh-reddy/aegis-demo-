import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Download,
  FileText,
  Loader2,
  Radio,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AegisFailure,
  AegisRunResult,
  DocumentTypeOverride,
  RenderedPage,
} from "@/lib/aegis-runtime";

type Phase = "idle" | "working" | "done" | "error";

interface SourceDoc {
  file: File;
  label: string;
  synthetic: boolean;
}

const SAMPLES: Array<{ id: string; label: string; description: string; url: string; filename: string }> = [
  {
    id: "w2",
    label: "Form W-2",
    description: "SSN in box a, plus an EIN and an employee ID that must survive",
    url: "/samples/sample-w2.pdf",
    filename: "sample-w2.pdf",
  },
  {
    id: "bank",
    label: "Bank statement",
    description: "Account, routing and member numbers, plus transaction references",
    url: "/samples/sample-bank-statement.pdf",
    filename: "sample-bank-statement.pdf",
  },
];

const DOC_TYPES: Array<{ value: DocumentTypeOverride; label: string }> = [
  { value: "AUTO", label: "Auto-detect" },
  { value: "W2", label: "W-2" },
  { value: "FORM_1040", label: "Form 1040" },
  { value: "BANK_STATEMENT", label: "Bank statement" },
  { value: "PAYSLIP", label: "Payslip" },
];

/** Avoids importing the browser-only runtime until the user actually acts. */
const runtime = () => import("@/lib/aegis-runtime");

/** Mono caps label sized for the dark console surface. */
function consoleCaps({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-[0.6875rem] uppercase leading-none tracking-[0.14em] text-console-muted ${className}`}>
      {children}
    </span>
  );
}

/**
 * The samples are fictional, so their values are shown in full — that is the
 * point of the report. A visitor's own document is not: show only the last four
 * digits so a shoulder-surfer or a screenshot of this page leaks nothing.
 */
function maskLocalValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  return `${"•".repeat(trimmed.length - 4)}${trimmed.slice(-4)}`;
}

export function RedactConsole() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<SourceDoc | null>(null);
  const [before, setBefore] = useState<RenderedPage | null>(null);
  const [after, setAfter] = useState<RenderedPage | null>(null);
  const [result, setResult] = useState<AegisRunResult | null>(null);
  const [failure, setFailure] = useState<AegisFailure | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [outputTextChars, setOutputTextChars] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const [documentType, setDocumentType] = useState<DocumentTypeOverride>("AUTO");
  const [redactPhone, setRedactPhone] = useState(false);
  const [redactDob, setRedactDob] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Warm pdf.js + the SDK once the console is interactive.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) void runtime().then((m) => m.prewarm());
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setSource(null);
    setBefore(null);
    setAfter(null);
    setResult(null);
    setFailure(null);
    setProgress(0);
    setStage("");
    setOutputTextChars(null);
  }, []);

  const process = useCallback(
    async (doc: SourceDoc, opts: { documentType: DocumentTypeOverride; redactPhone: boolean; redactDob: boolean }) => {
      const mod = await runtime();
      const controller = new AbortController();
      abortRef.current = controller;

      setSource(doc);
      setPhase("working");
      setFailure(null);
      setResult(null);
      setAfter(null);
      setProgress(0);
      setOutputTextChars(null);
      setStage("Loading pdf.js and the SDK");

      try {
        // Render the original first so the visitor sees what went in.
        const originalBytes = await doc.file.arrayBuffer();
        setStage("Rendering the original");
        const beforePage = await mod.renderPage(originalBytes, 1);
        setBefore(beforePage);

        setStage("Extracting text, classifying, detecting");
        const run = await mod.runRedaction(doc.file, {
          documentType: opts.documentType,
          redactPhone: opts.redactPhone,
          redactDob: opts.redactDob,
          signal: controller.signal,
          onProgress: (fraction) => setProgress(Math.max(0, Math.min(1, fraction))),
        });

        setStage("Rendering the redacted output");
        const afterPage = await mod.renderPage(run.redactedPDF, 1);

        // Prove the output has no text layer left to recover.
        const stats = await mod.textLayerStats(run.redactedPDF);

        setAfter(afterPage);
        setResult(run);
        setOutputTextChars(stats.characters);
        setProgress(1);
        setStage("");
        setPhase("done");
        requestAnimationFrame(() =>
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      } catch (err) {
        setFailure(mod.toFailure(err));
        setPhase("error");
        setStage("");
      } finally {
        abortRef.current = null;
      }
    },
    [],
  );

  const runSample = useCallback(
    async (sample: (typeof SAMPLES)[number]) => {
      try {
        setPhase("working");
        setStage("Fetching the sample document");
        const response = await fetch(sample.url);
        if (!response.ok) throw new Error(`Could not load ${sample.filename}`);
        const blob = await response.blob();
        const file = new File([blob], sample.filename, { type: "application/pdf" });
        await process({ file, label: sample.label, synthetic: true }, { documentType, redactPhone, redactDob });
      } catch (err) {
        const mod = await runtime();
        setFailure(mod.toFailure(err));
        setPhase("error");
      }
    },
    [process, documentType, redactPhone, redactDob],
  );

  const acceptFile = useCallback(
    (file: File) => {
      void process({ file, label: file.name, synthetic: false }, { documentType, redactPhone, redactDob });
    },
    [process, documentType, redactPhone, redactDob],
  );

  const rerun = useCallback(() => {
    if (source) void process(source, { documentType, redactPhone, redactDob });
  }, [source, process, documentType, redactPhone, redactDob]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const working = phase === "working";

  return (
    <div className="overflow-hidden border border-console-border">
      {/* ── Editor title bar — lightish dark chrome ───────────────────── */}
      <div className="flex items-center gap-3 border-b border-console-border bg-console px-4 py-2.5 text-console-fg">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="size-3 rounded-full bg-signal" />
          <span className="size-3 rounded-full bg-warn" />
          <span className="size-3 rounded-full bg-verified" />
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <FileText className="size-3.5 text-console-muted" aria-hidden />
          <span className="text-console-fg">aegis-redact</span>
          <span className="text-console-muted">/ redact.tsx</span>
        </div>
        <div className="ml-auto flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-console-muted">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-console-verified opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-console-verified" />
          </span>
          running locally
        </div>
      </div>

      {/* ── Options — light editor surface ──────────────────────────── */}
      <div className="grid gap-4 border-b border-border bg-surface px-4 py-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="doc-type" className="label-caps">
            Document type
          </Label>
          <Select
            value={documentType}
            onValueChange={(value) => setDocumentType(value as DocumentTypeOverride)}
            disabled={working}
          >
            <SelectTrigger id="doc-type" className="rounded-none font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {DOC_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value} className="font-mono text-xs">
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-start justify-between gap-3 sm:border-l sm:border-border sm:pl-4">
          <div className="space-y-1">
            <Label htmlFor="redact-phone" className="label-caps">
              redactPhone
            </Label>
            <p className="text-xs text-muted-foreground">Off by default</p>
          </div>
          <Switch id="redact-phone" checked={redactPhone} onCheckedChange={setRedactPhone} disabled={working} />
        </div>

        <div className="flex items-start justify-between gap-3 sm:border-l sm:border-border sm:pl-4">
          <div className="space-y-1">
            <Label htmlFor="redact-dob" className="label-caps">
              redactDob
            </Label>
            <p className="text-xs text-muted-foreground">Off by default</p>
          </div>
          <Switch id="redact-dob" checked={redactDob} onCheckedChange={setRedactDob} disabled={working} />
        </div>
      </div>

      <p className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
        Phone and date of birth are opt-in on purpose: income verification needs them for identity
        matching, so redacting them cuts the document's utility without a matching privacy gain.
      </p>

      {/* ── Idle — light editor + upload ─────────────────────────────── */}
      {phase === "idle" && (
        <div id="upload" className="scroll-mt-24 bg-surface p-4 sm:p-6">
          <p className="mb-4 text-center font-mono text-[11px] uppercase tracking-[0.24em] text-signal">
            Step 1 — upload a document
          </p>
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
              if (file) acceptFile(file);
            }}
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-14 text-center transition-colors ${
              dragging ? "border-signal bg-signal/10" : "border-signal/50 bg-signal/[0.03]"
            }`}
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-signal/10">
              <Upload className="size-6 text-signal" aria-hidden />
            </div>
            <div>
              <p className="text-base font-medium">Drop your PDF here</p>
              <p className="mt-1 text-xs text-muted-foreground">Up to 10 MB and 50 pages</p>
            </div>
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-none border-2 border-foreground bg-foreground font-mono text-xs uppercase tracking-widest text-background transition-colors hover:bg-background hover:text-foreground"
            >
              Choose file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) acceptFile(file);
                event.target.value = "";
              }}
            />
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Your file is read into this browser tab and never transmitted. Open the Network panel
              before you drop it — you will see no upload.
            </p>
          </div>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="label-caps">or try a synthetic sample</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {SAMPLES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => void runSample(sample)}
                className="group flex flex-col items-start gap-2 border border-border bg-background p-4 text-left transition-colors hover:border-signal focus-visible:border-signal focus-visible:outline-none"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-2 font-mono text-sm">
                    <FileText className="size-4 text-signal" aria-hidden />
                    {sample.label}
                  </span>
                  <ArrowRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-signal"
                    aria-hidden
                  />
                </div>
                <span className="text-xs leading-relaxed text-muted-foreground">{sample.description}</span>
                <span className="mt-1 border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Synthetic
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Working — dark console output ────────────────────────────── */}
      {working && (
        <div className="space-y-4 bg-console p-6 text-console-fg">
          <div className="flex items-center gap-3">
            <Loader2 className="size-4 animate-spin text-console-signal" aria-hidden />
            <span className="font-mono text-sm text-console-fg">{stage || "Working"}</span>
          </div>
          <div
            className="h-1 w-full overflow-hidden bg-console-border"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-console-signal transition-[width] duration-200"
              style={{ width: `${Math.max(4, progress * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-console-muted">
              {Math.round(progress * 100)}%
              {source ? ` · ${source.label}` : ""}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancel}
              className="rounded-none border border-console-border font-mono text-xs uppercase tracking-widest text-console-muted hover:bg-console-border hover:text-console-fg"
            >
              <Ban className="mr-1.5 size-3.5" aria-hidden />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Error — dark console ──────────────────────────────────────── */}
      {phase === "error" && failure && (
        <div className="space-y-4 bg-console p-6 text-console-fg">
          <div className="flex items-start gap-3 border border-console-signal/40 bg-console-signal/10 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-console-signal" aria-hidden />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {consoleCaps({ children: failure.code, className: "text-console-signal" })}
              </div>
              <p className="text-sm font-medium text-console-fg">{failure.title}</p>
              <p className="text-xs leading-relaxed text-console-muted">{failure.detail}</p>
              <p className="font-mono text-[11px] text-console-muted/70">{failure.raw}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              className="rounded-none border-console-border bg-transparent font-mono text-xs uppercase tracking-widest text-console-muted hover:bg-console-border hover:text-console-fg"
            >
              <RotateCcw className="mr-1.5 size-3.5" aria-hidden />
              {failure.retryWithNewFile ? "Try another document" : "Start over"}
            </Button>
            {!failure.retryWithNewFile && source && (
              <Button
                type="button"
                onClick={rerun}
                className="rounded-none border border-console-fg bg-console-fg font-mono text-xs uppercase tracking-widest text-console hover:bg-console-fg/90"
              >
                Retry with these options
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Result — editor split view + console output ──────────────── */}
      {phase === "done" && result && (
        <div ref={resultsRef}>
          <p className="bg-console px-4 pt-4 text-center font-mono text-[11px] uppercase tracking-[0.24em] text-console-signal">
            Step 2 — see what the redaction destroyed
          </p>

          {/* Before / after — light editor panes */}
          <div className="grid gap-px bg-console-border sm:grid-cols-2">
            <figure className="bg-surface p-4">
              <figcaption className="mb-3 flex items-center justify-between">
                <span className="label-caps">Before — original</span>
                <span className="font-mono text-[11px] text-muted-foreground">text layer present</span>
              </figcaption>
              {before && (
                <img
                  src={before.dataUrl}
                  alt={`Original first page of ${source?.label ?? "the document"}, with sensitive fields still visible`}
                  className="w-full border-2 border-border shadow-sm"
                />
              )}
            </figure>
            <figure className="bg-surface p-4">
              <figcaption className="mb-3 flex items-center justify-between">
                <span className="label-caps text-signal">After — redacted</span>
                <span className="font-mono text-[11px] text-verified">
                  {outputTextChars === 0 ? "no text layer" : `${outputTextChars ?? "?"} chars`}
                </span>
              </figcaption>
              {after && (
                <img
                  src={after.dataUrl}
                  alt={`Redacted first page of ${source?.label ?? "the document"}, with sensitive fields destroyed at the pixel level`}
                  className="w-full border-2 border-signal/50 shadow-sm"
                />
              )}
            </figure>
          </div>

          {/* Telemetry — dark console strip */}
          <dl className="grid grid-cols-2 gap-px bg-console-border sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Document type", result.documentType],
              ["Redactions", String(result.redactionCount)],
              ["Fields found", String(result.detected.length)],
              ["Confidence", result.confidence],
              ["OCR used", result.ocrUsed ? "yes" : "no"],
              ["Duration", `${result.durationMs} ms`],
            ].map(([term, value]) => (
              <div key={term} className="bg-console px-4 py-3">
                <dt className="font-mono text-[0.6875rem] uppercase leading-none tracking-[0.14em] text-console-muted">
                  {term}
                </dt>
                <dd className="mt-1.5 font-mono text-sm text-console-fg">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Network proof — dark console */}
          <div className="flex flex-wrap items-center gap-3 bg-console px-4 py-3 text-console-fg">
            <Radio className="size-4 text-console-verified" aria-hidden />
            <span className="font-mono text-xs text-console-fg">
              Network requests during redaction:{" "}
              <span className={result.networkCallsDuringRun === 0 ? "text-console-verified" : "text-console-signal"}>
                {result.networkCallsDuringRun}
              </span>
            </span>
            <span className="text-xs text-console-muted">
              Measured by instrumenting fetch and XMLHttpRequest for the duration of the call.
            </span>
          </div>

          {/* Detection report — dark console, code-gutter style */}
          <div className="bg-console text-console-fg">
            <div className="flex items-center justify-between border-b border-console-border px-4 py-3">
              {consoleCaps({ children: "Detection report" })}
              <span className="font-mono text-[11px] text-console-muted">from result.detected</span>
            </div>
            {result.detected.length === 0 ? (
              <p className="px-4 py-6 text-sm text-console-muted">No fields detected in this document.</p>
            ) : (
              <div className="console-scroll" tabIndex={0} role="region" aria-label="Detection report table">
                <table className="w-max min-w-full border-collapse text-left font-mono text-xs">

                  <thead>
                    <tr className="border-b border-console-border">
                      <th scope="col" className="w-8 select-none px-2 py-2.5 text-console-muted/50">#</th>
                      {["Type", "Value", "Confidence", "Path", "Zone", "NER"].map((head) => (
                        <th
                          key={head}
                          scope="col"
                          className="px-4 py-2.5 font-mono text-[0.6875rem] font-normal uppercase leading-none tracking-[0.14em] text-console-muted"
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.detected.map((field, index) => (
                      <tr key={`${field.type}-${field.value}-${index}`} className="border-b border-console-border/60 hover:bg-console-border/40">
                        <td className="select-none px-2 py-2.5 text-right text-console-muted/50">{index + 1}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-console-signal">{field.type}</span>
                          {field.isItin && (
                            <span className="ml-2 border border-console-border px-1 py-0.5 text-[10px] uppercase text-console-muted">
                              ITIN
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-console-muted">
                          {source?.synthetic ? field.rawText : maskLocalValue(field.rawText)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={
                              field.confidence === "HIGH"
                                ? "text-console-verified"
                                : field.confidence === "MEDIUM"
                                  ? "text-warn"
                                  : "text-console-muted"
                            }
                          >
                            {field.confidence}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-console-muted">{field.path}</td>
                        <td className="px-4 py-2.5 text-console-muted">{field.zone}</td>
                        <td className="px-4 py-2.5 text-console-muted">
                          {field.nerConfirmed ? "yes" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {result.warnings.length > 0 && (
            <div className="bg-console px-4 py-3 text-console-fg">
              {consoleCaps({ children: "Warnings" })}
              <ul className="mt-2 space-y-1.5">
                {result.warnings.map((warning) => (
                  <li key={warning} className="flex gap-2 text-xs text-warn">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions — dark console bar */}
          <div className="flex flex-wrap items-center gap-3 bg-console px-4 py-4 text-console-fg">
            <Button
              type="button"
              onClick={async () => {
                const mod = await runtime();
                mod.downloadPdf(result.redactedPDF, `redacted-${source?.file.name ?? "document.pdf"}`);
              }}
              className="rounded-none border border-console-fg bg-console-fg font-mono text-xs uppercase tracking-widest text-console hover:bg-console-fg/90"
            >
              <Download className="mr-1.5 size-3.5" aria-hidden />
              Download redacted PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={rerun}
              className="rounded-none border-console-border bg-transparent font-mono text-xs uppercase tracking-widest text-console-muted hover:bg-console-border hover:text-console-fg"
            >
              <RotateCcw className="mr-1.5 size-3.5" aria-hidden />
              Re-run with current options
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={reset}
              className="rounded-none font-mono text-xs uppercase tracking-widest text-console-muted hover:bg-console-border hover:text-console-fg"
            >
              New document
            </Button>
            <span className="ml-auto font-mono text-[11px] text-console-muted">
              sdk {result.sdkVersion} · spec {result.specVersion}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
