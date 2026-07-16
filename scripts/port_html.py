#!/usr/bin/env python3
"""Convert fragments of the captured live-site HTML (reference/*.html) into JSX.

Used as a library by port-pages.py; can also be run directly:
  python3 scripts/port_html.py reference/home.html   # prints the page-content JSX
"""
from __future__ import annotations

import re
import sys
from html.parser import HTMLParser

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
    # svg leaf elements we may meet
    "path", "circle", "rect", "line", "polyline", "polygon", "stop", "use",
}

ATTR_MAP = {
    "class": "className",
    "for": "htmlFor",
    "tabindex": "tabIndex",
    "srcset": "srcSet",
    "fetchpriority": "fetchPriority",
    "datetime": "dateTime",
    "colspan": "colSpan",
    "rowspan": "rowSpan",
    "autocomplete": "autoComplete",
    "readonly": "readOnly",
    "maxlength": "maxLength",
    "crossorigin": "crossOrigin",
    "viewbox": "viewBox",
    "fill-rule": "fillRule",
    "clip-rule": "clipRule",
    "stroke-width": "strokeWidth",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "xmlns:xlink": "xmlnsXlink",
    "xlink:href": "xlinkHref",
    "frameborder": "frameBorder",
    "allowfullscreen": "allowFullScreen",
    "referrerpolicy": "referrerPolicy",
}

URL_ATTRS = {"href", "src", "srcSet", "poster", "content", "action"}


def rewrite_urls(value: str) -> str:
    """Make self-references root-relative; leave external URLs alone."""
    value = value.replace("https://fault.foundation/", "/")
    if value == "https://fault.foundation":
        return "/"
    # One post links to "/roadmap/\" (authoring typo WP tolerates; a static
    # host would 404). Same destination, valid URL.
    if value.startswith("/") and value.endswith("\\"):
        value = value.rstrip("\\")
    return value


def css_prop_to_jsx(prop: str) -> str:
    prop = prop.strip()
    if prop.startswith("--"):
        return f"'{prop}'"
    parts = prop.split("-")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def style_to_object(style: str) -> str:
    decls = []
    for decl in style.split(";"):
        if ":" not in decl:
            continue
        prop, value = decl.split(":", 1)
        value = rewrite_urls(value.strip()).replace("'", "\\'")
        decls.append(f"{css_prop_to_jsx(prop)}: '{value}'")
    return "{{ " + ", ".join(decls) + " }}"


def esc_text(text: str) -> str:
    """Escape JSX-special characters in a text node."""
    return (
        text.replace("{", "{'{'}")
        .replace("}", "{'}'}")
        .replace("<", "{'<'}")
        .replace(">", "{'>'}")
    )


def esc_attr(value: str) -> str:
    """Return a JSX attribute value expression."""
    if '"' in value:
        return "{" + repr(value) + "}"
    return f'"{value}"'


class JSXBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.stack: list[str] = []
        self.in_style = False
        self.style_buf: list[str] = []
        self.style_attrs: list[tuple[str, str | None]] = []

    # -- helpers ---------------------------------------------------------
    def _emit_attrs(self, attrs: list[tuple[str, str | None]]) -> str:
        chunks = []
        for name, value in attrs:
            if name.startswith("data-wp-"):  # WP Interactivity API leftovers
                continue
            name = ATTR_MAP.get(name, name)
            if value is None:
                if name == "alt":  # minifier drops the ="" but React needs it
                    chunks.append('alt=""')
                else:
                    chunks.append(name)
            elif name == "style":
                chunks.append(f"style={style_to_object(value)}")
            elif name == "tabIndex":
                chunks.append(f"tabIndex={{{value}}}")  # React types want a number
            else:
                if name in URL_ATTRS:
                    value = rewrite_urls(value)
                chunks.append(f"{name}={esc_attr(value)}")
        return (" " + " ".join(chunks)) if chunks else ""

    # -- parser events ---------------------------------------------------
    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "style":
            self.in_style = True
            self.style_buf = []
            self.style_attrs = attrs
            return
        a = self._emit_attrs(attrs)
        if tag in VOID:
            self.out.append(f"<{tag}{a} />")
        else:
            self.out.append(f"<{tag}{a}>")
            self.stack.append(tag)

    def handle_startendtag(self, tag: str, attrs) -> None:
        self.out.append(f"<{tag}{self._emit_attrs(attrs)} />")

    def handle_endtag(self, tag: str) -> None:
        if tag == "style" and self.in_style:
            css = "".join(self.style_buf)
            css = css.replace("/*<![CDATA[*/", "").replace("/*]]>*/", "")
            attrs = self._emit_attrs(self.style_attrs)
            self.out.append(
                f"<style{attrs} dangerouslySetInnerHTML={{{{ __html: {repr(css)} }}}} />"
            )
            self.in_style = False
            return
        if tag in VOID:
            return
        # tolerate stray close tags from the minifier
        while self.stack:
            top = self.stack.pop()
            self.out.append(f"</{top}>")
            if top == tag:
                break

    def handle_data(self, data: str) -> None:
        if self.in_style:
            self.style_buf.append(data)
            return
        if data.strip() == "":
            # Whitespace-only node: preserve as an explicit space so inline
            # spacing between elements stays identical (JSX would drop it).
            if data:
                self.out.append("{' '}")
            return
        self.out.append(esc_text(data))

    def result(self) -> str:
        while self.stack:
            self.out.append(f"</{self.stack.pop()}>")
        return "".join(self.out)


def decode_cfemail(hexstr: str) -> str:
    """Undo Cloudflare's email obfuscation (first byte is the XOR key)."""
    raw = bytes.fromhex(hexstr)
    return "".join(chr(b ^ raw[0]) for b in raw[1:])


def restore_cf_emails(fragment: str) -> str:
    """Cloudflare rewrote mailto links in the capture; restore the originals."""

    def repl(m: re.Match) -> str:
        email = decode_cfemail(m.group(1))
        return f'<a href="mailto:{email}">{email}</a>'

    return re.sub(
        r'<a[^>]*__cf_email__[^>]*data-cfemail="?([a-f0-9]+)"?[^>]*>.*?</a>',
        repl,
        fragment,
        flags=re.S,
    )


def html_fragment_to_jsx(fragment: str) -> str:
    # the live HTML has newlines *inside* tags; normalise whitespace first
    fragment = re.sub(r"\s+", " ", restore_cf_emails(fragment))
    builder = JSXBuilder()
    builder.feed(fragment)
    return builder.result()


def page_content(path: str) -> str:
    """Everything between </header> and <footer — the page's own content."""
    html = open(path, encoding="utf-8", errors="replace").read()
    start = html.find("</header>") + len("</header>")
    end = html.find("<footer")
    return html[start:end]


def header_fragment(path: str) -> str:
    html = open(path, encoding="utf-8", errors="replace").read()
    return html[html.find("<header") : html.find("</header>") + len("</header>")]


def footer_fragment(path: str) -> str:
    html = open(path, encoding="utf-8", errors="replace").read()
    return html[html.find("<footer") : html.find("</footer>") + len("</footer>")]


if __name__ == "__main__":
    print(html_fragment_to_jsx(page_content(sys.argv[1])))
