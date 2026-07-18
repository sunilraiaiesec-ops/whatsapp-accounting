import type { Metadata, Viewport } from "next";

import "./globals.css";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

export const metadata: Metadata = {
  metadataBase: new URL("https://bantoobooks.com"),
  title: {
    default: "BantooBooks — Accounting software for growing businesses",
    template: "%s | BantooBooks",
  },
  description:
    "BantooBooks is accounting, invoicing, and inventory software built for businesses across Africa — with WhatsApp-native bookkeeping and bilingual English/French support.",
  openGraph: {
    type: "website",
    url: "https://bantoobooks.com",
    siteName: "BantooBooks",
    title: "BantooBooks — Accounting software for growing businesses",
    description:
      "BantooBooks is accounting, invoicing, and inventory software built for businesses across Africa — with WhatsApp-native bookkeeping and bilingual English/French support.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3d6b32",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)] antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
