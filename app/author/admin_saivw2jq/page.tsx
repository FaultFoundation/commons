import type { Metadata } from "next";

import { NewsCard } from "@/components/NewsCard";
import { author, posts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Oscar Labit, Author at The Fault Foundation",
  alternates: { canonical: "/author/admin_saivw2jq/" },
  openGraph: {
    images: ["https://secure.gravatar.com/avatar/7f1c7aec225a2d2b181385551bbea45e1510b8025f9bac9ffe344864fd1f79f3?s=500&d=mm&r=g"],
  },
};

export default function AuthorArchivePage() {
  return (
    <main id="wp--skip-link--target" className="ff-main">
      <div className="ff-container">
        <h1 className="ff-archive-title">
          Author: <span>{author.name}</span>
        </h1>
        <div className="ff-news-grid">
          {posts.map((post) => (
            <NewsCard key={post.href} post={post} />
          ))}
        </div>
      </div>
    </main>
  );
}
