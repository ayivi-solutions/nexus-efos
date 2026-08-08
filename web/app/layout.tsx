import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ContextMenuGuard } from "@/components/ContextMenuGuard";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Nexus EFOS",
  description: "Nexus Operating System for Inclusive Finance",
  // Next.js App Router file-convention icons (app/icon.png, app/apple-icon.png)
  // are picked up automatically without needing an entry here — this block
  // covers what isn't auto-detected: OG/Twitter link-preview cards. Source
  // images are square (the only format supplied); most platforms center-crop
  // gracefully for the wider og:image aspect ratio.
  openGraph: {
    title: "Nexus EFOS",
    description: "Nexus Operating System for Inclusive Finance",
    images: [{ url: "/og-image.png", width: 1200, height: 1200, alt: "Nexus EFOS" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus EFOS",
    description: "Nexus Operating System for Inclusive Finance",
    images: ["/og-image.png"],
  },
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
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
