#!/usr/bin/env python3
"""Assemble the site's global CSS from the live-site reference captures.

Produces:
  styles/fonts.css      — Manrope @font-face (self-hosted; Montserrat verified unused)
  styles/wp-blocks.css  — per-block core CSS + block library + skip link + theme style,
                          in the order the live <head> loads them
  styles/wp-globals.css — global styles (tokens/presets/element styles) + block style
                          variations + merged per-page block-supports layout rules

Re-run after refreshing reference/ captures.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "reference"
CSS = REF / "css"
OUT = ROOT / "styles"
OUT.mkdir(exist_ok=True)


def read(name: str) -> str:
    text = (CSS / f"{name}.css").read_text()
    text = re.sub(r"^/\* extracted from .*? \*/\n", "", text)  # our extraction header
    text = text.replace("/*<![CDATA[*/", "").replace("/*]]>*/", "")
    # sourceURL comments are meaningless once self-hosted
    text = re.sub(r"/\*# sourceURL=.*?\*/", "", text)
    # any absolute self-references (e.g. background images) become root-relative
    text = text.replace("https://fault.foundation/", "/")
    return text.strip() + "\n"


def block(name: str) -> str:
    return f"/* ==== {name} ==== */\n" + read(name)


# ---- fonts.css: Manrope @font-face only (Montserrat has zero usages on the site) ----
fonts_src = re.search(
    r"<style[^>]*class=wp-fonts-local[^>]*>(.*?)</style>",
    (REF / "home.html").read_text(errors="replace"),
    re.S,
).group(1)
manrope_faces = [
    face
    for face in re.findall(r"@font-face\{[^}]*\}", fonts_src)
    if "Manrope" in face
]
manrope_css = "\n".join(manrope_faces)
manrope_css = re.sub(
    r"url\('[^']*/(Manrope[^'/]*\.woff2)'\)", r"url('/fonts/manrope/\1')", manrope_css
)
(OUT / "fonts.css").write_text(
    "/* Self-hosted fonts (from live wp-fonts-local). Montserrat was installed on the\n"
    "   WP site but used by zero elements — intentionally not shipped. */\n"
    + manrope_css
    + "\n"
)

# ---- wp-blocks.css: block CSS in live head order, then the rest of the handles ----
head_order = [
    "wp-img-auto-sizes-contain-inline-css",
    "wp-block-site-logo-inline-css",
    "wp-block-site-title-inline-css",
    "wp-block-group-inline-css",
    "wp-block-navigation-link-inline-css",
    "wp-block-navigation-inline-css",  # served as the external minified bundle on live
    "wp-block-columns-inline-css",
    "wp-block-heading-inline-css",
    "wp-block-image-inline-css",
    "wp-block-paragraph-inline-css",
    "wp-block-button-inline-css",
    "wp-block-buttons-inline-css",
    "wp-block-post-content-inline-css",
    "wp-block-site-tagline-inline-css",
]
# handles that only appear on some pages (covers, tables, posts …) slot in before the
# library/global layers; relative order among sibling block handles doesn't matter
extra = sorted(
    p.stem
    for p in CSS.glob("wp-block-*-inline-css.css")
    if p.stem not in head_order
)
tail = [
    "wp-block-library-inline-css",
    "wp-block-template-skip-link-inline-css",
    "twentytwentyfive-style-inline-css",
]
extra = [name for name in extra if name not in tail]
parts = [block(n) for n in head_order + extra + tail]
(OUT / "wp-blocks.css").write_text("\n".join(parts))

# ---- wp-globals.css: tokens/global styles + variations + merged block supports ----
# global styles are tree-shaken per page on live WP; use the cross-page merge
globals_css = read("merged-global-styles-inline-css")
# Drop the WP Font Library preview URL comment noise if any; keep everything else verbatim.
parts = [
    "/* ==== global-styles (tokens, presets, element styles) ==== */\n" + globals_css,
    "/* ==== block style variations ==== */\n"
    + read("merged-block-style-variation-styles-inline-css"),
    "/* ==== per-container layout rules (merged across all live pages) ==== */\n"
    + read("merged-core-block-supports-inline-css"),
]
(OUT / "wp-globals.css").write_text("\n".join(parts))

for f in ("fonts.css", "wp-blocks.css", "wp-globals.css"):
    print(f"{f}: {(OUT / f).stat().st_size} bytes")
