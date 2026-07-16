/**
 * Single source of truth for news-post metadata, shared by the news
 * listing, tag archives, and author archive. All values are lifted
 * verbatim from the article pages / original WP markup — the article
 * detail pages themselves are still hand-ported and unchanged.
 */

export type ImageSource = {
  src: string;
  width: number;
  height: number;
  srcSet?: string;
  sizes?: string;
};

export type TagSlug = "discussion" | "future" | "news" | "update";

export type Post = {
  href: string;
  title: string;
  /** Exact dateTime attribute from the original markup. */
  dateISO: string;
  dateDisplay: string;
  image: ImageSource;
  /** Verbatim WP-generated excerpt (= the page's og:description). */
  excerpt: string;
  tags: TagSlug[];
};

/** Rendered tag labels exactly as they appear on the live site. */
export const tagLabels: Record<TagSlug, string> = {
  discussion: "Discussion",
  future: "future",
  news: "News",
  update: "Update",
};

export const author = {
  name: "Oscar Labit",
  path: "/author/admin_saivw2jq/",
};

/** Newest first. */
export const posts: Post[] = [
  {
    href: "/2026/01/community-verification/",
    title: "Community Verification",
    dateISO: "2026-01-15T00:55:08-04:00",
    dateDisplay: "January 15, 2026",
    image: {
      src: "/wp-content/uploads/2026/01/Community-Verification.png",
      width: 1280,
      height: 720,
      srcSet:
        "/wp-content/uploads/2026/01/Community-Verification.png 1280w, /wp-content/uploads/2026/01/Community-Verification-300x169.png 300w, /wp-content/uploads/2026/01/Community-Verification-1024x576.png 1024w, /wp-content/uploads/2026/01/Community-Verification-768x432.png 768w",
      sizes: "(max-width: 1280px) 100vw, 1280px",
    },
    excerpt:
      "Hello everyone! We’re glad you’re interested in the Fault Foundation Discord community. This short post explains more information regarding the verification process. Protection To keep our community safe and minimize spam or abuse, you’ll notice new accounts have limited access to the channels within the “Public” category. We’ve decided to add this barrier to protect […]",
    tags: ["discussion"],
  },
  {
    href: "/2025/12/discord-and-sharing-personal-information/",
    title: "Discord and Sharing Personal Information",
    dateISO: "2025-12-03T13:46:54-04:00",
    dateDisplay: "December 3, 2025",
    image: {
      src: "/wp-content/uploads/2025/12/Discord-and-Sharing-Personal-Information.png",
      width: 1280,
      height: 720,
      srcSet:
        "/wp-content/uploads/2025/12/Discord-and-Sharing-Personal-Information.png 1280w, /wp-content/uploads/2025/12/Discord-and-Sharing-Personal-Information-300x169.png 300w, /wp-content/uploads/2025/12/Discord-and-Sharing-Personal-Information-1024x576.png 1024w, /wp-content/uploads/2025/12/Discord-and-Sharing-Personal-Information-768x432.png 768w",
      sizes: "(max-width: 1280px) 100vw, 1280px",
    },
    excerpt:
      "Privacy is a sensitive topic. We’ve heard concerns from some members about sharing personal information through our verification process, and we want to address those concerns directly and honestly. We’re trying to work with and provide a service to people, not users. That distinction matters to us. Users are metrics on a dashboard. People are individuals with concerns, […]",
    tags: ["discussion", "update"],
  },
  {
    href: "/2025/11/the-fault-foundation-who-we-are-and-whats-next/",
    title: "The Fault Foundation: Who We Are and What’s Next",
    dateISO: "2025-11-29T21:01:32-04:00",
    dateDisplay: "November 29, 2025",
    image: {
      src: "/wp-content/uploads/2025/11/IMG_1875-scaled.jpg",
      width: 2560,
      height: 1920,
      srcSet:
        "/wp-content/uploads/2025/11/IMG_1875-scaled.jpg 2560w, /wp-content/uploads/2025/11/IMG_1875-300x225.jpg 300w, /wp-content/uploads/2025/11/IMG_1875-1024x768.jpg 1024w, /wp-content/uploads/2025/11/IMG_1875-768x576.jpg 768w, /wp-content/uploads/2025/11/IMG_1875-1536x1152.jpg 1536w, /wp-content/uploads/2025/11/IMG_1875-2048x1536.jpg 2048w",
      sizes: "(max-width: 2560px) 100vw, 2560px",
    },
    excerpt:
      "We believe the best way to start is with a proper introduction. In this post, we’ll cover who we are, the dedicated team behind the scenes, and the exciting work we have planned for the near future. The Fault Foundation The Fault Foundation was established in July 2025 by five founding members who wanted to […]",
    tags: ["future", "news", "update"],
  },
];

export const postsByTag = (tag: TagSlug): Post[] =>
  posts.filter((post) => post.tags.includes(tag));
