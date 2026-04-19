import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Savers",
  description: "A quiet place to save the things you find.",
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
