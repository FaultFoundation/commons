import type { Metadata } from "next";
import Script from "next/script";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

import "@/styles/fonts.css";
// Brand tokens + element base styles; theme.css aliases its presets.
import "@/styles/wp-globals.css";
// Theme layer — must come last so ff-* rules win specificity ties.
import "@/styles/theme.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://commons.fault.foundation"),
  title: {
    default: "The Fault Foundation",
    // Matches the live Yoast title format: "<Page> - The Fault Foundation"
    template: "%s - The Fault Foundation",
  },
  // Same icon files/sizes the live WP site serves
  icons: {
    icon: [
      {
        url: "/wp-content/uploads/2025/11/cropped-Blue-white-border-copy-1-scaled-1-32x32.png",
        sizes: "32x32",
      },
      {
        url: "/wp-content/uploads/2025/11/cropped-Blue-white-border-copy-1-scaled-1-192x192.png",
        sizes: "192x192",
      },
    ],
    apple: [
      {
        url: "/wp-content/uploads/2025/11/cropped-Blue-white-border-copy-1-scaled-1-180x180.png",
      },
    ],
  },
};

// Inline gtag bootstrap as served on the live site (Google Site Kit).
const GTAG_INLINE = `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}
gtag("set","linker",{"domains":["fault.foundation"]});
gtag("js", new Date());
gtag("set", "developer_id.dZTNiMT", true);
gtag("config", "GT-TNSMBN4N");
window._googlesitekit = window._googlesitekit || {}; window._googlesitekit.throttledEvents = []; window._googlesitekit.gtagEvent = (name, data) => { var key = JSON.stringify( { name, data } ); if ( !! window._googlesitekit.throttledEvents[ key ] ) { return; } window._googlesitekit.throttledEvents[ key ] = true; setTimeout( () => { delete window._googlesitekit.throttledEvents[ key ]; }, 5 ); gtag( "event", name, { ...data, event_source: "site-kit" } ); };`;

// Parser-blocking, runs before the header paints: stamps the cached
// signed-in hint (lib/auth-hint.ts) onto <html> so CSS can show the right
// header control immediately instead of flashing "Sign In" on every load.
const AUTH_HINT_INLINE = `try{document.documentElement.dataset.auth=localStorage.getItem("ff-auth")==="1"?"in":"out"}catch(e){document.documentElement.dataset.auth="out"}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the auth-hint script below mutates <html>
    // (data-auth) before React hydrates.
    <html lang="en-US" suppressHydrationWarning>
      <body className="wp-custom-logo wp-embed-responsive wp-theme-twentytwentyfive">
        <script dangerouslySetInnerHTML={{ __html: AUTH_HINT_INLINE }} />
        {/* Floating donation widget, as on the live site */}
        <givebutter-widget id="pEZdY1"></givebutter-widget>
        <div className="wp-site-blocks">
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=GT-TNSMBN4N"
          strategy="afterInteractive"
        />
        <Script
          id="ff-gtag-bootstrap"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: GTAG_INLINE }}
        />
        <Script
          src="https://widgets.givebutter.com/latest.umd.cjs?acct=SyOqvC7iDnp3tRJY&p=wordpress"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
