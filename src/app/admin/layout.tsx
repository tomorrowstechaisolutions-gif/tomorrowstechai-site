import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Center",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="ad-root">{children}</div>;
}
