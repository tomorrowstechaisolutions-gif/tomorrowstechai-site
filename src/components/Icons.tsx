/**
 * Shared line-icon set for the 2026 rebrand.
 *
 * All icons are 24x24, stroke-based, and inherit `currentColor` so they recolor
 * with the surrounding text. Sizing is done with the `size` prop (defaults 20).
 * They are decorative by default — `aria-hidden` is set on every one, so give
 * the surrounding element the accessible label.
 */

type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function Svg({
  size = 20,
  className,
  strokeWidth = 1.6,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const IconRocket = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </Svg>
);

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5l6 3.5-6 3.5v-7Z" />
  </Svg>
);

export const IconMonitor = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Svg>
);

export const IconCart = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="20" r="1.4" />
    <circle cx="18" cy="20" r="1.4" />
    <path d="M2 3h3l2.4 12.1a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
  </Svg>
);

export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
    <circle cx="9" cy="7" r="3.2" />
    <path d="M22 20v-1.5a4 4 0 0 0-3-3.85M16.5 4.15a4 4 0 0 1 0 7.7" />
  </Svg>
);

export const IconDashboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="3.5" width="19" height="17" rx="2.5" />
    <path d="M2.5 8h19" />
    <path d="M6.5 12.5v4M10.5 14.5v2M14.5 11v5.5M18 13.5v3" />
  </Svg>
);

export const IconBot = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 8V4.5M9.5 13.5h.01M14.5 13.5h.01M9.5 17h5" />
    <circle cx="12" cy="3" r="1.2" />
  </Svg>
);

export const IconMegaphone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5v3A1.5 1.5 0 0 0 5.5 15H7l10 4.5V5L7 9.5H5.5A1.5 1.5 0 0 0 4 11Z" />
    <path d="M7 15v4.5a1.5 1.5 0 0 0 3 0V16" />
    <path d="M20 9.8a3.5 3.5 0 0 1 0 4.9" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.5 4 5.8v6c0 4.6 3.3 8.5 8 9.7 4.7-1.2 8-5.1 8-9.7v-6L12 2.5Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Svg>
);

export const IconBrain = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5.4a3.4 3.4 0 0 0-6.3-1.1A3 3 0 0 0 3.4 9a3.1 3.1 0 0 0 .8 4.9A3.2 3.2 0 0 0 7 19.6a3.1 3.1 0 0 0 5-1.4" />
    <path d="M12 5.4a3.4 3.4 0 0 1 6.3-1.1A3 3 0 0 1 20.6 9a3.1 3.1 0 0 1-.8 4.9A3.2 3.2 0 0 1 17 19.6a3.1 3.1 0 0 1-5-1.4Z" />
    <path d="M12 5.4v12.8M8.6 8.6c1 .3 1.9.9 2.4 1.8M15.4 12.4c-1 .3-1.9.9-2.4 1.8" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
);

export const IconBrush = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.5 3.5 20.5 8.5 10 19a4 4 0 0 1-5-5L15.5 3.5Z" />
    <path d="m13.5 5.5 5 5M5.5 15.5 3 21l5.5-2.5" />
  </Svg>
);

export const IconCode = (p: IconProps) => (
  <Svg {...p}>
    <path d="m8.5 8-4.5 4 4.5 4M15.5 8l4.5 4-4.5 4M13.5 4.5l-3 15" />
  </Svg>
);

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M11 5.5h2" />
  </Svg>
);

export const IconCpu = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    <path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />
  </Svg>
);

export const IconCloud = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 18.5A4.5 4.5 0 0 1 6 9.6a6 6 0 0 1 11.6 1.6 3.7 3.7 0 0 1-.6 7.3H6.5Z" />
  </Svg>
);

export const IconNetwork = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="4.5" r="2.2" />
    <circle cx="4.5" cy="19" r="2.2" />
    <circle cx="19.5" cy="19" r="2.2" />
    <path d="M12 6.7v4.8M12 11.5 5.6 17M12 11.5 18.4 17" />
  </Svg>
);

export const IconPlug = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 2.5V8M15 2.5V8M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8ZM12 17v4.5" />
  </Svg>
);

export const IconDesktopTower = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="12" height="10" rx="1.5" />
    <path d="M6.5 18h5M9 14v4" />
    <rect x="17" y="4" width="4" height="16" rx="1.2" />
    <path d="M19 7.5v.01M19 10v.01" />
  </Svg>
);

export const IconStar = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3.2 2.7 5.6 6.1.85-4.4 4.3 1.05 6.05L12 17.15 6.55 20l1.05-6.05-4.4-4.3 6.1-.85L12 3.2Z" />
  </Svg>
);

export const IconInfinity = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 8.5a3.5 3.5 0 1 0 0 7c2.8 0 4-3.5 5.5-3.5s2.7 3.5 5.5 3.5a3.5 3.5 0 1 0 0-7c-2.8 0-4 3.5-5.5 3.5S9.3 8.5 6.5 8.5Z" />
  </Svg>
);

export const IconBadgeCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.6 14.3 5l3.2-.3.4 3.2 2.5 2-1.7 2.8 1.7 2.8-2.5 2-.4 3.2-3.2-.3L12 22.4 9.7 20l-3.2.3-.4-3.2-2.5-2L5.3 12 3.6 9.2l2.5-2 .4-3.2L9.7 5 12 2.6Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Svg>
);

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
    <path d="m3 6.5 9 6 9-6" />
  </Svg>
);

export const IconMapPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21.5s7-5.9 7-11.1a7 7 0 1 0-14 0c0 5.2 7 11.1 7 11.1Z" />
    <circle cx="12" cy="10" r="2.6" />
  </Svg>
);

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9 12 3.5Z" />
    <path d="M18.5 16.5 19.2 19l2.3.7-2.3.8-.7 2.3-.7-2.3-2.3-.8 2.3-.7.7-2.5Z" />
  </Svg>
);

export const IconLinkedIn = ({ size = 20, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true" focusable="false">
    <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4v11H3v-11Zm6.5 0h3.8v1.5h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.75v5.7h-4v-5.05c0-1.2-.02-2.75-1.75-2.75-1.75 0-2.02 1.3-2.02 2.66v5.14h-4v-11Z" />
  </svg>
);

export const IconYouTube = ({ size = 20, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true" focusable="false">
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.75 19 12 19 12 19s6.25 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15.1V8.9l5.2 3.1-5.2 3.1Z" />
  </svg>
);

export const IconFacebook = ({ size = 20, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true" focusable="false">
    <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.6c-.29-.04-1.27-.13-2.4-.13-2.38 0-4.01 1.45-4.01 4.12V9.9H7.6V13h2.69v8h3.21Z" />
  </svg>
);

export const IconInstagram = ({ size = 20, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * Intelligence and automation.
 *
 * A brain is the obvious choice and the wrong one: at 18px any line brain
 * turns to mush. A chip with a spark in it is unmistakable at both sizes and
 * says "automation" as well as "clever", which the brain never did.
 */
export const IconAiChip = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="5" width="14" height="14" rx="3.5" />
    <path d="M12 8.6l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1 1-2.4Z" />
    <path d="M9 2.6v2.4M15 2.6v2.4M9 19v2.4M15 19v2.4M2.6 9H5M2.6 15H5M19 9h2.4M19 15h2.4" />
  </Svg>
);

export const IconArticle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3.5h9.5L19 8v12.5H5Z" />
    <path d="M14 3.5V8h5" />
    <path d="M8 12.5h7M8 16h5" />
  </Svg>
);

export const IconHelp = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.8" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.5" />
    <path d="M12 17h.01" />
  </Svg>
);

export const IconChecklist = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 4h7a1.5 1.5 0 0 1 1.5 1.5v14A1.5 1.5 0 0 1 15.5 21h-7A1.5 1.5 0 0 1 7 19.5v-14A1.5 1.5 0 0 1 8.5 4Z" />
    <path d="M9.5 4V2.8h5V4" />
    <path d="m9.8 9.4 1.2 1.2 2.4-2.4M9.8 15.4l1.2 1.2 2.4-2.4" />
  </Svg>
);

/** A guide, with the spark that marks the AI ones. */
export const IconGuide = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 4.6A1.6 1.6 0 0 1 6.1 3h11.4a1.5 1.5 0 0 1 1.5 1.5v16H6.1a1.6 1.6 0 0 1-1.6-1.6Z" />
    <path d="M4.5 17.4H19" />
    <path d="M11.8 6.4 12.8 9l2.6 1-2.6 1-1 2.6-1-2.6L8.2 10l2.6-1 1-2.6Z" />
  </Svg>
);

/** A call, not a handset-shaped slab — legible where IconPhone is not. */
export const IconPhoneCall = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.6 21A12.6 12.6 0 0 1 3 8.4 2.9 2.9 0 0 1 5.9 5.5h1.5a1 1 0 0 1 1 .8l.7 2.9a1 1 0 0 1-.3.95l-1.3 1.2a10.4 10.4 0 0 0 4.6 4.6l1.2-1.3a1 1 0 0 1 .95-.3l2.9.7a1 1 0 0 1 .8 1v1.5A2.9 2.9 0 0 1 15.6 21Z" />
    <path d="M14.5 3.5a6 6 0 0 1 6 6" />
  </Svg>
);
