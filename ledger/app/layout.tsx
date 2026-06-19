import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bantoo Books",
  description: "Double-entry accounting for your business",
  metadataBase: new URL("https://books.bantoobooks.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
