import type { Metadata } from "next";

import { NewsCard } from "@/components/NewsCard";
import { postsByTag } from "@/lib/posts";

export const metadata: Metadata = {
  title: "News Archives",
  alternates: { canonical: "/tag/news/" },
};

export default function TagNewsPage() {
  return (
    <main id="wp--skip-link--target" className="ff-main">
      <div className="ff-container">
        <h1 className="ff-archive-title">
          Tag: <span>News</span>
        </h1>
        <div className="ff-news-grid">
          {postsByTag("news").map((post) => (
            <NewsCard key={post.href} post={post} />
          ))}
        </div>
      </div>
    </main>
  );
}
