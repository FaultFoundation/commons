#!/usr/bin/env node
/**
 * Visual QA: screenshot every route on the local static build and on the
 * live WordPress site, at three viewport widths, into reference/shots/.
 * Compare the pairs to verify the 1:1 replica.
 *
 * Usage: node scripts/screenshot-compare.mjs [--local-only|--live-only]
 * Assumes the static build is served at http://localhost:3999 (see below).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const LOCAL = "http://localhost:3999";
const LIVE = "https://fault.foundation";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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
  "tag-update": "/tag/update/",
  "404": "/definitely-not-a-page/",
};
const WIDTHS = [1440, 768, 375];

const mode = process.argv[2] ?? "";
const targets = [];
if (mode !== "--live-only") targets.push(["local", LOCAL]);
if (mode !== "--local-only") targets.push(["live", LIVE]);

const browser = await chromium.launch();
for (const [label, base] of targets) {
  mkdirSync(`reference/shots/${label}`, { recursive: true });
  const context = await browser.newContext({ userAgent: UA });
  const page = await context.newPage();
  // freeze animations & hide the floating third-party donate widget so
  // screenshots are deterministic
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent =
      "*,*::before,*::after{animation:none!important;transition:none!important} givebutter-widget{display:none!important}";
    document.addEventListener("DOMContentLoaded", () =>
      document.head.appendChild(style),
    );
  });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, route] of Object.entries(ROUTES)) {
      const url = base + route;
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      } catch {
        await page.goto(url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
      }
      await page.waitForTimeout(300);
      const file = `reference/shots/${label}/${name}-${width}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${label} ${name} @${width}`);
    }
  }
  await context.close();
}
await browser.close();
