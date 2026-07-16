import type { Metadata } from "next";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { SplitFeature } from "@/components/SplitFeature";
import type { ImageSource } from "@/lib/posts";

export const metadata: Metadata = {
  title: "About",
  alternates: { canonical: "/about/" },
  openGraph: {
    description: "Who Are We? Gamers Supporting Students By Students; For Students The Fault Foundation was built by students and for students globally. We understand how challenging it is to be a full-time student. We are giving back to the community that once supported us through turbulent times. Our Vision The Fault Foundation advances gaming culture and […]",
    images: ["/wp-content/uploads/2025/10/White-black-border-scaled.png"],
  },
};

/** Placeholder art shared by the feature cards (same as before). */
const featureImage: ImageSource = {
  src: "/wp-content/uploads/2025/10/White-black-border-1024x713.png",
  width: 1024,
  height: 713,
  srcSet:
    "/wp-content/uploads/2025/10/White-black-border-1024x713.png 1024w, /wp-content/uploads/2025/10/White-black-border-300x209.png 300w, /wp-content/uploads/2025/10/White-black-border-768x535.png 768w, /wp-content/uploads/2025/10/White-black-border-1536x1069.png 1536w, /wp-content/uploads/2025/10/White-black-border-2048x1425.png 2048w",
  sizes: "(max-width: 1024px) 100vw, 1024px",
};

const team: {
  name: string;
  role: string;
  school?: string;
  image: ImageSource;
}[] = [
  {
    name: "Oscar Labit",
    role: "President & Treasurer",
    school: "Michigan State University",
    image: {
      src: "/wp-content/uploads/2025/11/Oscar-Headshot.jpg-768x1024.jpg",
      width: 768,
      height: 1024,
      srcSet:
        "/wp-content/uploads/2025/11/Oscar-Headshot.jpg-768x1024.jpg 768w, /wp-content/uploads/2025/11/Oscar-Headshot.jpg-225x300.jpg 225w, /wp-content/uploads/2025/11/Oscar-Headshot.jpg-1152x1536.jpg 1152w, /wp-content/uploads/2025/11/Oscar-Headshot.jpg-1536x2048.jpg 1536w, /wp-content/uploads/2025/11/Oscar-Headshot.jpg-scaled.jpg 1920w",
      sizes: "180px",
    },
  },
  {
    name: "Wesley Shaver",
    role: "Vice President of Esports",
    school: "University of Southern Indiana",
    image: {
      src: "/wp-content/uploads/2025/11/Wes-Headshot-474x1024.jpg",
      width: 474,
      height: 1024,
      srcSet:
        "/wp-content/uploads/2025/11/Wes-Headshot-474x1024.jpg 474w, /wp-content/uploads/2025/11/Wes-Headshot-139x300.jpg 139w, /wp-content/uploads/2025/11/Wes-Headshot-768x1661.jpg 768w, /wp-content/uploads/2025/11/Wes-Headshot-710x1536.jpg 710w, /wp-content/uploads/2025/11/Wes-Headshot.jpg 947w",
      sizes: "180px",
    },
  },
  {
    name: "Ryan Schmidt",
    role: "Board Member",
    school: "Michigan State University",
    image: {
      src: "/wp-content/uploads/2025/11/Ryan-Headshot-768x1024.jpg",
      width: 768,
      height: 1024,
      srcSet:
        "/wp-content/uploads/2025/11/Ryan-Headshot-768x1024.jpg 768w, /wp-content/uploads/2025/11/Ryan-Headshot-225x300.jpg 225w, /wp-content/uploads/2025/11/Ryan-Headshot-1152x1536.jpg 1152w, /wp-content/uploads/2025/11/Ryan-Headshot.jpg 1500w",
      sizes: "180px",
    },
  },
  {
    name: "Mackenzie Gunthrie",
    role: "Board Member",
    image: {
      src: "/wp-content/uploads/2025/11/IMG_1875-1024x768.jpg",
      width: 1024,
      height: 768,
      srcSet:
        "/wp-content/uploads/2025/11/IMG_1875-1024x768.jpg 1024w, /wp-content/uploads/2025/11/IMG_1875-300x225.jpg 300w, /wp-content/uploads/2025/11/IMG_1875-768x576.jpg 768w, /wp-content/uploads/2025/11/IMG_1875-1536x1152.jpg 1536w, /wp-content/uploads/2025/11/IMG_1875-2048x1536.jpg 2048w",
      sizes: "180px",
    },
  },
];

export default function AboutPage() {
  return (
    <main id="wp--skip-link--target" className="ff-main">
      <div className="ff-container ff-container--wide">
        <section
          className="ff-hero ff-hero--compact"
          style={{
            backgroundImage:
              "url('/wp-content/uploads/2025/10/Fault-Foundation-Images-1.png')",
          }}
        >
          <div className="ff-hero__inner">
            <h1 className="ff-hero__title">Who Are We?</h1>
            <p className="ff-hero__subtitle">Gamers Supporting Students</p>
          </div>
        </section>
      </div>

      <div className="ff-container ff-stack ff-section--tight">
        <SplitFeature
          heading="By Students; For Students"
          image={featureImage}
          reverse
        >
          <p>
            The Fault Foundation was built <em>by students</em> and{" "}
            <em>for students</em> globally. We understand how challenging it is
            to be a full-time student. We are giving back to the community that
            once supported us through turbulent times.
          </p>
        </SplitFeature>

        <SplitFeature heading="Our Vision" image={featureImage}>
          <p>
            The Fault Foundation advances gaming culture and education by
            creating inclusive competitive gaming opportunities; fostering
            community connections between gamers across diverse backgrounds;
            and developing educational programs that promote teamwork,
            strategic thinking, and digital citizenship.
          </p>
        </SplitFeature>

        <SplitFeature heading="How We Support" image={featureImage} reverse>
          <p>
            <em>
              All revenue generated goes toward providing scholarships and
              funding operations
            </em>
            . We host community events to connect students and alumni together,
            casual tournaments to build digital citizenship, and a Discord
            server to foster relationships across diverse backgrounds.
          </p>
        </SplitFeature>
      </div>

      <div className="ff-container ff-container--wide ff-section--tight">
        <section
          className="ff-hero ff-hero--compact"
          style={{
            backgroundImage:
              "url('/wp-content/uploads/2025/10/Fault-Foundation-Images-1.png')",
          }}
        >
          <div className="ff-hero__inner">
            <h2 className="ff-hero__title" id="our-team">
              Our Team
            </h2>
            <p className="ff-hero__subtitle">By Students; For Students</p>
          </div>
        </section>
      </div>

      <div className="ff-container ff-section--tight">
        <div className="ff-team-grid">
          {team.map((member) => (
            <div key={member.name} className="ff-card ff-team-card">
              <img
                src={member.image.src}
                width={member.image.width}
                height={member.image.height}
                srcSet={member.image.srcSet}
                sizes={member.image.sizes}
                alt=""
                decoding="async"
                loading="lazy"
              />
              <h3>{member.name}</h3>
              <p>{member.role}</p>
              {member.school && (
                <p className="ff-team-card__school">{member.school}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="ff-container ff-container--wide ff-section--tight">
        <section
          className="ff-hero ff-hero--compact"
          style={{
            backgroundImage:
              "url('/wp-content/uploads/2025/10/Fault-Foundation-Images-1.png')",
          }}
        >
          <div className="ff-hero__inner">
            {/* No id here: the original duplicated id="our-team" by mistake. */}
            <h2 className="ff-hero__title">What’s next?</h2>
          </div>
        </section>
      </div>

      <div className="ff-container ff-section--tight">
        <SplitFeature
          heading="Roadmap"
          image={featureImage}
          cta={{ label: "Roadmap", href: "/roadmap/" }}
        >
          <p>
            In an effort to stay true to our mission and objectives, we’ve
            recently published a roadmap detailing ongoing projects and future
            endeavors.
          </p>
        </SplitFeature>
      </div>

      <div className="ff-container ff-section--tight">
        <h2 className="ff-band-title" id="history">
          Our History
        </h2>
        <CollapsibleSection
          heading="May 21, 2025 | Initialization"
          headingLevel="h3"
        >
          <p>
            Oscar Labit and friends created two Overwatch teams named Fault and
            D-Fault to participated in an online Overwatch tournament to
            support nonprofits. Fault placed second place and a community was
            born.
          </p>
        </CollapsibleSection>
        <CollapsibleSection
          heading="July 4, 2025 | Legalization"
          headingLevel="h3"
        >
          <p>
            “Fault Foundation Inc.” became a registered nonprofit corporation.
            A formal Board of Director was introduced, and the mission, vision,
            and purpose were finalized.
          </p>
        </CollapsibleSection>
        <CollapsibleSection
          heading="September 15, 2025 | 501(c)(3) Approval"
          headingLevel="h3"
        >
          <p>
            “Fault Foundation Inc.” became a registered 501(c)(3) nonprofit
            organization. This promotes donations by establishing tax-exempt
            status. Read more about the process{" "}
            <a href="https://www.irs.gov/charities-non-profits/charitable-organizations/exemption-requirements-501c3-organizations">
              here
            </a>
            .
          </p>
        </CollapsibleSection>
      </div>
    </main>
  );
}
