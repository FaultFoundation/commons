import type { ReactNode } from "react";

import type { ImageSource } from "@/lib/posts";

type SplitFeatureProps = {
  heading: ReactNode;
  image: ImageSource;
  imageAlt?: string;
  cta?: { label: string; href: string };
  /** Image on the right instead of the left. */
  reverse?: boolean;
  children: ReactNode;
};

/** Floating two-column card: image one side, heading + text the other. */
export function SplitFeature({
  heading,
  image,
  imageAlt = "",
  cta,
  reverse = false,
  children,
}: SplitFeatureProps) {
  return (
    <section
      className={`ff-card ff-split${reverse ? " ff-split--reverse" : ""}`}
    >
      <div className="ff-split__media">
        <img
          src={image.src}
          width={image.width}
          height={image.height}
          srcSet={image.srcSet}
          sizes={image.sizes}
          alt={imageAlt}
          decoding="async"
          style={{ objectFit: "cover" }}
        />
      </div>
      <div className="ff-split__body">
        <h2>{heading}</h2>
        {children}
        {cta && (
          <a className="ff-btn ff-btn--outline" href={cta.href}>
            {cta.label}
          </a>
        )}
      </div>
    </section>
  );
}
