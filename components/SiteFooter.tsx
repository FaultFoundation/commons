/**
 * Full-bleed footer bar matching the header's look. Lists every page
 * grouped under its top-level nav item (sitemap style), plus the brand
 * block and Discord CTA.
 *
 * Only the Commons group is served by this app; everything else lives in
 * the fault.foundation website repo, so those links are absolute.
 */

const SITE = "https://fault.foundation";

const groups: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Commons",
    links: [{ label: "Commons", href: "/" }],
  },
  {
    title: "About",
    links: [
      { label: "About", href: `${SITE}/about/` },
      { label: "Roadmap", href: `${SITE}/roadmap/` },
    ],
  },
  {
    title: "Policies",
    links: [
      { label: "Policies", href: `${SITE}/policies/` },
      { label: "Bylaws", href: `${SITE}/bylaws/` },
      { label: "Privacy Policy", href: `${SITE}/privacy-policy/` },
      { label: "Disciplinary Policy", href: `${SITE}/disciplinary-policy/` },
      { label: "Overfault Rulebook", href: `${SITE}/overfault-rulebook/` },
    ],
  },
  {
    title: "News",
    links: [
      { label: "Fault Foundation", href: `${SITE}/news/` },
      { label: "College Esports News", href: "https://collegeesportsnews.org/news/" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="ff-footer">
      <div className="ff-footer__inner">
        <div className="ff-footer__brand">
          <a href="https://fault.foundation/" rel="home">
            <img
              width="75"
              height="52"
              src="/wp-content/uploads/2025/10/Blue-white-border-1-scaled.png"
              alt="The Fault Foundation"
              decoding="async"
              srcSet="/wp-content/uploads/2025/10/Blue-white-border-1-scaled.png 2560w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-300x209.png 300w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-1024x713.png 1024w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-768x535.png 768w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-1536x1069.png 1536w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-2048x1426.png 2048w, /wp-content/uploads/2025/10/Blue-white-border-1-scaled-160x111.png 160w"
              sizes="75px"
            />
          </a>
          <div>
            <p className="ff-footer__title">
              <a href="https://fault.foundation/" rel="home">
                The Fault Foundation
              </a>
            </p>
            <p className="ff-footer__tagline">Gamers Supporting Students</p>
            <p className="ff-footer__cta">
              <a className="ff-btn" href="https://discord.com/invite/76D4TAdymH">
                Join Today!
              </a>
            </p>
          </div>
        </div>
        <nav className="ff-footer__nav" aria-label="Site map">
          {groups.map((group) => (
            <div key={group.title} className="ff-footer__group">
              <p className="ff-footer__group-title">{group.title}</p>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
