import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { pressStart2P } from "@/lib/fonts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "StreamCast by Sandschi",
  description: "Advanced broadcast tools for Streamers",
  icons: {
    icon: "/logo.svg",
    apple: "/icon-192.png",
  },
};

export const viewport = {
  themeColor: "#0d0d10",
};

import { AuthProvider } from "@/context/AuthContext";
import { PostHogProvider } from "@/providers/PostHogProvider";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import CookieConsentBanner from "@/components/CookieConsentBanner";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pressStart2P.variable} antialiased`}
      >
        <AuthProvider>
          <PostHogProvider>
            {children}
          </PostHogProvider>
        </AuthProvider>
        <CookieConsentBanner />
        <ServiceWorkerRegister />
        <SpeedInsights />
      </body>
    </html>
  );
}
