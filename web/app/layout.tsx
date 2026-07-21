import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ContextMenuGuard } from "@/components/ContextMenuGuard";

export const metadata: Metadata = {
  title: "Nexus EFOS",
  description: "Nexus Operating System for Inclusive Finance",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ContextMenuGuard />
        {children}
      </body>
    </html>
  );
}
