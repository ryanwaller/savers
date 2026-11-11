import type { Viewport } from "next";
import RebuildPreview from "./preview";
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
  themeColor: "#fbfaf7",
};

export default function RebuildPage() {
  return <RebuildPreview />;
}
