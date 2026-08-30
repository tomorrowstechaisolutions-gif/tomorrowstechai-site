import type { SVGProps } from "react";

/**
 * The icon set, inline.
 *
 * A dashboard with this many affordances needs about thirty glyphs. Pulling in
 * an icon package for that would add a dependency and ship a tree-shaken bundle
 * bigger than these paths, so they live here as plain SVG on a 24-grid.
 */

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconGrid = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>
);
export const IconSpark = (p: P) => (
  <Svg {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const IconPulse = (p: P) => (
  <Svg {...p}><path d="M3 12h4l3-8 4 16 3-8h4" /></Svg>
);
export const IconUsers = (p: P) => (
  <Svg {...p}><path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3.5" /><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.6a3.5 3.5 0 0 1 0 6.8" /></Svg>
);
export const IconFunnel = (p: P) => (
  <Svg {...p}><path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z" /></Svg>
);
export const IconBriefcase = (p: P) => (
  <Svg {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" /></Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>
);
export const IconCheckSquare = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m8 12 2.5 2.5L16 9" /></Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></Svg>
);
export const IconDollar = (p: P) => (
  <Svg {...p}><path d="M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.8 5 3.3 5 1.4 5 3.4-2.2 3.3-5 3.3-5-1.2-5-3.1" /></Svg>
);
export const IconChart = (p: P) => (
  <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>
);
export const IconRepeat = (p: P) => (
  <Svg {...p}><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></Svg>
);
export const IconGlobe = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" /></Svg>
);
export const IconMegaphone = (p: P) => (
  <Svg {...p}><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" /><path d="M15 8.5a4 4 0 0 1 0 7M18 6a7.5 7.5 0 0 1 0 12" /></Svg>
);
export const IconShare = (p: P) => (
  <Svg {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></Svg>
);
export const IconBell = (p: P) => (
  <Svg {...p}><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z" /><path d="M13.7 20a2 2 0 0 1-3.4 0" /></Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconMenu = (p: P) => (
  <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
);
export const IconArrowRight = (p: P) => (
  <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
);
export const IconArrowUp = (p: P) => (
  <Svg {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>
);
export const IconArrowDown = (p: P) => (
  <Svg {...p}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.4h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></Svg>
);
export const IconServer = (p: P) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></Svg>
);
export const IconSend = (p: P) => (
  <Svg {...p}><path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 10l18-7Z" /></Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 1.9" /></Svg>
);
export const IconPhone = (p: P) => (
  <Svg {...p}><path d="M15.5 21A13.5 13.5 0 0 1 3 8.5 3 3 0 0 1 6 5.5h1.6a1 1 0 0 1 1 .8l.7 3a1 1 0 0 1-.3.95l-1.4 1.3a11 11 0 0 0 5 5l1.3-1.4a1 1 0 0 1 .95-.3l3 .7a1 1 0 0 1 .8 1V18a3 3 0 0 1-3 3Z" /></Svg>
);
export const IconFile = (p: P) => (
  <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></Svg>
);
export const IconLogout = (p: P) => (
  <Svg {...p}><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9" /></Svg>
);
export const IconInbox = (p: P) => (
  <Svg {...p}><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.4 5.5 3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5l-2.4-7.5A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.9 1.5Z" /></Svg>
);
export const IconBot = (p: P) => (
  <Svg {...p}><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M8.5 14h.01M15.5 14h.01M2 13v3M22 13v3" /></Svg>
);
export const IconLayers = (p: P) => (
  <Svg {...p}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5M3 17l9 5 9-5" /></Svg>
);
export const IconSettings = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 14H3a2 2 0 0 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.5V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.3 1Z" /></Svg>
);
export const IconMail = (p: P) => (
  <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>
);
export const IconImage = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></Svg>
);
export const IconCart = (p: P) => (
  <Svg {...p}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h2.5l2.4 12.4a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L21 7H5.2" /></Svg>
);
export const IconZap = (p: P) => (
  <Svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></Svg>
);
export const IconCode = (p: P) => (
  <Svg {...p}><path d="m9 18-6-6 6-6M15 6l6 6-6 6" /></Svg>
);
export const IconPen = (p: P) => (
  <Svg {...p}><path d="M17 3.5a2.1 2.1 0 0 1 3 3L7.5 19 3 20.5 4.5 16 17 3.5Z" /></Svg>
);
export const IconStar = (p: P) => (
  <Svg {...p}><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9L12 2.6Z" /></Svg>
);
export const IconMapPin = (p: P) => (
  <Svg {...p}><path d="M12 21s-7-5.7-7-11a7 7 0 1 1 14 0c0 5.3-7 11-7 11Z" /><circle cx="12" cy="10" r="2.6" /></Svg>
);
export const IconLink = (p: P) => (
  <Svg {...p}><path d="M10.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1.7 1.7" /><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.7-1.7" /></Svg>
);
