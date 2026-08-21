import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}

const LINES = (code: string) => code.replace(/\n$/, "").split("\n");

export function CodeBlock({ code, language = "ts", filename, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = LINES(code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const tabLabel = filename ?? language === "bash" ? "terminal" : "redact.ts";

  return (
    <div
      className={`group overflow-hidden border border-console-border bg-console text-console-fg shadow-[0_2px_0_0_var(--color-console-border)] ${className ?? ""}`}
    >
      {/* Editor title bar */}
      <div className="flex items-center gap-3 border-b border-console-border bg-console px-3 py-2">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-console-signal/80" />
          <span className="size-2.5 rounded-full bg-console-verified/70" />
          <span className="size-2.5 rounded-full bg-console-muted/70" />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-[11px] tracking-tight text-console-fg/90">
            {tabLabel}
          </span>
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.22em] text-console-muted">
            {language}
          </span>
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code to clipboard"
          className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-console-muted transition-colors hover:text-console-signal focus-visible:text-console-signal focus-visible:outline-none"
        >
          {copied ? <Check className="size-3.5 text-console-verified" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Code body with line-number gutter */}
      <div className="console-scroll" tabIndex={0} role="region" aria-label={`${tabLabel} source`}>
        <div className="flex w-max min-w-full">
          <pre
            aria-hidden
            className="sticky left-0 z-10 select-none border-r border-console-border bg-console px-3 py-3.5 text-right font-mono text-[12.5px] leading-relaxed text-console-muted/70"
          >
            {lines.map((_, i) => `${i + 1}\n`).join("")}
          </pre>
          <pre className="px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-console-fg/90">
            <code>{code}</code>
          </pre>
        </div>
      </div>

    </div>
  );
}
