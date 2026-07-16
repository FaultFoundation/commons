#!/usr/bin/env python3
"""Generate app/**/page.tsx files from the captured live-site HTML.

Each page component is the live rendered content (between </header> and
<footer) converted to JSX, plus metadata matching the live Yoast tags.
"""
from __future__ import annotations

import html as htmlmod
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from port_html import html_fragment_to_jsx, page_content  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "reference"

# reference file -> (route dir under app/, component name, is_post)
PAGES = {
    "home.html": ("", "HomePage", False),
    "about.html": ("about", "AboutPage", False),
    "news.html": ("news", "NewsPage", False),
    "policies.html": ("policies", "PoliciesPage", False),
    "bylaws.html": ("bylaws", "BylawsPage", False),
    "disciplinary-policy.html": ("disciplinary-policy", "DisciplinaryPolicyPage", False),
    "privacy-policy.html": ("privacy-policy", "PrivacyPolicyPage", False),
    "roadmap.html": ("roadmap", "RoadmapPage", False),
    "overfault-rulebook.html": ("overfault-rulebook", "OverfaultRulebookPage", False),
    "post-who-we-are.html": (
        "2025/11/the-fault-foundation-who-we-are-and-whats-next",
        "WhoWeArePost",
        True,
    ),
    "post-discord-personal-info.html": (
        "2025/12/discord-and-sharing-personal-information",
        "DiscordPersonalInfoPost",
        True,
    ),
    "post-community-verification.html": (
        "2026/01/community-verification",
        "CommunityVerificationPost",
        True,
    ),
    # WP auto-generated archives linked from post pages
    "author-oscar.html": ("author/admin_saivw2jq", "AuthorArchivePage", False),
    "tag-discussion.html": ("tag/discussion", "TagDiscussionPage", False),
    "tag-future.html": ("tag/future", "TagFuturePage", False),
    "tag-news.html": ("tag/news", "TagNewsPage", False),
    "tag-update.html": ("tag/update", "TagUpdatePage", False),
}


def meta_of(path: Path) -> dict:
    src = path.read_text(encoding="utf-8", errors="replace")
    head = src[: src.find("<body")]
    grab = lambda pat: (m.group(1) if (m := re.search(pat, head, re.S)) else None)
    title = grab(r"<title>(.*?)</title>")
    title = htmlmod.unescape(re.sub(r"\s+", " ", title or "").strip())
    title = re.sub(r" - The Fault Foundation$", "", title)
    return {
        "title": title,
        "og_description": htmlmod.unescape(
            grab(r'property="og:description" content="([^"]*)"') or ""
        )
        or None,
        "og_image": grab(r'property="og:image" content="([^"]*)"'),
        "published": grab(r'property="article:published_time" content="([^"]*)"'),
        "modified": grab(r'property="article:modified_time" content="([^"]*)"'),
    }


def ts_str(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def metadata_block(meta: dict, route: str, is_post: bool) -> str:
    canonical = "/" if route == "" else f"/{route}/"
    lines = [f"  title: {ts_str(meta['title'])},"]
    lines.append(f"  alternates: {{ canonical: {ts_str(canonical)} }},")
    og: list[str] = []
    if meta["og_description"]:
        og.append(f"    description: {ts_str(meta['og_description'])},")
    if meta["og_image"]:
        img = meta["og_image"].replace("https://fault.foundation", "")
        og.append(f"    images: [{ts_str(img)}],")
    if is_post:
        og.append('    type: "article",')
        if meta["published"]:
            og.append(f"    publishedTime: {ts_str(meta['published'])},")
        if meta["modified"]:
            og.append(f"    modifiedTime: {ts_str(meta['modified'])},")
    if og:
        lines.append("  openGraph: {\n" + "\n".join(og) + "\n  },")
    return "export const metadata: Metadata = {\n" + "\n".join(lines) + "\n};"


# On live, templates that render a <main> (News, archives, 404) also emit WP's
# hidden skip link (before the header). We render it at the top of those pages'
# content instead, since the header is a shared layout component.
SKIP_LINK = (
    '<a className="skip-link screen-reader-text" id="wp-skip-link" '
    'href="#wp--skip-link--target">Skip to content</a>'
)


def gen_page(ref_name: str, route: str, component: str, is_post: bool) -> None:
    ref = REF / ref_name
    jsx = html_fragment_to_jsx(page_content(str(ref)))
    if "<main" in jsx:
        jsx = SKIP_LINK + jsx
    meta = meta_of(ref)
    out_dir = ROOT / "app" / route if route else ROOT / "app"
    out_dir.mkdir(parents=True, exist_ok=True)
    body = f"""import type {{ Metadata }} from "next";

{metadata_block(meta, route, is_post)}

export default function {component}() {{
  return (
    <>
      {jsx}
    </>
  );
}}
"""
    (out_dir / "page.tsx").write_text(body)
    print(f"wrote app/{route + '/' if route else ''}page.tsx ({len(jsx)} chars JSX)")


def gen_not_found() -> None:
    jsx = SKIP_LINK + html_fragment_to_jsx(page_content(str(REF / "404.html")))
    body = f"""export default function NotFound() {{
  return (
    <>
      {jsx}
    </>
  );
}}
"""
    (ROOT / "app" / "not-found.tsx").write_text(body)
    print(f"wrote app/not-found.tsx ({len(jsx)} chars JSX)")


if __name__ == "__main__":
    for ref_name, (route, component, is_post) in PAGES.items():
        gen_page(ref_name, route, component, is_post)
    gen_not_found()
