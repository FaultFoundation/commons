import { Fragment, type ReactNode } from "react";

// A tiny, dependency-free markdown renderer for provider-authored blurbs
// (start.gg `rules`, FACEIT descriptions). It builds React nodes directly — no
// dangerouslySetInnerHTML — so untrusted text can never inject markup, and link
// hrefs are restricted to http(s)/mailto/relative. Deliberately a SUBSET:
// headings, bold, italic, inline code, links, bare URLs, unordered/ordered
// lists, blockquotes, paragraphs with soft line breaks. Anything fancier just
// renders as its literal text, which is fine for tournament rules.

/** Only allow safe schemes; anything else renders as plain text (no link). */
function safeHref(url: string): string | null {
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  if (url.startsWith("/")) return url;
  return null;
}

// One regex, tried left-to-right at each position: **bold**, `code`,
// [text](url), *italic* / _italic_, then a bare http(s) URL.
const INLINE =
  /(\*\*([\s\S]+?)\*\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\(([^)\s]+?)\))|((?:\*|_)([^*_\n]+?)(?:\*|_))|(https?:\/\/[^\s<)]+)/;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[1]) {
      out.push(<strong key={key++}>{inline(m[2])}</strong>);
    } else if (m[3]) {
      out.push(
        <code key={key++} className="ff-md__code">
          {m[4]}
        </code>,
      );
    } else if (m[5]) {
      const href = safeHref(m[7]);
      out.push(
        href ? (
          <a key={key++} href={href} target="_blank" rel="noreferrer noopener">
            {inline(m[6])}
          </a>
        ) : (
          m[0]
        ),
      );
    } else if (m[8]) {
      out.push(<em key={key++}>{inline(m[9])}</em>);
    } else if (m[10]) {
      const href = safeHref(m[10]);
      out.push(
        href ? (
          <a key={key++} href={href} target="_blank" rel="noreferrer noopener">
            {m[10]}
          </a>
        ) : (
          m[10]
        ),
      );
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

/** Paragraph with single newlines preserved as soft line breaks. */
function paragraph(block: string, key: number): ReactNode {
  const lines = block.split("\n");
  return (
    <p key={key}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {inline(line)}
          {i < lines.length - 1 ? <br /> : null}
        </Fragment>
      ))}
    </p>
  );
}

function renderBlock(block: string, key: number): ReactNode {
  const trimmed = block.trim();
  if (!trimmed) return null;

  const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
  if (heading && !trimmed.includes("\n")) {
    const level = heading[1].length;
    const Tag = (level <= 2 ? "h4" : level === 3 ? "h5" : "h6") as "h4";
    return <Tag key={key}>{inline(heading[2])}</Tag>;
  }

  const lines = trimmed.split("\n");
  if (lines.every((l) => /^\s*[-*+]\s+/.test(l))) {
    return (
      <ul key={key}>
        {lines.map((l, i) => (
          <li key={i}>{inline(l.replace(/^\s*[-*+]\s+/, ""))}</li>
        ))}
      </ul>
    );
  }
  if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
    return (
      <ol key={key}>
        {lines.map((l, i) => (
          <li key={i}>{inline(l.replace(/^\s*\d+\.\s+/, ""))}</li>
        ))}
      </ol>
    );
  }
  if (lines.every((l) => /^\s*>\s?/.test(l))) {
    return (
      <blockquote key={key}>
        {inline(lines.map((l) => l.replace(/^\s*>\s?/, "")).join("\n"))}
      </blockquote>
    );
  }

  return paragraph(trimmed, key);
}

export function Markdown({ source }: { source: string }) {
  const blocks = source
    .replace(/\r\n?/g, "\n")
    // Force each ATX heading onto its own block by padding it with blank lines.
    // Provider markdown (start.gg's About widgets especially) routinely writes
    // "# Title\nbody text" with no blank line, which would otherwise render as
    // one paragraph with a literal "# Title" line.
    .replace(/^[ \t]*(#{1,6}[ \t]+.*)$/gm, "\n$1\n")
    .split(/\n{2,}/);
  return <>{blocks.map((block, i) => renderBlock(block, i))}</>;
}
