import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus EFOS",
  description: "Nexus Operating System for Inclusive Finance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
