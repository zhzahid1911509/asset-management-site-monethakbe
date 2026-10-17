import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "মনে থাকবে — Family Asset & Records",
  description: "A private workspace for family assets and records.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
