import { isValidElement, type ReactNode, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Icon } from "./icons";

/** Liest die Sprache aus dem <code class="language-…"> im Codeblock. */
function codeLanguage(children: ReactNode): string | null {
  if (isValidElement<{ className?: string }>(children)) {
    const match = /language-([\w+-]+)/.exec(children.props.className ?? "");
    if (match) return match[1] ?? null;
  }
  return null;
}

/** Codeblock mit Sprach-Etikett und Kopier-Knopf. */
function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const language = codeLanguage(children);

  async function copy(): Promise<void> {
    const text = preRef.current?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Zwischenablage nicht verfügbar — still ignorieren.
    }
  }

  return (
    <div className="rd-code">
      <div className="rd-code-bar">
        <span className="rd-code-lang">{language ?? "Code"}</span>
        <button type="button" className="rd-code-copy" onClick={copy} aria-label="Code kopieren">
          <Icon name={copied ? "check" : "copy"} size={13} />
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}

/**
 * Rendert Assistenten-Text als Markdown: GitHub-Tabellen/Listen (gfm),
 * Formeln (math + KaTeX) und Syntax-Highlighting für Codeblöcke. Links öffnen
 * im Standardbrowser. Das Styling liegt in styles.css unter `.rd-md`.
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="rd-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
