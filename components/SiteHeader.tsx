import { HeaderNav } from "./MainNav";

/** Sticky site header: skip link, logo + wordmark left, nav right. */
export function SiteHeader() {
  return (
    <header className="ff-header">
      <a className="ff-skip-link" href="#wp--skip-link--target">
        Skip to content
      </a>
      <div className="ff-header__inner">
        <a href="/" className="ff-header__brand" rel="home">
          <img
            width="57"
            height="40"
            src="/wp-content/uploads/2025/10/Blue-white-border-1-scaled.png"
            alt="The Fault Foundation"
            decoding="async"
            srcSet="/wp-content/uploads/2025/10/Blue-white-border-1-scaled.png 2560w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-300x209.png 300w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-1024x713.png 1024w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-768x535.png 768w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-1536x1069.png 1536w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-2048x1426.png 2048w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-160x111.png 160w"
            sizes="57px"
          />
          {/* Deliberately a <p>, not <h1>: each page supplies its own h1. */}
          <p className="ff-header__title">The Fault Foundation</p>
        </a>
        <HeaderNav />
      </div>
    </header>
  );
}
