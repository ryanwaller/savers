import type { Viewport } from "next";
import RebuildPreview from "./preview";
import { loadBookmarkSeed } from "./bookmark-seed";
import { realCollections } from "./real-collections";
import "./rebuild.css";

export const metadata = {
  title: "Savers — rebuild preview",
  description: "An interactive preview of the next Savers experience.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#f8f8f8",
};

export const dynamic = "force-dynamic";

export default function RebuildPage() {
  return <RebuildPreview seedCollections={realCollections} seedCards={loadBookmarkSeed()} />;
}
