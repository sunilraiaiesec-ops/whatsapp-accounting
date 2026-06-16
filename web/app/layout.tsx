import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "RR Foods Accounting",
  description: "Dashboard for WhatsApp accounting — RR Foods SARL",
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
