import { ThemeControl } from "@/components/theme-control";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import { InstallApp } from "@/components/install-app";
import type { Metadata, Viewport } from "next";
import "./globals.css";
export const viewport: Viewport = { themeColor: "#12345a" };
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  applicationName: "মনে থাকবে",
  appleWebApp: { capable: true, title: "মনে থাকবে", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [
      { url: "/brand/icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  title: "মনে থাকবে — Family Asset & Records",
  description:
    "পরিবারের সবকিছু, এক ঠিকানায়। সম্পদ, সঞ্চয় ও পারিবারিক রেকর্ড গুছিয়ে রাখুন মনে থাকবে-তে।",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        <InstallApp />
        <ThemeControl />
      </body>
    </html>
  );
}

import "./themes.css";
