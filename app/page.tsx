import type { Metadata } from "next";

import { HeroCarousel } from "@/components/HeroCarousel";
import { SplitFeature } from "@/components/SplitFeature";
import { heroSlides } from "@/lib/heroSlides";
import type { ImageSource } from "@/lib/posts";

export const metadata: Metadata = {
  // Absolute: the root layout's title.template doesn't apply to its own
  // segment in current Next, and the live site serves the suffixed form.
  title: { absolute: "Home - The Fault Foundation" },
  alternates: { canonical: "/" },
  openGraph: {
    description: "The Fault Foundation Gamers Supporting Students Who We Are The Fault Foundation Inc. is a 501(c)(3) registered nonprofit corporation that empowers students through video games. Our goal is to build a future where gaming serves as a bridge for furthering education, promoting personal development, and creating community. Why the “Fault” Foundation? While playing raids in […]",
    images: ["/wp-content/uploads/2025/10/White-black-border-1024x713.png"],
  },
};

/** Placeholder art shared by the three feature cards (same as before). */
const featureImage: ImageSource = {
  src: "/wp-content/uploads/2025/10/White-black-border-1024x713.png",
  width: 1024,
  height: 713,
  srcSet:
    "/wp-content/uploads/2025/10/White-black-border-1024x713.png 1024w, /wp-content/uploads/2025/10/White-black-border-300x209.png 300w, /wp-content/uploads/2025/10/White-black-border-768x535.png 768w, /wp-content/uploads/2025/10/White-black-border-1536x1069.png 1536w, /wp-content/uploads/2025/10/White-black-border-2048x1425.png 2048w",
  sizes: "(max-width: 1024px) 100vw, 1024px",
};

export default function HomePage() {
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
            <h1 className="ff-hero__title">The Fault Foundation</h1>
            <p className="ff-hero__subtitle">Gamers Supporting Students</p>
          </div>
        </section>
      </div>

      <div className="ff-container ff-container--wide ff-section--tight">
        <HeroCarousel slides={heroSlides} />
      </div>

      <div className="ff-container ff-stack ff-section">
        <SplitFeature
          heading="Who We Are"
          image={featureImage}
          cta={{
            label: "Introductions and Goals",
            href: "/2025/11/the-fault-foundation-who-we-are-and-whats-next/",
          }}
        >
          <p>
            The Fault Foundation Inc. is a 501(c)(3) registered nonprofit
            corporation that empowers students through video games. Our goal is
            to build a future where gaming serves as a bridge for furthering
            education, promoting personal development, and creating community.
          </p>
        </SplitFeature>

        <SplitFeature
          heading="Why the “Fault” Foundation?"
          image={featureImage}
          reverse
        >
          <p>
            While playing raids in Destiny 2, it was a common joke for one of
            the six people to always take fault for everyone’s mistakes. Time
            and time again, they would grow tired of the complaints and after
            an outburst, the blame would shift to someone else.
          </p>
          <p>
            <em>It’s always someone else’s fault.</em>
          </p>
          <p>
            However, in order to grow as a person, and gamer, it’s essential to
            recognize our faults, analyze them, and improve ourselves.
          </p>
        </SplitFeature>

        <SplitFeature
          heading="Why We Serve"
          image={featureImage}
          cta={{ label: "Our Team", href: "/about/#our-team" }}
        >
          <p>
            All members of the Fault Foundation are students and alumni from
            universities around the world, so they understand how mentally
            taxing it can be to be a full-time student, maintain relationships,
            and afford tuition. Our members believe that playing games can
            lessen these burdens through community, competition, and
            scholarship.
          </p>
        </SplitFeature>
      </div>
    </main>
  );
}
