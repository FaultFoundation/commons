"use client";

/**
 * Site navigation, redesigned (ff- classes, styles/theme.css §6).
 * Same items/links as the original WP menu: About, Policies, News
 * (submenu: College Esports News + Fault Foundation), Join Today!.
 *
 * - Desktop: inline links right of the brand, News dropdown, CTA pill.
 * - Mobile (<782px): hamburger opens a full-screen overlay; Escape and
 *   the close button dismiss it; scroll is locked via html.ff-no-scroll.
 */

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function Chevron() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M1.5 4L6 8L10.5 4" strokeWidth="1.5" />
    </svg>
  );
}

/** Shared menu items (header + footer). */
function NavLinks() {
  const pathname = usePathname();
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const groupRef = useRef<HTMLLIElement>(null);

  // Close the News dropdown on click outside / Escape.
  useEffect(() => {
    if (!submenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!groupRef.current?.contains(e.target as Node)) setSubmenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSubmenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [submenuOpen]);

  const pageItem = (href: string, label: string) => {
    const current = pathname === href;
    return (
      <li>
        <a
          className="ff-nav__link"
          href={href}
          aria-current={current ? "page" : undefined}
        >
          {label}
        </a>
      </li>
    );
  };

  return (
    <>
      {pageItem("/about/", "About")}
      {pageItem("/policies/", "Policies")}
      <li
        ref={groupRef}
        className={`ff-nav__group${submenuOpen ? " is-open" : ""}`}
      >
        {/* The whole item toggles the dropdown; /news/ is reached via
            the "Fault Foundation" entry inside it. */}
        <button
          type="button"
          className={`ff-nav__link${
            pathname === "/news/" ? " is-current" : ""
          }`}
          aria-haspopup="true"
          aria-expanded={submenuOpen}
          onClick={() => setSubmenuOpen((open) => !open)}
        >
          News
          <Chevron />
        </button>
        <ul className="ff-nav__submenu">
          <li>
            <a href="https://collegeesportsnews.org/news/">
              College Esports News
            </a>
          </li>
          <li>
            <a href="/news/">Fault Foundation</a>
          </li>
        </ul>
      </li>
      <li className="ff-nav__cta">
        <a className="ff-btn" href="https://discord.com/invite/76D4TAdymH">
          Join Today!
        </a>
      </li>
    </>
  );
}

/** Header navigation: responsive, hamburger overlay on small screens. */
export function HeaderNav() {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("ff-no-scroll", open);
    if (open) closeButtonRef.current?.focus();
    return () => document.documentElement.classList.remove("ff-no-scroll");
  }, [open]);

  const close = () => {
    setOpen(false);
    openButtonRef.current?.focus();
  };

  return (
    <nav
      className="ff-nav"
      aria-label="Navigation"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) close();
      }}
    >
      <button
        ref={openButtonRef}
        type="button"
        className="ff-nav__open"
        aria-haspopup="dialog"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <svg
          width="24"
          height="24"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M5 5v1.5h14V5H5z" />
          <path d="M5 12.8h14v-1.5H5v1.5z" />
          <path d="M5 19h14v-1.5H5V19z" />
        </svg>
      </button>
      <div
        className={`ff-nav__container${open ? " is-open" : ""}`}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Menu" : undefined}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="ff-nav__close"
          aria-label="Close menu"
          onClick={close}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m13.06 12 6.47-6.47-1.06-1.06L12 10.94 5.53 4.47 4.47 5.53 10.94 12l-6.47 6.47 1.06 1.06L12 13.06l6.47 6.47 1.06-1.06L13.06 12Z" />
          </svg>
        </button>
        <ul className="ff-nav__list">
          <NavLinks />
        </ul>
      </div>
    </nav>
  );
}

