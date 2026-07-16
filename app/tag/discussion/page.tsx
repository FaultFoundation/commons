import type { Metadata } from "next";

import { NewsCard } from "@/components/NewsCard";
import { postsByTag } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Discussion Archives",
  alternates: { canonical: "/tag/discussion/" },
};

export default function TagDiscussionPage() {
  return (
    <main id="wp--skip-link--target" className="ff-main">
      <div className="ff-container">
        <h1 className="ff-archive-title">
          Tag: <span>Discussion</span>
        </h1>
        <div className="ff-news-grid">
          {postsByTag("discussion").map((post) => (
            <NewsCard key={post.href} post={post} />
          ))}
        </div>
      </div>
    </main>
  );
}
