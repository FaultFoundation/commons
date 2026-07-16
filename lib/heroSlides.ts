import type { ImageSource } from "@/lib/posts";

/**
 * Slides for the homepage hero slideshow. Data-driven so new program
 * promos are a single entry here — swap `image` when new media is
 * ready. Copy reuses strings that already exist on the site.
 */

export type HeroSlide = {
  key: string;
  title: string;
  tagline?: string;
  cta: { label: string; href: string; external?: boolean };
  image: ImageSource;
  imageAlt: string;
  /** CSS object-position for the slide crop (default "50% 50%"). */
  imagePosition?: string;
};

export const heroSlides: HeroSlide[] = [
  {
    key: "overfault",
    title: "Overfault",
    cta: { label: "Overfault Rulebook", href: "/overfault-rulebook/" },
    image: {
      src: "/wp-content/uploads/2025/10/Fault-Foundation-Images-1.png",
      width: 1280,
      height: 720,
    },
    imageAlt: "",
  },
  {
    key: "discord",
    title: "Join Today!",
    tagline: "Gamers Supporting Students",
    cta: {
      label: "Join Today!",
      href: "https://discord.com/invite/76D4TAdymH",
      external: true,
    },
    image: {
      src: "/wp-content/uploads/2025/12/Discord-and-Sharing-Personal-Information.png",
      width: 1280,
      height: 720,
      srcSet:
        "/wp-content/uploads/2025/12/Discord-and-Sharing-Personal-Information.png 1280w, /wp-content/uploads/2025/12/Discord-and-Sharing-Personal-Information-300x169.png 300w, /wp-content/uploads/2025/12/Discord-and-Sharing-Personal-Information-1024x576.png 1024w, /wp-content/uploads/2025/12/Discord-and-Sharing-Personal-Information-768x432.png 768w",
      sizes: "(max-width: 1280px) 100vw, 1280px",
    },
    imageAlt: "",
  },
];
