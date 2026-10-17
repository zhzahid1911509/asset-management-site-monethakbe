import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
