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
 * `image` is optional on purpose: until real photography lands in
 * `public/industries/*`, each card renders a coded gradient plate with its icon.
 * Drop a file in and set `image` — nothing else needs to change.
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
  },
  {
    name: "Health & wellness",
    Icon: IconUsers,
    tint: "from-[#1F3352] via-[#0C1728] to-[#04070D]",
  },
  {
    name: "Retail & e-commerce",
    Icon: IconCart,
    tint: "from-[#233A63] via-[#0E1B2F] to-[#04070D]",
  },
  {
    name: "Restaurants & hospitality",
    Icon: IconSparkle,
    tint: "from-[#2A2F63] via-[#12162E] to-[#04070D]",
  },
  {
    name: "Real estate & property",
    Icon: IconMapPin,
    tint: "from-[#1B3B66] via-[#0B1B31] to-[#04070D]",
  },
  {
    name: "Professional services",
    Icon: IconDashboard,
    tint: "from-[#243158] via-[#0F1729] to-[#04070D]",
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
                sizes="232px"
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
