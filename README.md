# aegis-redact

Zero-knowledge PII redaction for income and financial documents — **in the browser, on the client.**

Aegis filters Social Security numbers, ITINs, bank account and routing numbers, and other sensitive fields out of PDFs (W-2, 1040, bank statements, payslips) without the file ever leaving the visitor's tab. There is no server to provision, no API key to rotate, and no document ever in transit or at rest on infrastructure you have to secure.

```sh
npm install aegis-redact
```

```ts
import { createAegis } from "aegis-redact/browser";

const aegis = await createAegis();

const result = await aegis.redact(file);

// result.redactedPDF   -> ArrayBuffer, flattened, no text layer
// result.detected       -> DetectedField[] with type, zone, confidence
// result.redactionCount -> how many boxes were burned in
// result.documentType   -> "W2" | "FORM_1040" | "BANK_STATEMENT" | "PAYSLIP"
```

---

## Why

Income verification documents — payslips, W-2s, bank statements — are routinely emailed to rental agencies, loan officers, and background-check vendors whose servers later leak them. In 2024 a single breach exposed the mortgage documents of tens of millions of applicants.

Aegis removes the target before the document is sent. Because redaction happens in the browser, there is nothing on your side to breach: no upload bucket, no temporary copy, no logging pipeline that sees the raw file. The attacker's surface area is the visitor's own machine, not yours.

---

## How it works

**Find the fields.** pdf.js extracts the text layer with per-glyph coordinates. Keyword scoring classifies the document as a W-2, 1040, bank statement, or payslip, which selects the zones and field rules that apply. Zone-aware patterns then locate SSNs, ITINs, account and routing numbers — routing numbers must pass the ABA checksum before they are treated as hits.

**Destroy the text.** Each page is rasterised, opaque boxes are drawn over the matches, and the page is re-embedded as an image. The text layer is **gone, not hidden** — a black rectangle drawn over live text is not redaction, because anyone can still select and copy the characters underneath. Aegis flattens the page so those characters no longer exist in the file.

**Never touch a server.** Every pass runs on the main thread and the pdf.js worker inside the visitor's browser. There is no API to call and no token to configure. If a document classifies as a type that always contains a target yet nothing is detected, the SDK **throws** instead of returning a plausible-looking file — silent under-redaction is the worst failure mode, so Aegis refuses rather than guesses.

---

## Installation

```sh
npm install aegis-redact
```

The SDK is a bundle that runs entirely in the browser. It depends on `pdfjs-dist` at runtime; ship your own copy (see [Assets](#assets)) and hand the same instance to the SDK so only one copy of pdf.js ends up in the page.

---

## Quick start

```ts
import { createAegis } from "aegis-redact/browser";

// The SDK needs the pdf.js worker + standard font data at runtime. Serve
// them from your own origin and point assetBaseUrl at the folder.
const aegis = await createAegis({
  assetBaseUrl: "/aegis-assets",
  pdfjs, // the pdfjs-dist module, imported once and shared
});

const result = await aegis.redact(file, {
  documentType: "AUTO", // or "W2" | "FORM_1040" | "BANK_STATEMENT" | "PAYSLIP"
  redactPhone: true,
  redactDob: true,
  signal: controller.signal, // optional AbortSignal
  onProgress: (fraction) => {}, // optional 0..1 progress
});
```

### Result

| field            | type               | meaning                                                         |
| ---------------- | ------------------ | --------------------------------------------------------------- |
| `redactedPDF`    | `ArrayBuffer`      | Flattened PDF with no text layer on redacted pages.             |
| `detected`        | `DetectedField[]`  | Each hit with `type`, `value`, `rawText`, `zone`, `confidence`. |
| `redactionCount`  | `number`           | How many boxes were burned in.                                 |
| `documentType`    | `string`           | `"W2" \| "FORM_1040" \| "BANK_STATEMENT" \| "PAYSLIP"`.         |
| `confidence`      | `string`           | Aggregate confidence for the run.                               |
| `ocrUsed`         | `boolean`          | Whether OCR was required to recover a text layer.              |
| `warnings`        | `string[]`         | Non-fatal notices (e.g. partial OCR coverage).                  |
| `sdkVersion`      | `string`           | SDK build version.                                              |
| `specVersion`     | `string`           | Detection spec version.                                         |

### `DetectedField`

```ts
interface DetectedField {
  type: string;       // "SSN" | "ITIN" | "ACCOUNT_NUMBER" | "ROUTING_NUMBER" | ...
  value: string;     // masked preview, never the raw secret
  rawText: string;
  confidence: string; // "HIGH" | "MEDIUM" | "LOW"
  path: string;
  zone: string;       // logical region of the page the hit came from
  nerConfirmed: boolean;
  isItin?: boolean;
  bbox?: { x0: number; y0: number; x1: number; y1: number; page?: number };
}
```

---

## Options

```ts
interface RedactOptions {
  documentType?: "AUTO" | "W2" | "FORM_1040" | "BANK_STATEMENT" | "PAYSLIP";
  redactPhone?: boolean;
  redactDob?: boolean;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}
```

- **`documentType`** — Set explicitly to skip classification when you already know what the file is (useful when auto-detection fails on an unusual layout).
- **`redactPhone` / `redactDob`** — Toggle optional field families on or off.
- **`signal`** — Standard `AbortSignal`; the job throws `ABORTED` when cancelled.
- **`onProgress`** — Called with `0..1` as the pipeline advances; handy for a progress bar.

---

## Assets

The SDK needs the pdf.js worker and the standard font data bundle at runtime. Serve them from your own origin and point `assetBaseUrl` at the folder:

```
/aegis-assets/
  pdf.worker.min.mjs
  standard_fonts/
    *.ttf
```

Serving them yourself keeps the SDK CSP-safe — it works under a strict content policy with no CDN and no third-party fetch. This is non-negotiable: without the standard font data, pdf.js cannot build glyph outlines for the base-14 fonts and text extraction degrades silently, which means **missed detections**.

---

## Errors

Aegis throws typed errors rather than returning partial results. A redaction either completes fully or returns nothing — there is no half-redacted file by design.

| code                   | meaning                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `FILE_TOO_LARGE`        | Over the 10 MB / 50-page cap.                                           |
| `INVALID_PDF`           | No PDF header.                                                          |
| `CORRUPTED_PDF`         | pdf.js could not parse the document structure.                          |
| `PASSWORD_PROTECTED`    | Encrypted document; the SDK will not guess or strip passwords.          |
| `UNKNOWN_DOCUMENT_TYPE` | No W-2, 1040, bank statement, or payslip markers found.                 |
| `UNREADABLE_DOCUMENT`   | Classified as a type with a target, but zero fields detected — refuses. |
| `ALREADY_IMAGE_ONLY`    | No text layer present (an Aegis output run again, or a flat scan).     |
| `REDACTION_FAILED`      | The redaction pass could not complete.                                  |
| `ABORTED`               | Cancelled via `AbortSignal`.                                            |

> **`UNREADABLE_DOCUMENT` is not a soft failure.** When a document classifies as a type that always contains a target yet nothing is detected, the text layer almost certainly failed silently. Aegis deliberately refuses to hand back a document it may not have redacted — treat it as "ask the user to re-upload," not as a bug.

---

## Limits

- **10 MB** per file, **50 pages** max. Page count is capped because every page is rasterised and PNG-embedded on the redaction path.
- **PDF in, PDF out.** Only PDFs can be redacted.
- **No encryption.** Remove passwords before redacting; the SDK will not guess or strip them.

---

## What Aegis refuses to do

- **No upload, no server, no key.** There is no API to call and no token to configure. The SDK is a bundle that runs in the visitor's tab.
- **Destroyed, not covered up.** A black rectangle over live text is not redaction. Aegis rasterises the page so the characters no longer exist in the file.
- **Refuses rather than guesses.** If detection fails on a document that should contain a target, the SDK throws instead of returning a plausible-looking file. Silent under-redaction is the worst failure mode.

---

## Browser support

Requires a modern evergreen browser with `OffscreenCanvas` / canvas support and Web Workers. pdf.js handles the rest.

---

## License

MIT © Aneesh Reddy Kusa
