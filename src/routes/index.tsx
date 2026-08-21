import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";

import { CodeBlock } from "@/components/aegis/CodeBlock";
import { RedactConsole } from "@/components/aegis/RedactConsole";

const TITLE = "aegis-redact — zero-knowledge PDF redaction in the browser";
const DESCRIPTION =
  "Redact SSNs, account and routing numbers from W-2s, 1040s, bank statements and payslips entirely client-side. Try the live demo — the document never leaves your tab.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: LandingPage,
});

const INSTALL_SNIPPET = `npm install aegis-redact`;

const USAGE_SNIPPET = `import { createAegis } from "aegis-redact/browser";

const aegis = await createAegis();

const result = await aegis.redact(file);

// result.redactedPDF   -> ArrayBuffer, flattened, no text layer
// result.detected       -> DetectedField[] with type, zone, confidence
// result.redactionCount -> how many boxes were burned in
// result.documentType   -> "W2" | "FORM_1040" | "BANK_STATEMENT" | "PAYSLIP"`;

const METHOD = [
  {
    step: "01",
    kind: "pass" as const,
    title: "Find the fields",
    body: "Inside the browser, pdf.js reads the text layer with exact coordinates and the SDK classifies the document — W-2, 1040, bank statement or payslip — so it knows which SSNs, ITINs, account and routing numbers to look for and where.",
  },
  {
    step: "02",
    kind: "pass" as const,
    title: "Destroy the text",
    body: "Each hit is rasterised and an opaque box is burned into the page, then the page is re-embedded as an image. The characters are gone — not covered with a black rectangle, but actually removed from the file. Nothing is left to select or copy.",
  },
  {
    step: "03",
    kind: "won't" as const,
    title: "Never touch a server",
    body: "No upload, no API key, no call to make. The whole pipeline runs in the visitor's tab, so the document is never in transit and never at rest anywhere you'd have to secure — and if a field should be there but isn't found, it refuses rather than ship a half-redacted file.",
  },
];


function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Masthead */}
      <header className="border-b-2 border-foreground bg-background">
        <div className="mx-auto max-w-5xl px-4 sm:px-8">
          <div className="flex items-end justify-between gap-6 pt-6 pb-3">
            <a href="/" className="block">
              <span className="block font-display text-3xl leading-none tracking-tight sm:text-4xl">
                aegis&#8202;-&#8202;redact
              </span>
              <span className="mt-1.5 block font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                Redaction, performed in the reader&#39;s own hands
              </span>
            </a>
            <nav className="hidden items-center gap-6 pb-1 sm:flex">
              {[
                ["Exhibit", "#demo"],
                ["Method", "#pipeline"],
                ["Manual", "#install"],
              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground underline-offset-4 transition-colors hover:text-signal hover:underline"
                >
                  {label}
                </a>
              ))}
              <a
                href="https://www.npmjs.com/package/aegis-redact"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 border-2 border-foreground px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors hover:bg-foreground hover:text-background"
              >
                <Package className="size-3.5" aria-hidden />
                npm
              </a>
            </nav>
          </div>
        </div>
        <div className="border-t border-foreground/25">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:px-8">
            <span>Vol. 0.1 · Browser edition</span>
            <span>Bytes uploaded: 0</span>
            <span className="hidden sm:inline">pdf-lib · pdf.js</span>
            <span className="text-signal">Client-side only</span>
          </div>
        </div>
      </header>

      {/* Lede */}
      <section className="relative border-b-2 border-foreground">
        <div className="relative mx-auto max-w-5xl px-4 py-10 text-center sm:px-8 sm:py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-signal">
            Exhibit A / Live in this tab
          </p>
          <h1 className="mx-auto mt-4 max-w-4xl font-display text-[2.5rem] leading-[0.95] tracking-tight sm:text-5xl lg:text-[4rem]">
            Filter the sensitive fields — your file never{" "}
            <span className="reveal-bar" tabIndex={0}>
              <span className="relative">leaves</span>
            </span>{" "}
            the browser.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-[1.0625rem] leading-relaxed text-foreground/85">
            Every time you upload a payslip or bank statement to prove income — for a rental, a
            loan, a background check — you're also sending the Social Security and account
            numbers printed on those pages. Those files sit raw on someone else's server, and
            servers get breached.
          </p>
          <a
            href="https://techcrunch.com/2019/01/23/financial-files/"
            target="_blank"
            rel="noreferrer noopener"
            className="mx-auto mt-4 inline-block border-l-2 border-signal pl-3 text-left font-mono text-sm uppercase tracking-[0.18em] text-signal transition-colors hover:bg-signal/5"
          >
            "24 million bank-loan and mortgage documents leaked online from a single exposed server"
          </a>
          <p className="mx-auto mt-3 max-w-3xl text-[1.0625rem] leading-relaxed text-foreground/85">
            aegis-redact cuts out the stranger. It finds SSNs, ITINs, account and routing numbers
            in W-2s, 1040s, bank statements and payslips, burns opaque boxes into the page, then
            throws the text layer away — all inside your browser tab. No backend. No API key.
            Nothing in flight.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#upload"
              className="inline-flex items-center gap-2 bg-foreground px-6 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-background transition-colors hover:bg-signal"
            >
              Filter your sensitive information now
            </a>
          </div>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Hover the black bar above — that is what a bar over live text is worth.
          </p>
        </div>
      </section>

      {/* Exhibit — live demo */}
      <section id="demo" className="border-b-2 border-foreground">
        <div className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-8 sm:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-signal">
            Exhibit A
          </p>
          <h2 className="mx-auto mt-3 max-w-3xl font-display text-3xl leading-none tracking-tight sm:text-5xl">
            Redact a document right on this page
          </h2>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Synthetic samples only
          </p>
          <div className="rule-double mt-6 mb-9" aria-hidden />
          <p className="mx-auto max-w-2xl text-[0.9375rem] leading-relaxed text-foreground/80">
            Start with a synthetic sample, or drop in your own PDF. Either way the work happens in
            this tab: the console instruments{" "}
            <span className="font-mono text-foreground">fetch</span> and{" "}
            <span className="font-mono text-foreground">XMLHttpRequest</span> during the run and
            reports the request count, so you can check the claim instead of taking it on faith.
          </p>
          <div className="mt-9 text-left">
            <RedactConsole />
          </div>
        </div>

      </section>

      {/* Method */}
      <section id="pipeline" className="border-b-2 border-foreground">
        <div className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-8 sm:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-signal">Method</p>
          <h2 className="mx-auto mt-3 max-w-3xl font-display text-3xl leading-[0.95] tracking-tight sm:text-5xl">
            Three steps, no network hop
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-foreground/75">
            The whole pipeline runs in the visitor's browser — find the fields, destroy the text,
            and never let the file touch a server.
          </p>
          <div className="rule-double mt-6 mb-9" aria-hidden />
          <ol className="grid gap-0 divide-y-2 divide-foreground/12 border-y-2 border-foreground text-left">
            {METHOD.map(({ step, kind, title, body }) => (
              <li key={step} className="grid grid-cols-[3.25rem_1fr] gap-5 py-6">
                <span
                  className={
                    kind === "won't"
                      ? "font-display text-3xl leading-none text-muted-foreground"
                      : "font-display text-3xl leading-none text-signal"
                  }
                >
                  {step}
                </span>
                <div>
                  <h3 className="flex items-baseline gap-3 font-display text-2xl leading-none tracking-tight">
                    {title}
                    {kind === "won't" && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-signal">
                        won&#39;t
                      </span>
                    )}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-foreground/75">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Field manual */}
      <section id="install" className="border-b-2 border-foreground">
        <div className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-8 sm:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-signal">
            Field manual
          </p>
          <h2 className="mx-auto mt-3 max-w-3xl font-display text-3xl leading-none tracking-tight sm:text-5xl">
            Four lines to a redacted PDF
          </h2>
          <div className="rule-double mt-6 mb-9" aria-hidden />
          <div className="grid gap-6 text-left lg:grid-cols-[0.6fr_1fr]">

            <div>
              <CodeBlock code={INSTALL_SNIPPET} language="bash" filename="install.sh" />
              <p className="mt-5 text-sm leading-relaxed text-foreground/75">
                Import the browser entry point, create an instance, hand it a{" "}
                <span className="font-mono text-foreground">File</span>. There is nothing to
                provision.
              </p>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                The SDK needs the pdf.js worker and standard font data at runtime. Serve them from
                your own origin and point{" "}
                <span className="font-mono text-foreground">assetBaseUrl</span> at the folder — this
                page does exactly that, which is why it works with a strict content policy and no
                CDN.
              </p>
            </div>
            <CodeBlock code={USAGE_SNIPPET} language="ts" filename="redact.ts" />
          </div>
        </div>
      </section>

      {/* Colophon */}
      <footer className="text-center">
        <div className="mx-auto max-w-5xl px-4 sm:px-8">
          <div className="border-t-2 border-foreground py-10">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              In the margin
            </p>
            <dl className="mt-5 grid gap-6 text-left sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Documents understood", "W-2 · 1040 · Bank statement · Payslip", "more types coming soon"],
                ["What's exposed in those files", "SSNs · ITINs · account & routing numbers"],
                ["The breach math", "One exposed server → every uploaded file, readable"],
                ["Network requests during a run", "0, and the demo counts them for you"],
              ].map(([term, value, note]) => (
                <div key={term}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {term}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-snug">{value}</dd>
                  {note ? (
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-signal">
                      {note}
                    </p>
                  ) : null}
                </div>
              ))}
            </dl>
            <p className="mx-auto mt-8 max-w-2xl font-display text-xl italic leading-snug text-foreground/70">
              “If the characters are still in the file, it was never redacted — it was decorated.”
            </p>
          </div>
          <div className="flex flex-col items-center gap-5 border-t border-foreground/25 py-8 text-center">
            <div>
              <p className="font-display text-2xl leading-none tracking-tight">aegis-redact</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
                Colophon: built by Aneesh Reddy Kusa. Set in Instrument Serif and Work Sans. Samples on
                this page are synthetic — no real person's data appears anywhere.
              </p>
            </div>
            <div className="flex items-center gap-5">
              <a
                href="https://www.npmjs.com/package/aegis-redact"
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-signal"
              >
                npm
              </a>
              <a
                href="https://github.com/aneesh-reddy/aegis-redact"
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-signal"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
