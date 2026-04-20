import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Savers",
  description: "A quiet place to save the things you find.",
  icons: {
    icon: [
      { url: "/savers-mark.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/savers-mark.svg"],
    apple: ["/savers-mark.svg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
