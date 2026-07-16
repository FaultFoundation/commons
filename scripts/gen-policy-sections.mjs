#!/usr/bin/env node
/**
 * One-shot generator used during the redesign: converts each policy
 * page's rendered content column (out/<slug>/index.html, built from the
 * original ported markup) into a clean JSX module
 * app/<slug>/sections.tsx of { id, heading, body } collapsible
 * sections, splitting at the "ARTICLE …" h2 boundaries.
 *
 * Guarantees: text nodes are copied verbatim (entities untouched);
 * layout wrapper <div>s and class names are dropped; only a whitelist
 * of semantic tags/attributes passes through. Any surprise input
 * fails loudly. Result is verified separately by scripts/extract-text.mjs.
 *
 * Usage: node scripts/gen-policy-sections.mjs   (after `next build`
 * of the PRE-redesign policy pages; kept for provenance)
 */
import { readFileSync, writeFileSync } from "node:fs";

const SLUGS = ["bylaws", "privacy-policy", "disciplinary-policy", "overfault-rulebook"];

const KEEP = new Set([
  "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "strong", "em", "b",
  "i", "u", "s", "a", "span", "sub", "sup", "code", "br", "blockquote",
  "figure", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
]);
const VOID = new Set(["br", "img", "hr"]);
const BLOCK = new Set([
  "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "blockquote",
  "figure", "table", "thead", "tbody", "tfoot", "tr",
]);

/* ---------- minimal well-formed-HTML parser ---------- */

function parse(html) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)(\/)?>/g;
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    const text = html.slice(last, m.index);
    if (text) stack[stack.length - 1].children.push({ text });
    last = re.lastIndex;
    const [, closing, rawTag, rawAttrs, selfClose] = m;
    const tag = rawTag.toLowerCase();
    if (closing) {
      // pop until matching tag (input is React output: well-formed)
      while (stack.length > 1 && stack[stack.length - 1].tag !== tag) stack.pop();
      if (stack.length > 1) stack.pop();
    } else {
      const node = { tag, attrs: parseAttrs(rawAttrs), children: [] };
      stack[stack.length - 1].children.push(node);
      if (!selfClose && !VOID.has(tag)) stack.push(node);
    }
  }
  const tail = html.slice(last);
  if (tail) stack[stack.length - 1].children.push({ text: tail });
  return root;
}

function parseAttrs(s) {
  const attrs = {};
  if (!s) return attrs;
  for (const m of s.matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? "";
  }
  return attrs;
}

/* ---------- content column extraction ---------- */

function extractColumn(html) {
  const marker = 'style="flex-basis:80%"';
  const idx = html.indexOf(marker);
  if (idx === -1) throw new Error("80% column not found");
  const start = html.lastIndexOf("<div", idx);
  // walk to the matching </div> by depth
  const re = /<(\/)?div[\s>]/g;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, html.indexOf(">", m.index) + 1);
  }
  throw new Error("unbalanced column");
}

/* Flatten: drop wrapper <div>s (promote children), drop whitespace-only
   text between block elements, keep everything else in order. */
function flatten(nodes, out = []) {
  for (const node of nodes) {
    if (node.text !== undefined) {
      if (node.text.trim()) throw new Error(`stray top-level text: ${JSON.stringify(node.text.slice(0, 80))}`);
      continue; // whitespace between blocks
    }
    if (node.tag === "div") flatten(node.children, out);
    else out.push(node);
  }
  return out;
}

const textOf = (node) =>
  node.text !== undefined ? node.text : node.children.map(textOf).join("");

/* ---------- JSX serialization ---------- */

const warned = new Set();
function warnOnce(msg) {
  if (!warned.has(msg)) {
    warned.add(msg);
    console.warn("  WARN:", msg);
  }
}

function jsxAttrs(tag, attrs) {
  const parts = [];
  for (const [name, value] of Object.entries(attrs)) {
    if (name === "class" || name.startsWith("data-")) continue;
    if (name === "style") {
      // Only the underline style exists in policy content.
      if (value.replace(/\s|;/g, "") === "text-decoration:underline") {
        parts.push(`style={{ textDecoration: "underline" }}`);
      } else {
        warnOnce(`dropped style "${value}" on <${tag}>`);
      }
      continue;
    }
    if (["id", "href", "target", "rel", "scope", "start", "datetime"].includes(name)) {
      const jsxName = name === "datetime" ? "dateTime" : name;
      parts.push(`${jsxName}="${value}"`);
      continue;
    }
    if (name === "colspan" || name === "rowspan") {
      parts.push(`${name === "colspan" ? "colSpan" : "rowSpan"}={${value}}`);
      continue;
    }
    warnOnce(`dropped attr ${name}="${value}" on <${tag}>`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function escapeText(text) {
  return text.replaceAll("{", "&#123;").replaceAll("}", "&#125;");
}

function jsx(node, topLevel = false) {
  if (node.text !== undefined) return escapeText(node.text);
  if (!KEEP.has(node.tag)) throw new Error(`unexpected tag <${node.tag}>`);
  let tag = node.tag;
  let attrs = jsxAttrs(tag, node.attrs);
  // Tables get an overflow wrapper class instead of the WP figure classes.
  if (tag === "figure") attrs = ` className="ff-table-wrap"` + attrs;
  if (VOID.has(tag)) return `<${tag}${attrs} />`;
  const inner = node.children
    .map((child) => {
      // drop whitespace-only text between block-level children
      if (child.text !== undefined && !child.text.trim() && node.children.some((c) => c.tag && BLOCK.has(c.tag))) {
        return "";
      }
      return jsx(child);
    })
    .join("");
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

/* ---------- main ---------- */

const libPolicies = readFileSync("lib/policies.ts", "utf8");

for (const slug of SLUGS) {
  console.log(`=== ${slug} ===`);
  const html = readFileSync(`out/${slug}/index.html`, "utf8");
  const column = extractColumn(html);
  const elements = flatten(parse(column).children);

  // Expected headings/ids for this slug from lib/policies.ts
  // note trailing comma: skips the union in the PolicyDoc type definition
  const libBlock = libPolicies.slice(libPolicies.indexOf(`slug: "${slug}",`));
  const libSections = [...libBlock.slice(0, libBlock.indexOf("]")).matchAll(/id: "([^"]+)", heading: "([^"]+)"/g)]
    .map((m) => ({ id: m[1], heading: m[2] }));

  const isArticle = (el) => el.tag === "h2" && textOf(el).trim().startsWith("ARTICLE");

  const preamble = [];
  const sections = [];
  for (const el of elements) {
    if (isArticle(el)) {
      const heading = textOf(el).trim();
      const expected = libSections[sections.length];
      if (!expected || expected.heading !== heading) {
        throw new Error(`heading mismatch at #${sections.length}: got ${JSON.stringify(heading)}, lib has ${JSON.stringify(expected?.heading)}`);
      }
      sections.push({ id: expected.id, heading, body: [] });
    } else if (el.tag === "h2" && !textOf(el).trim()) {
      continue; // stray empty heading in the original markup
    } else if (sections.length === 0) {
      preamble.push(el);
    } else {
      sections[sections.length - 1].body.push(el);
    }
  }
  if (sections.length !== libSections.length) {
    throw new Error(`section count ${sections.length} != lib ${libSections.length}`);
  }
  console.log(`  preamble: ${preamble.length} element(s); sections: ${sections.length}`);

  const out = `import type { ReactNode } from "react";

/**
 * ${slug} content, split into collapsible ARTICLE sections. Generated
 * from the original ported markup by scripts/gen-policy-sections.mjs —
 * the text is verbatim; only WP wrapper markup/classes were removed.
 */

export type PolicyContentSection = {
  id: string;
  heading: string;
  body: ReactNode;
};

export const preamble: ReactNode = ${
    preamble.length ? `(\n  <>\n    ${preamble.map((el) => jsx(el, true)).join("\n    ")}\n  </>\n)` : "null"
  };

export const sections: PolicyContentSection[] = [
${sections
  .map(
    (s) => `  {
    id: ${JSON.stringify(s.id)},
    heading: ${JSON.stringify(s.heading)},
    body: (
      <>
        ${s.body.map((el) => jsx(el, true)).join("\n        ")}
      </>
    ),
  },`,
  )
  .join("\n")}
];
`;
  writeFileSync(`app/${slug}/sections.tsx`, out);
  console.log(`  wrote app/${slug}/sections.tsx`);
}
console.log("done");
