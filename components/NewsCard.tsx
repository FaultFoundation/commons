import type { Post } from "@/lib/posts";
import { tagLabels } from "@/lib/posts";

/**
 * News post card: image, date, title (stretched link — the whole card
 * is clickable), excerpt, tag chips. `featured` renders the wide
 * horizontal variant used for the newest post on the listing page.
 */
export function NewsCard({
  post,
  featured = false,
}: {
  post: Post;
  featured?: boolean;
}) {
  return (
    <article
      className={`ff-card ff-news-card${
        featured ? " ff-news-card--featured" : ""
      }`}
    >
      <div className="ff-news-card__media">
        <img
          src={post.image.src}
          width={post.image.width}
          height={post.image.height}
          srcSet={post.image.srcSet}
          sizes={post.image.sizes}
          alt=""
          decoding="async"
          fetchPriority={featured ? "high" : undefined}
        />
      </div>
      <div className="ff-news-card__body">
        <p className="ff-news-card__date">
          <time dateTime={post.dateISO}>{post.dateDisplay}</time>
        </p>
        <h2 className="ff-news-card__title">
          <a href={post.href}>{post.title}</a>
        </h2>
        <p className="ff-news-card__excerpt">{post.excerpt}</p>
        <div className="ff-news-card__tags">
          {post.tags.map((tag) => (
            <a key={tag} className="ff-chip" href={`/tag/${tag}/`}>
              {tagLabels[tag]}
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}
