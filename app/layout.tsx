import type { Metadata, Viewport } from "next";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShopDeck Ops Assistant",
  description: "NDR, RTO, and support-ticket tracking for your ShopDeck store",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ShopDeck Ops",
  },
};

export const viewport: Viewport = {
  themeColor: "#5C3A21",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-dvh max-w-md pb-20">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
