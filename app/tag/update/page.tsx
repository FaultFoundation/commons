import type { Metadata } from "next";

import { NewsCard } from "@/components/NewsCard";
import { postsByTag } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Update Archives",
  alternates: { canonical: "/tag/update/" },
};

export default function TagUpdatePage() {
  return (
    <main id="wp--skip-link--target" className="ff-main">
      <div className="ff-container">
        <h1 className="ff-archive-title">
          Tag: <span>Update</span>
        </h1>
        <div className="ff-news-grid">
          {postsByTag("update").map((post) => (
            <NewsCard key={post.href} post={post} />
          ))}
        </div>
      </div>
    </main>
  );
}
