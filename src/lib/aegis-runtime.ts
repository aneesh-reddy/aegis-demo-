/**
 * Browser-only runtime wrapper around `aegis-redact`.
 *
 * Everything here touches OffscreenCanvas, pdf.js and the DOM, so nothing in
 * this module may be imported at the module scope of a route file — it is
 * dynamically imported from inside event handlers only.
 *
 * pdf.js is imported dynamically and the SAME instance is handed to the SDK via
 * `createAegis({ pdfjs })`, so the app ships exactly one copy of pdf.js and it
 * stays out of the entry chunk.
 */

/** Where we serve the pdf.js worker + standard font data from (CSP-safe path). */
export const ASSET_BASE_URL = "/aegis-assets";
export const STANDARD_FONT_DATA_URL = `${ASSET_BASE_URL}/standard_fonts/`;
const WORKER_SRC = `${ASSET_BASE_URL}/pdf.worker.min.mjs`;

export type DocumentTypeOverride =
  | "AUTO"
  | "W2"
  | "FORM_1040"
  | "BANK_STATEMENT"
  | "PAYSLIP";

export interface DetectedFieldView {
  type: string;
  value: string;
  rawText: string;
  confidence: string;
  path: string;
  zone: string;
  nerConfirmed: boolean;
  isItin?: boolean;
  bbox?: { x0: number; y0: number; x1: number; y1: number; page?: number };
}

export interface AegisRunResult {
  redactedPDF: ArrayBuffer;
  detected: DetectedFieldView[];
  redactionCount: number;
  confidence: string;
  documentType: string;
  ocrUsed: boolean;
  warnings: string[];
  sdkVersion: string;
  specVersion: string;
  /** Wall-clock duration of redact(), measured in the page. */
  durationMs: number;
  /** Network requests observed while redaction ran (should be 0). */
  networkCallsDuringRun: number;
}

/* ------------------------------------------------------------------ */
/* pdf.js                                                              */
/* ------------------------------------------------------------------ */

type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;

export function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      // The SDK also derives a worker URL from assetBaseUrl, but pdf.js reads
      // this global for any document WE open (the before/after previews).
      mod.GlobalWorkerOptions.workerSrc = WORKER_SRC;
      return mod;
    });
  }
  return pdfjsPromise;
}

/* ------------------------------------------------------------------ */
/* Aegis instance                                                      */
/* ------------------------------------------------------------------ */

type AegisInstance = {
  redact(input: File | Blob | ArrayBuffer | Uint8Array, options?: unknown): Promise<unknown>;
};

let aegisPromise: Promise<AegisInstance> | null = null;

export function loadAegis(): Promise<AegisInstance> {
  if (!aegisPromise) {
    aegisPromise = (async () => {
      const [{ createAegis }, pdfjs] = await Promise.all([
        import("aegis-redact/browser"),
        loadPdfjs(),
      ]);
      // assetBaseUrl: serve the worker + font data ourselves. The font data is
      // NOT optional — without it pdf.js cannot build glyph outlines for the
      // base-14 fonts and text extraction degrades silently, which means
      // missed detections.
      return (await createAegis({
        assetBaseUrl: ASSET_BASE_URL,
        pdfjs,
      })) as AegisInstance;
    })();
  }
  return aegisPromise;
}

/** Warm the SDK + pdf.js in the background so the first run feels instant. */
export function prewarm(): void {
  void loadAegis().catch(() => {
    /* surfaced properly on the real run */
  });
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type AegisErrorCode =
  | "FILE_TOO_LARGE"
  | "INVALID_PDF"
  | "CORRUPTED_PDF"
  | "PASSWORD_PROTECTED"
  | "UNKNOWN_DOCUMENT_TYPE"
  | "UNREADABLE_DOCUMENT"
  | "ALREADY_IMAGE_ONLY"
  | "REDACTION_FAILED"
  | "ABORTED";

export interface AegisFailure {
  code: AegisErrorCode | "UNEXPECTED";
  title: string;
  detail: string;
  /** True when the right response is "give us a different file". */
  retryWithNewFile: boolean;
  raw: string;
}

const FAILURES: Record<AegisErrorCode, { title: string; detail: string; retryWithNewFile: boolean }> = {
  FILE_TOO_LARGE: {
    title: "File too large",
    detail:
      "The SDK caps input at 10 MB and 50 pages. Bytes alone do not bound the work: every page is rasterised and PNG-embedded on the redaction path, so page count is capped too.",
    retryWithNewFile: true,
  },
  INVALID_PDF: {
    title: "Not a PDF",
    detail: "The file does not carry a PDF header. Only PDFs can be redacted.",
    retryWithNewFile: true,
  },
  CORRUPTED_PDF: {
    title: "Corrupted PDF",
    detail: "pdf.js could not parse the document structure. The file is likely damaged or truncated.",
    retryWithNewFile: true,
  },
  PASSWORD_PROTECTED: {
    title: "Password protected",
    detail:
      "The document is encrypted. Remove the password before redacting — the SDK will not guess or strip encryption.",
    retryWithNewFile: true,
  },
  UNKNOWN_DOCUMENT_TYPE: {
    title: "Could not classify the document",
    detail:
      "Auto-detection found no W-2, 1040, bank statement or payslip markers. Set the document type explicitly in the options panel to skip classification.",
    retryWithNewFile: false,
  },
  UNREADABLE_DOCUMENT: {
    title: "Unreadable document — do not treat this as a soft failure",
    detail:
      "The document classified as a type that always contains a redaction target, yet zero fields were detected. That almost always means the text layer failed silently. The SDK deliberately refuses to hand back a document it may not have redacted. Ask the user to re-upload.",
    retryWithNewFile: true,
  },
  ALREADY_IMAGE_ONLY: {
    title: "Already image-only",
    detail:
      "There is no text layer on any page, before OCR was attempted. This is almost always an Aegis output being run through Aegis a second time — or a flat scan.",
    retryWithNewFile: true,
  },
  REDACTION_FAILED: {
    title: "Redaction failed",
    detail: "The redaction pass could not complete. No partial result is returned by design.",
    retryWithNewFile: true,
  },
  ABORTED: {
    title: "Cancelled",
    detail: "The job was cancelled via its AbortSignal.",
    retryWithNewFile: false,
  },
};

/**
 * Build a searchable "name: message" string for any throwable.
 *
 * pdf.js exceptions (InvalidPDFException, PasswordException, …) extend its own
 * BaseException, NOT Error — so `instanceof Error` is false and reading .name /
 * .message off a typed Error would miss them entirely.
 */
function describeThrowable(err: unknown): string {
  if (err && typeof err === "object") {
    const record = err as { name?: unknown; message?: unknown };
    const name = typeof record.name === "string" ? record.name : "";
    const message = typeof record.message === "string" ? record.message : "";
    if (name || message) return `${name}: ${message}`.trim();
  }
  return String(err);
}

/**
 * This page opens the document itself to render the "before" panel, so a
 * rejected file can surface as a pdf.js exception rather than an AegisError.
 * Mapping those keeps the UI honest: a bad file must never be reported to the
 * visitor as a bug in this page.
 */
function codeFromPdfjsError(err: unknown): AegisErrorCode | undefined {
  const signature = describeThrowable(err).toLowerCase();
  if (signature.includes("password")) return "PASSWORD_PROTECTED";
  if (signature.includes("invalid pdf")) return "INVALID_PDF";
  if (signature.includes("abort")) return "ABORTED";
  if (
    signature.includes("unexpectedresponse") ||
    signature.includes("corrupt") ||
    signature.includes("xref") ||
    signature.includes("missing pdf")
  ) {
    return "CORRUPTED_PDF";
  }
  return undefined;
}

export function toFailure(err: unknown): AegisFailure {
  const raw = describeThrowable(err);
  const declared =
    err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
      ? ((err as { code: string }).code as AegisErrorCode)
      : undefined;

  const code = declared && declared in FAILURES ? declared : codeFromPdfjsError(err);

  if (code && code in FAILURES) {
    return { code, ...FAILURES[code], raw };
  }
  return {
    code: "UNEXPECTED",
    title: "Unexpected error",
    detail:
      "This did not come back as an AegisError. It is a bug in the demo page or an unsupported browser rather than a rejected document.",
    retryWithNewFile: true,
    raw,
  };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

export interface RenderedPage {
  dataUrl: string;
  width: number;
  height: number;
  pageCount: number;
}

/**
 * Rasterise one page of a PDF to a PNG data URL.
 *
 * NOTE: pdf.js takes ownership of (and detaches) any ArrayBuffer passed as
 * `data`, so we always hand it a fresh copy. Skipping the copy would detach the
 * caller's buffer and break the download button.
 */
export async function renderPage(
  source: ArrayBuffer | Uint8Array,
  pageNumber = 1,
  maxWidth = 900,
): Promise<RenderedPage> {
  const pdfjs = await loadPdfjs();
  const bytes =
    source instanceof Uint8Array ? new Uint8Array(source) : new Uint8Array(source.slice(0));

  const doc = await pdfjs.getDocument({
    data: bytes,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    isEvalSupported: false,
  }).promise;

  try {
    const pageCount = doc.numPages;
    const page = await doc.getPage(Math.min(pageNumber, pageCount));
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, Math.max(1, maxWidth / base.width));
    const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio > 1 ? 2 : 1.5) });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not acquire a 2D canvas context.");

    await page.render({ canvasContext: context, viewport }).promise;

    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      pageCount,
    };
  } finally {
    void doc.destroy();
  }
}

/** Does this PDF have an extractable text layer? Used for the "proof" panel. */
export async function textLayerStats(
  source: ArrayBuffer | Uint8Array,
): Promise<{ characters: number; pageCount: number }> {
  const pdfjs = await loadPdfjs();
  const bytes =
    source instanceof Uint8Array ? new Uint8Array(source) : new Uint8Array(source.slice(0));

  const doc = await pdfjs.getDocument({
    data: bytes,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    isEvalSupported: false,
  }).promise;

  try {
    let characters = 0;
    const pages = Math.min(doc.numPages, 5);
    for (let i = 1; i <= pages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ("str" in item) characters += item.str.trim().length;
      }
    }
    return { characters, pageCount: doc.numPages };
  } finally {
    void doc.destroy();
  }
}

/* ------------------------------------------------------------------ */
/* Redaction                                                           */
/* ------------------------------------------------------------------ */

export interface RunOptions {
  documentType: DocumentTypeOverride;
  redactPhone: boolean;
  redactDob: boolean;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/**
 * Run a redaction and count network activity while it runs.
 *
 * The SDK makes no outbound request; instrumenting `fetch`/XHR here lets the
 * page prove that rather than merely assert it.
 */
export async function runRedaction(input: File | Blob, options: RunOptions): Promise<AegisRunResult> {
  const aegis = await loadAegis();

  let networkCallsDuringRun = 0;
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;

  const isAssetRequest = (url: string) =>
    url.includes("/aegis-assets/") || url.startsWith("blob:") || url.startsWith("data:");

  window.fetch = function patchedFetch(...args: Parameters<typeof fetch>) {
    const target = args[0];
    const url =
      typeof target === "string"
        ? target
        : target instanceof URL
          ? target.toString()
          : (target as Request).url;
    if (!isAssetRequest(url)) networkCallsDuringRun += 1;
    return originalFetch.apply(window, args);
  };
  XMLHttpRequest.prototype.open = function patchedOpen(
    this: XMLHttpRequest,
    ...args: Parameters<XMLHttpRequest["open"]>
  ) {
    const url = String(args[1] ?? "");
    if (!isAssetRequest(url)) networkCallsDuringRun += 1;
    return originalOpen.apply(this, args);
  } as XMLHttpRequest["open"];

  const startedAt = performance.now();
  try {
    const redactOptions: Record<string, unknown> = {
      redactPhone: options.redactPhone,
      redactDob: options.redactDob,
    };
    if (options.documentType !== "AUTO") redactOptions["documentType"] = options.documentType;
    if (options.signal) redactOptions["signal"] = options.signal;
    if (options.onProgress) redactOptions["onProgress"] = options.onProgress;

    const result = (await aegis.redact(input, redactOptions)) as {
      redactedPDF: ArrayBuffer;
      detected?: DetectedFieldView[];
      redactionCount?: number;
      confidence?: string;
      documentType?: string;
      ocrUsed?: boolean;
      warnings?: string[];
      sdkVersion?: string;
      specVersion?: string;
    };

    return {
      redactedPDF: result.redactedPDF,
      detected: result.detected ?? [],
      redactionCount: result.redactionCount ?? 0,
      confidence: result.confidence ?? "UNKNOWN",
      documentType: result.documentType ?? "UNKNOWN",
      ocrUsed: Boolean(result.ocrUsed),
      warnings: result.warnings ?? [],
      sdkVersion: result.sdkVersion ?? "unknown",
      specVersion: result.specVersion ?? "unknown",
      durationMs: Math.round(performance.now() - startedAt),
      networkCallsDuringRun,
    };
  } finally {
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalOpen;
  }
}

/* ------------------------------------------------------------------ */
/* Misc helpers                                                        */
/* ------------------------------------------------------------------ */

export function downloadPdf(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer.slice(0)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
