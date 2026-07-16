import type { Metadata } from "next";

import { NewsCard } from "@/components/NewsCard";
import { posts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "News",
  alternates: { canonical: "/news/" },
  openGraph: {
    description: "News Staying Informed",
  },
};

export default function NewsPage() {
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
            <h1 className="ff-hero__title">News</h1>
            <p className="ff-hero__subtitle">Staying Informed</p>
          </div>
        </section>
      </div>

      <div className="ff-container ff-section--tight">
        <div className="ff-news-grid">
          {posts.map((post, index) => (
            <NewsCard key={post.href} post={post} featured={index === 0} />
          ))}
        </div>
      </div>
    </main>
  );
}
