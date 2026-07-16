import type { Metadata } from "next";

import { NewsCard } from "@/components/NewsCard";
import { postsByTag } from "@/lib/posts";

export const metadata: Metadata = {
  title: "future Archives",
  alternates: { canonical: "/tag/future/" },
};

export default function TagFuturePage() {
  return (
    <main id="wp--skip-link--target" className="ff-main">
      <div className="ff-container">
        <h1 className="ff-archive-title">
          Tag: <span>future</span>
        </h1>
        <div className="ff-news-grid">
          {postsByTag("future").map((post) => (
            <NewsCard key={post.href} post={post} />
          ))}
        </div>
      </div>
    </main>
  );
}
