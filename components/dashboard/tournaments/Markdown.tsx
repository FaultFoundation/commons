import { Fragment, type ReactNode } from "react";

// A tiny, dependency-free markdown renderer for provider-authored blurbs
// (start.gg widget markdown, FACEIT descriptions). It builds React nodes
// directly — no dangerouslySetInnerHTML — so untrusted text can never inject
// markup, and link/image URLs are restricted to http(s)/mailto/relative.
// Deliberately a SUBSET: headings, bold, italic, inline code, links, images,
// bare URLs, unordered/ordered lists, blockquotes, thematic breaks, paragraphs
// with soft line breaks.
//
// start.gg's "MarkdownWidget" content is markdown MIXED with raw HTML — organizers
// wrap text in <div style>, link with styled <a>, and embed <img>. A markdown
// subset renders those tags as literal text, so we first fold the common HTML
// into markdown (links, images, breaks, emphasis) and strip the rest (the styling
// wrappers), keeping the structure while dropping the untrusted inline CSS.

/** Only allow safe schemes; anything else renders as plain text (no link). */
function safeHref(url: string): string | null {
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  if (url.startsWith("/")) return url;
  return null;
}

/** Decode the handful of HTML entities that show up in provider blurbs. */
function decodeEntities(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'");
}

/** Fold the common inline HTML organizers embed in start.gg markdown into
    markdown equivalents, then drop every remaining tag (the <div>/<span> styling
    wrappers) while keeping their text. Order matters: images and links are
    converted before the blanket tag strip. */
function htmlToMarkdown(source: string): string {
  let text = source;
  // <img src alt> → ![alt](src) (attributes in any order).
  text = text.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /src\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src) return "";
    const alt = /alt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    return `![${alt}](${src})`;
  });
  // <a href>INNER</a> → an image link collapses to just the image; otherwise a
  // normal [text](href). Inner tags in the label are dropped by the later strip.
  text = text.replace(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_full, href: string, inner: string) => {
      const trimmed = inner.trim();
      if (/^!\[[^\]]*\]\([^)\s]+\)$/.test(trimmed)) return trimmed;
      return `[${trimmed}](${href})`;
    },
  );
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
  text = text.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
  text = text.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
  // Everything else (div/span/p wrappers, unclosed tags) — strip the tag, keep
  // the text. A blank line after block wrappers keeps paragraphs from merging.
  text = text.replace(/<\/(div|p|section|h[1-6])\s*>/gi, "\n\n");
  text = text.replace(/<[^>]+>/g, "");
  return decodeEntities(text);
}

// Tried left-to-right at each position: ![img](url), **bold**, `code`,
// [text](url), *italic* / _italic_, then a bare http(s) URL.
const INLINE =
  /(!\[([^\]]*?)\]\(([^)\s]+?)\))|(\*\*([\s\S]+?)\*\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\(([^)\s]+?)\))|((?:\*|_)([^*_\n]+?)(?:\*|_))|(https?:\/\/[^\s<)]+)/;

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
      // Image: ![alt](url)
      const src = safeHref(m[3]);
      out.push(
        src ? (
          <img key={key++} className="ff-md__img" src={src} alt={m[2] ?? ""} loading="lazy" />
        ) : (
          m[0]
        ),
      );
    } else if (m[4]) {
      out.push(<strong key={key++}>{inline(m[5])}</strong>);
    } else if (m[6]) {
      out.push(
        <code key={key++} className="ff-md__code">
          {m[7]}
        </code>,
      );
    } else if (m[8]) {
      const href = safeHref(m[10]);
      out.push(
        href ? (
          <a key={key++} href={href} target="_blank" rel="noreferrer noopener">
            {inline(m[9])}
          </a>
        ) : (
          m[0]
        ),
      );
    } else if (m[11]) {
      out.push(<em key={key++}>{inline(m[12])}</em>);
    } else if (m[13]) {
      const href = safeHref(m[13]);
      out.push(
        href ? (
          <a key={key++} href={href} target="_blank" rel="noreferrer noopener">
            {m[13]}
          </a>
        ) : (
          m[13]
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

  // Thematic break (--- / *** / ___), possibly padded.
  if (/^(?:-{3,}|_{3,}|\*{3,})$/.test(trimmed)) return <hr key={key} />;

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
  const blocks = htmlToMarkdown(source)
    .replace(/\r\n?/g, "\n")
    // Force each ATX heading onto its own block by padding it with blank lines.
    // Provider markdown (start.gg's About widgets especially) routinely writes
    // "# Title\nbody text" with no blank line, which would otherwise render as
    // one paragraph with a literal "# Title" line.
    .replace(/^[ \t]*(#{1,6}[ \t]+.*)$/gm, "\n$1\n")
    .split(/\n{2,}/);
  return <>{blocks.map((block, i) => renderBlock(block, i))}</>;
}
