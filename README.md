# fault.foundation — Next.js site

Static build of [The Fault Foundation](https://fault.foundation) as a Next.js + TypeScript site exported to plain HTML for Cloudflare Pages. Redesigned most pages with a modern look (sticky header, hero slideshow, floating rounded cards, collapsible policies) while keeping every word and image identical.

## Stack

- **Next.js 15 (App Router), TypeScript**, `output: "export"` → everything in `out/`
- **No CSS framework.** `styles/theme.css` is the redesign layer (all
  selectors prefixed `ff-`, tokens alias the WP presets). The captured
  WordPress stylesheets remain untouched underneath because the article
  detail pages still render verbatim ported WP markup.
- `embla-carousel-react` powers the homepage slideshow; everything else is
  server components (client components: `MainNav`, `HeroCarousel`,
  `HashTarget`).

## Layout of interest

| Path | What it is |
|---|---|
| `app/**/page.tsx` | One component per page/post/archive (18 routes) + `not-found.tsx` |
| `app/{bylaws,privacy-policy,disciplinary-policy,overfault-rulebook}/sections.tsx` | Policy content split into collapsible ARTICLE sections (text verbatim from the WP port; see `scripts/gen-policy-sections.mjs`) |
| `components/` | Site chrome (`SiteHeader`/`SiteFooter`/`MainNav`) + redesign primitives (`HeroCarousel`, `SplitFeature`, `NewsCard`, `PolicyLayout`, `CollapsibleSection`, `HashTarget`) |
| `lib/` | `posts.ts` (single source for news metadata), `policies.ts` (policy TOCs), `heroSlides.ts` (slideshow slides — edit here to change promos) |
| `styles/theme.css` | The `ff-` redesign design system (imported last) |
| `styles/wp-blocks.css` | Core Gutenberg block CSS as served by live WP — **still required by the article pages; do not edit** |
| `styles/wp-globals.css` | WP global styles: `--wp--preset--*` tokens (brand source of truth), element styles — **do not edit** |
| `styles/fonts.css` | Self-hosted Manrope @font-face |
| `public/wp-content/uploads/` | Media at their original WordPress paths (so ported markup + og images keep working) |
| `public/_redirects` | Cloudflare Pages redirects (old sitemap URL, `/home/`, one renamed post slug) |
| `scripts/` | The capture/port pipeline (below) + redesign verification tools |
| `wordpress site/` | *(not in the repo)* Original WXR export + theme copy kept privately; only needed to re-run the migration pipeline |

### Redesign verification

`scripts/extract-text.mjs <outDir>` (with the build served at
`http://localhost:3999`) dumps each route's normalized main-content text;
diff two runs to prove a restyle didn't change any words. Baselines from the
pre-redesign markup live in `reference/text-baseline/` (gitignored).

### Future work

- The three article detail pages (`app/2025/...`, `app/2026/...`) still use
  the ported WP markup — the article template redesign is a later phase.
- Once articles are redesigned, `styles/wp-blocks.css` (~82 KB) can be
  trimmed or scoped to a route group (`app/(wp-posts)/`) instead of loading
  globally.

## Regeneration pipeline

The site was generated from captures of the live WordPress site. To re-run
(e.g. after WP content changes, while WP is still up):

```sh
./scripts/fetch-reference.sh      # capture rendered HTML + media into reference/ and public/
python3 scripts/extract-css.py    # pull every inline <style> handle out of the captures
python3 scripts/assemble-css.py   # build styles/*.css from the extracted handles
python3 scripts/port-pages.py     # regenerate app/**/page.tsx from the captured markup
npm run build                     # static export → out/
```

`reference/` is gitignored (it's a scratch transcription source).
`scripts/screenshot-compare.mjs` screenshots every route on local + live at
3 widths into `reference/shots/` for visual diffing.

## Dev / build

```sh
npm install
npm run dev        # local dev server
npm run build      # static export to out/
npx serve out      # preview the export
```

## Deploy (Cloudflare Pages)

1. Push to GitHub; in the Cloudflare dashboard → Workers & Pages → Create →
   Pages → connect the repo.
2. Build command `npm run build`, output directory `out`, `NODE_VERSION=20`+.
3. Verify on the `*.pages.dev` URL, then add the `fault.foundation` custom
   domain (zone is already on Cloudflare). Keep the old WP host as rollback
   for a week.

## Known deltas from the WordPress site (all intentional)

- **Montserrat and Fira Code fonts are not shipped** — installed on WP but
  used by zero elements (verified). Only Manrope loads. The WP-hosted
  Montserrat woff2 URLs are in the WXR export if the redesign wants them.
- **WP emoji script/styles and the WP Interactivity API runtime are gone.**
  Nav overlay/submenu behavior is reimplemented in `components/MainNav.tsx`
  toggling the same classes/ARIA attributes the core block toggles.
- **"Skip to content" links** (News, archives, 404) render at the top of page
  content rather than before the header, because the header is a shared
  layout component. Same target, slightly later tab order.
- One post linked to `/roadmap/\` (authoring typo WordPress tolerated); the
  replica links to `/roadmap/`. The pre-rename slug of the Discord post 301s
  via `_redirects`, as it did on WP.
- `aria-current`/`current-menu-item` are applied to the About/Policies nav
  links via client-side pathname matching (WP did it server-side). The
  logo/site-title links no longer get `aria-current` on the homepage.
- Analytics (gtag `GT-TNSMBN4N`) and the Givebutter donation widget are kept
  verbatim in `app/layout.tsx`.
- robots.txt is a plain allow-all + sitemap. The live site's AI-crawler
  directives came from Cloudflare's zone-level managed robots.txt /
  Content Signals, which keep applying to the zone independently of the origin.

## Licensing / provenance

No license has been chosen for this repository yet. Note regardless:

- `styles/wp-blocks.css` and `styles/wp-globals.css` are CSS emitted by
  WordPress core and the Twenty Twenty-Five theme, which are **GPL-2.0+**;
  those two files remain under the GPL whatever license the rest of the repo
  adopts.
- `public/fonts/manrope/` is the Manrope typeface, redistributed under the
  [SIL Open Font License 1.1](https://openfontlicense.org/).
- Site content (text, logo, photographs) is © The Fault Foundation Inc. and
  is not implicitly licensed by this repository being public.
