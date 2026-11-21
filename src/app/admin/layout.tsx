import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "Admin Center",
  robots: { index: false, follow: false, nocache: true },
  // Added to a phone's Home Screen from any admin page, the icon opens the admin, not the public site.
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "TTAI Admin", statusBarStyle: "black-translucent" },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="ad-root">{children}</div>;
}
