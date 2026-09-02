import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Money Reader — read your bank statement",
  description:
    "Upload a bank statement PDF and see where the money went. The file is read in your browser and never uploaded.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-page text-ink antialiased">{children}</body>
    </html>
  );
}
