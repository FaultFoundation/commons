#!/usr/bin/env python3
"""Extract every inline <style id=…> block from reference/*.html into
reference/css/, keeping the largest instance per id, and build merged
(deduplicated) versions of the per-page handles (block supports + block
style variations). Run before assemble-css.py.
"""
import re
from pathlib import Path

REF = Path(__file__).resolve().parent.parent / "reference"
CSS = REF / "css"
CSS.mkdir(exist_ok=True)

seen: dict[str, tuple[str, str]] = {}
for path in sorted(REF.glob("*.html")):
    html = path.read_text(encoding="utf-8", errors="replace")
    for m in re.finditer(
        r'<style[^>]*\bid=["\']?([\w-]+)["\']?[^>]*>(.*?)</style>', html, re.S
    ):
        sid, css = m.group(1), m.group(2)
        if sid not in seen or len(css) > len(seen[sid][1]):
            seen[sid] = (path.name, css)

for sid, (src, css) in sorted(seen.items()):
    (CSS / f"{sid}.css").write_text(f"/* extracted from {src} */\n{css}")

# Merge per-page handles across every capture. Block supports rules are keyed
# by hashed container classes; global styles are tree-shaken per page (WP only
# prints rules for blocks present on that page), and every page emits its
# rules in the same canonical sequence, so a first-seen-order union preserves
# the cascade.
for sid in (
    "core-block-supports-inline-css",
    "block-style-variation-styles-inline-css",
    "global-styles-inline-css",
):
    unique: list[str] = []
    known: set[str] = set()
    for path in sorted(REF.glob("*.html")):
        html = path.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(
            r'<style[^>]*\bid=["\']?' + sid + r'["\']?[^>]*>(.*?)</style>', html, re.S
        ):
            for rule in re.findall(r"[^{}]+\{[^{}]*\}", m.group(1)):
                rule = rule.strip()
                if rule and rule not in known:
                    known.add(rule)
                    unique.append(rule)
    (CSS / f"merged-{sid}.css").write_text("\n".join(unique))
    print(f"merged-{sid}: {len(unique)} rules")

print(f"{len(seen)} style handles extracted")
