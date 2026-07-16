#!/usr/bin/env node
/**
 * Content-fidelity QA: extract the normalized visible text of every route's
 * MAIN CONTENT (header/footer/nav/TOC/carousel chrome removed) so a redesign
 * can be diffed against a pre-redesign baseline to prove the words didn't
 * change.
 *
 * Usage: node scripts/extract-text.mjs <outDir>
 *   e.g. node scripts/extract-text.mjs reference/text-baseline
 * Assumes the static build is served at http://localhost:3999
 * (npx serve out -l 3999), same as screenshot-compare.mjs.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3999";

const ROUTES = {
  home: "/",
  about: "/about/",
  news: "/news/",
  policies: "/policies/",
  bylaws: "/bylaws/",
  "disciplinary-policy": "/disciplinary-policy/",
  "privacy-policy": "/privacy-policy/",
  roadmap: "/roadmap/",
  "overfault-rulebook": "/overfault-rulebook/",
  "post-who-we-are": "/2025/11/the-fault-foundation-who-we-are-and-whats-next/",
  "post-discord": "/2025/12/discord-and-sharing-personal-information/",
  "post-verification": "/2026/01/community-verification/",
  "author-oscar": "/author/admin_saivw2jq/",
  "tag-discussion": "/tag/discussion/",
  "tag-future": "/tag/future/",
  "tag-news": "/tag/news/",
  "tag-update": "/tag/update/",
  "404": "/definitely-not-a-page/",
};

// Chrome that is NOT page content, in both the old (wp-*) and new (ff-*)
// markup. Removed before text extraction.
const CHROME_SELECTORS = [
  "header",
  "footer",
  "nav",
  "givebutter-widget",
  ".skip-link", // old in-page skip link (now lives in the header)
  ".ff-skip-link",
  ".sticky-sidebar", // old policy related-docs sidebar
  ".ff-toc", // new policy TOC (repeats existing headings)
  ".ff-carousel", // new promo slideshow (reuses existing strings)
].join(", ");

const outDir = process.argv[2];
if (!outDir) {
  console.error("Usage: node scripts/extract-text.mjs <outDir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, route] of Object.entries(ROUTES)) {
  await page.goto(BASE + route, { waitUntil: "load", timeout: 45000 });
  const text = await page.evaluate((chromeSel) => {
    document.querySelectorAll(chromeSel).forEach((el) => el.remove());
    // innerText skips closed <details> bodies — force everything open.
    document.querySelectorAll("details").forEach((d) => (d.open = true));
    return document.body.innerText;
  }, CHROME_SELECTORS);
  // Normalize: one word per line so diffs pinpoint exact word changes.
  const normalized = text.replace(/\s+/g, "\n").trim() + "\n";
  writeFileSync(`${outDir}/${name}.txt`, normalized);
  console.log(`${name} (${normalized.split("\n").length} words)`);
}
await browser.close();
