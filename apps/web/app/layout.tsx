import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuateCalc — מחשבון הצעות מחיר",
  description: "הפקת הצעת מחיר אוטומטית מרשימת חומרים חופשית",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
