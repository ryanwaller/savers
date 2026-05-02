import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Savers Bookmarklet",
  description: "Drag this link to your bookmarks bar to save pages to Savers.",
};

export default function BookmarkletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
