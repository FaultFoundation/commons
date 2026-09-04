import type { CSSProperties } from "react";

import { Markdown } from "@/components/dashboard/tournaments/Markdown";
import type { AboutRow, AboutWidget } from "@/lib/external-tournaments";

// Renders start.gg's About-tab layout faithfully: each row is a CSS grid of its
// own column count (1–3), each column a stack of the organizer's widgets —
// markdown (via our HTML-aware Markdown renderer), images, and video embeds. On
// narrow screens every row collapses to a single column. This is what lets the
// branded view mimic the source instead of flattening everything into one column.

/** Pull a YouTube id from the common URL shapes; null for non-YouTube. */
function youtubeId(url: string): string | null {
  const match =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/.exec(
      url,
    );
  return match ? match[1] : null;
}

function Widget({ widget }: { widget: AboutWidget }) {
  if (widget.type === "md") {
    return (
      <div className="ff-about-md">
        <Markdown source={widget.content} />
      </div>
    );
  }
  if (widget.type === "img") {
    return (
      <a
        className="ff-about-img"
        href={widget.url}
        target="_blank"
        rel="noreferrer noopener"
      >
        <img src={widget.url} alt={widget.caption ?? ""} loading="lazy" />
        {widget.caption ? (
          <span className="ff-about-img__cap">{widget.caption}</span>
        ) : null}
      </a>
    );
  }
  const yt = youtubeId(widget.url);
  if (yt) {
    return (
      <div className="ff-about-video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${yt}`}
          title="Video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }
  // Non-YouTube (Twitch, Drive…): a link rather than a cross-origin embed.
  return (
    <a
      className="ff-btn ff-btn--outline ff-btn--sm"
      href={widget.url}
      target="_blank"
      rel="noreferrer noopener"
    >
      Watch video ↗
    </a>
  );
}

export function AboutLayout({ rows }: { rows: AboutRow[] }) {
  return (
    <div className="ff-about-layout">
      {rows.map((row, rowIndex) => (
        <section key={rowIndex} className="ff-about-section">
          {row.title ? (
            <h3 className="ff-about-section__title">{row.title}</h3>
          ) : null}
          <div
            className="ff-about-row"
            style={{ "--ff-about-cols": row.columns.length } as CSSProperties}
          >
            {row.columns.map((cell, colIndex) => (
              <div key={colIndex} className="ff-about-col">
                {cell.map((widget, widgetIndex) => (
                  <Widget key={widgetIndex} widget={widget} />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
