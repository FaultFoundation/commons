"use client";

/**
 * Homepage hero slideshow (embla-carousel). Autoplays every 6s, pauses
 * on hover and keyboard focus, never autoplays under
 * prefers-reduced-motion. Slides come from lib/heroSlides.ts.
 */

import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { HeroSlide } from "@/lib/heroSlides";

function Arrow({ flip }: { flip?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const autoplay = useRef(
    Autoplay({ delay: 6000, stopOnMouseEnter: true, stopOnInteraction: false }),
  );
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    autoplay.current,
  ]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      autoplay.current.stop();
    }
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );

  return (
    <section
      className="ff-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured"
      // Keyboard users get a stable carousel too.
      onFocusCapture={() => autoplay.current.stop()}
    >
      <div className="ff-carousel__viewport" ref={emblaRef}>
        <div className="ff-carousel__slides">
          {slides.map((slide, index) => (
            <div
              key={slide.key}
              className="ff-carousel__slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}`}
            >
              <div className="ff-carousel__media">
                <img
                  src={slide.image.src}
                  width={slide.image.width}
                  height={slide.image.height}
                  srcSet={slide.image.srcSet}
                  sizes={slide.image.sizes}
                  alt={slide.imageAlt}
                  decoding="async"
                  fetchPriority={index === 0 ? "high" : undefined}
                  style={
                    slide.imagePosition
                      ? { objectPosition: slide.imagePosition }
                      : undefined
                  }
                />
              </div>
              <div className="ff-carousel__overlay">
                <h2 className="ff-carousel__title">{slide.title}</h2>
                {slide.tagline && (
                  <p className="ff-carousel__tagline">{slide.tagline}</p>
                )}
                <a
                  className="ff-btn"
                  href={slide.cta.href}
                  {...(slide.cta.external
                    ? { target: "_blank", rel: "noreferrer noopener" }
                    : {})}
                >
                  {slide.cta.label}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="ff-carousel__arrow ff-carousel__arrow--prev"
        aria-label="Previous slide"
        onClick={scrollPrev}
      >
        <Arrow />
      </button>
      <button
        type="button"
        className="ff-carousel__arrow ff-carousel__arrow--next"
        aria-label="Next slide"
        onClick={scrollNext}
      >
        <Arrow flip />
      </button>
      <div className="ff-carousel__dots">
        {slides.map((slide, index) => (
          <button
            key={slide.key}
            type="button"
            className={`ff-carousel__dot${
              index === selected ? " is-active" : ""
            }`}
            aria-label={`Go to slide ${index + 1}`}
            aria-pressed={index === selected}
            onClick={() => scrollTo(index)}
          />
        ))}
      </div>
    </section>
  );
}
