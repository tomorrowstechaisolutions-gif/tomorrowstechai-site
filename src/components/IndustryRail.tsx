"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconBrush,
  IconCart,
  IconChevronLeft,
  IconChevronRight,
  IconDashboard,
  IconMapPin,
  IconSparkle,
  IconUsers,
} from "./Icons";

/**
 * Industry cards.
 *
 * `image` stays optional: a card with no art falls back to its coded gradient
 * plate, so a seventh industry can be added before its photograph exists.
 *
 * The art in `public/industries/*` is 700x933 WebP — 3x the 232px card at its
 * widest, and 434 KB for all six together, down from 12 MB of source PNG. The
 * `.tt-industry::after` gradient over the top is what keeps the label legible;
 * every one of these was shot with a quiet bottom third for exactly that.
 */
const INDUSTRIES: {
  name: string;
  Icon: typeof IconBrush;
  tint: string;
  image?: string;
}[] = [
  {
    name: "Contractors & home services",
    Icon: IconBrush,
    tint: "from-[#1E3A5F] via-[#0D1A2E] to-[#04070D]",
    image: "/industries/contractors-home-services.webp",
  },
  {
    name: "Health & wellness",
    Icon: IconUsers,
    tint: "from-[#1F3352] via-[#0C1728] to-[#04070D]",
    image: "/industries/health-wellness.webp",
  },
  {
    name: "Retail & e-commerce",
    Icon: IconCart,
    tint: "from-[#233A63] via-[#0E1B2F] to-[#04070D]",
    image: "/industries/retail-ecommerce.webp",
  },
  {
    name: "Restaurants & hospitality",
    Icon: IconSparkle,
    tint: "from-[#2A2F63] via-[#12162E] to-[#04070D]",
    image: "/industries/restaurants-hospitality.webp",
  },
  {
    name: "Real estate & property",
    Icon: IconMapPin,
    tint: "from-[#1B3B66] via-[#0B1B31] to-[#04070D]",
    image: "/industries/real-estate-property.webp",
  },
  {
    name: "Professional services",
    Icon: IconDashboard,
    tint: "from-[#243158] via-[#0F1729] to-[#04070D]",
    image: "/industries/professional-services.webp",
  },
];

export function IndustryRail() {
  const railRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [sync]);

  const nudge = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.7), behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div ref={railRef} onScroll={sync} className="tt-rail">
        {INDUSTRIES.map(({ name, Icon, tint, image }) => (
          <Link key={name} href="/contact" className="tt-industry group" data-spotlight>
            {image ? (
              <Image
                src={image}
                alt=""
                fill
                sizes="(max-width: 860px) 27vw, 232px"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
              />
            ) : (
              <div className={`absolute inset-0 bg-gradient-to-br ${tint}`} />
            )}
            <div className="tt-industry-body">
              <span className="tt-icon-tile mx-auto mb-3">
                <Icon size={20} />
              </span>
              <strong>{name}</strong>
            </div>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 mt-5">
        <button
          type="button"
          onClick={() => nudge(-1)}
          disabled={atStart}
          aria-label="Previous industries"
          className="tt-rail-btn disabled:opacity-35 disabled:pointer-events-none"
        >
          <IconChevronLeft size={17} />
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          disabled={atEnd}
          aria-label="More industries"
          className="tt-rail-btn disabled:opacity-35 disabled:pointer-events-none"
        >
          <IconChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
